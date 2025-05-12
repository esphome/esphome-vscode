import { Diagnostic, Range } from "vscode-languageserver-protocol";
import { TextDocumentChangeEvent } from "vscode-languageserver";
import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";
import { ESPHomeConnection } from "./ESPHomeConnection";
import {
  MessageTypes,
  MESSAGE_FILE_RESPONSE,
  MESSAGE_READ_FILE,
  MESSAGE_RESULT,
  ValidationError as ESPHomeValidationError,
  YamlValidationError,
} from "./esphome_types";
import { FileAccessor } from "./fileAccessor";
import * as vscodeUri from "vscode-uri";
import path = require("path");

export class Validation {
  lastRequest!: Date;
  constructor(
    private fileAccessor: FileAccessor,
    private connection: ESPHomeConnection,
    private sendDiagnostics: (
      fileUri: string,
      diagnostics: Diagnostic[],
    ) => void,
  ) {
    connection.onResponse((m) => this.handleESPHomeMessage(m));
  }

  private diagnosticCollection: Map<string, Diagnostic[]> = new Map<
    string,
    Diagnostic[]
  >();

  private addError(uri: DocumentUri, range: Range, message: string) {
    //console.log(`diag error: ${message} to ${uri}`);
    let diagnostics = this.diagnosticCollection.get(uri) || [];
    const diagnostic = Diagnostic.create(range, message);
    diagnostics = [...diagnostics, diagnostic];
    this.diagnosticCollection.set(uri, diagnostics);
  }

  private addIncludeFile(file: string, included: string) {
    var includes = this.includedFiles[file] || [];
    if (includes.indexOf(included) === -1) {
      includes.push(included);
      this.includedFiles[file] = includes;
    }
  }

  private handleEsphomeError(error: ESPHomeValidationError) {
    const message = error.message;

    if (error.range !== null) {
      this.addError(
        this.getUriStringForValidationPath(error.range.document),
        Range.create(
          error.range.start_line,
          error.range.start_col,
          error.range.end_line,
          error.range.end_col,
        ),
        message,
      );
    } else {
      this.addError(this.validating_uri!, Range.create(1, 0, 1, 2), message);
    }
  }

  private handleYamlError(error: YamlValidationError) {
    let skip = 3;
    let message = "";
    error.message.split("\n").forEach((line: string) => {
      if (--skip > 0) {
        return;
      }
      if (message === "") {
        message = line;
      } else {
        let location = line.match(/in "([^"]*)", line (\d*), column (\d*):/);
        if (location) {
          const uri = this.getUriStringForValidationPath(location[1]);
          const line_number = parseInt(location[2]) - 1;
          const col_number = parseInt(location[3]) - 1;
          const range = Range.create(
            line_number,
            col_number,
            line_number,
            col_number + 1,
          );

          this.addError(uri, range, message);
        } else {
          console.log("unknown location " + line + " -- " + location);
        }
        message = "";
        skip = 3;
      }
    });
  }

  private getUriStringForValidationPath(file_path: string) {
    const absolute_path = path.isAbsolute(file_path)
      ? file_path
      : this.fileAccessor.getRelativePath(
          vscodeUri.URI.parse(this.validating_uri!).fsPath,
          file_path,
        );
    const uri_string = vscodeUri.URI.file(absolute_path).toString();
    return uri_string;
  }

  private async handleESPHomeMessage(msg: MessageTypes): Promise<void> {
    try {
      switch (msg.type) {
        case MESSAGE_READ_FILE: {
          const uri = this.getUriStringForValidationPath(msg.path);

          if (uri !== this.validating_uri) {
            // Track this as an included file, so when the user edits this file
            // we know it's and included file and a validation on the master yaml should be executed instead
            this.addIncludeFile(this.validating_uri!, uri);
            // This file is validated indirectly, if it had errors then they must be cleared
            this.diagnosticCollection.set(uri, []);
          }
          try {
            const docText = await this.fileAccessor.getFileContents(uri);
            this.connection.sendMessage({
              type: MESSAGE_FILE_RESPONSE,
              content: docText,
            });
          } catch (e) {
            // won't validate as an include file is missing
            this.addError(
              this.validating_uri!,
              Range.create(0, 0, 1, 0),
              `Could not open '${msg.path}': ${e}`,
            );
            this.connection.sendMessage({
              type: "file_response",
              content: "",
            });
          }

          break;
        }
        case MESSAGE_RESULT: {
          msg.validation_errors.forEach((e) => this.handleEsphomeError(e));
          msg.yaml_errors.forEach((e) => this.handleYamlError(e));

          this.diagnosticCollection.forEach((diagnostics, uri) =>
            this.sendDiagnostics(uri, diagnostics),
          );

          this.validating_uri = null;
          //this.validateNext();
          break;
        }
        case "check_directory_exists": {
          const uri = vscodeUri.URI.file(msg.path).toString();
          const pathExists = await this.fileAccessor.checkPathExists(uri);

          this.connection.sendMessage({
            type: "directory_exists_response",
            content: pathExists,
          });
          break;
        }
        case "check_file_exists": {
          const uri = vscodeUri.URI.file(msg.path).toString();
          const fileExists = await this.fileAccessor.checkPathExists(uri);

          this.connection.sendMessage({
            type: "file_exists_response",
            content: fileExists,
          });
          break;
        }
        default: {
          console.log(`Got unknown message type`, msg);
          break;
        }
      }
    } catch (e) {
      console.log("Income message error: " + e);
      this.validating_uri = null;
    }
  }

  private validating_uri: string | null = null;
  private includedFiles: { [id: string]: string[] } = {};

  onDocumentChange(e: TextDocumentChangeEvent<TextDocument>): void {
    try {
      if (vscodeUri.URI.parse(e.document.uri).path.endsWith("secrets.yaml")) {
        // don't validate secrets
        return;
      }
      if (this.validating_uri !== null) {
        const lastRequestElapsedTime =
          new Date().getTime() - this.lastRequest.getTime();
        // 10 seconds without response
        if (lastRequestElapsedTime < 10000) {
          return;
        }
        console.log(
          "Timeout waiting for previous validation to complete. Discarding.",
        );
      }
      this.validating_uri = e.document.uri;
      this.diagnosticCollection.clear();
      this.diagnosticCollection.set(this.validating_uri, []);
      const uri = this.validating_uri;
      // Check if this is an included file
      // console.log(`this file path: ${uri}`);
      for (let key in this.includedFiles) {
        // TODO: When an included file is in turn included, this should call the top most file, not the next one.
        // console.log(`testing included files in: ${key} files: ${this.includedFiles[key]}`);
        if (this.includedFiles[key].indexOf(uri) >= 0) {
          this.validating_uri = key;
          // console.log(`Not validating ${uri} as is listed as included file. Validating containing document ${key} instead`);
        }
      }

      console.log(`Validating ${this.validating_uri}`);
      this.lastRequest = new Date();
      this.connection.sendMessage({
        type: "validate",
        file: vscodeUri.URI.parse(this.validating_uri).fsPath,
      });
    } catch (e) {
      console.log(e);
      this.validating_uri = null;
    }
  }
}
