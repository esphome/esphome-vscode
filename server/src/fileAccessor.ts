import { TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as path from "path";
import * as vscodeUri from "vscode-uri";

export interface FileAccessor {
  checkPathExists(uri: string): Promise<boolean>;
  getFileContents(fileName: string): Promise<string>;
  getFilesInFolder(subFolder: string): string[];
  getFilesInFolderRelativeFrom(
    subFolder: string,
    relativeFrom: string
  ): string[];
  getFilesInFolderRelativeFromAsFileUri(
    subFolder: string,
    relativeFrom: string
  ): string[];
  getRelativePath(relativeFrom: string, filename: string): string;
  getRelativePathAsFileUri(relativeFrom: string, filename: string): string;
}

export class VsCodeFileAccessor implements FileAccessor {
  private ourRoot: string;

  constructor(
    private workspaceFolder: string | null,
    private documents: TextDocuments<TextDocument>
  ) {
    this.ourRoot = path.resolve();
  }
  async checkPathExists(uri: string): Promise<boolean> {
    const fsPath = vscodeUri.URI.parse(uri).fsPath;
    return new Promise<boolean>((c) => {
      fs.exists(fsPath, (exists) => {
        c(exists);
      });
    });
  }

  public async getFileContents(uri: string): Promise<string> {
    const textDocument = this.documents.get(uri);
    if (textDocument) {
      // open file in editor, might not be saved yet
      return textDocument.getText();
    }
    const fsPath = vscodeUri.URI.parse(uri).fsPath;
    return new Promise<string>((c, e) => {
      fs.exists(fsPath, (exists) => {
        if (!exists) {
          e('File does not exist');
        }
        fs.readFile(fsPath, { encoding: "utf-8" }, (err, result) => {
          if (err) {
            e(err);
          } else {
            c(result);
          }
        });
      });
    });
  }

  public getFilesInFolder(
    subFolder: string,
    file_list: string[] = []
  ): string[] {
    subFolder = path.normalize(subFolder);

    try {
      fs.readdirSync(subFolder).forEach((file) => {
        file_list = fs.statSync(path.join(subFolder, file)).isDirectory()
          ? this.getFilesInFolder(path.join(subFolder, file), file_list)
          : file_list.concat(path.join(subFolder, file));
      });
    } catch (err) {
      console.log(`Cannot find the files in folder ${subFolder}`);
    }
    return file_list;
  }

  private dealtWithRelativeFrom = (relativeFrom: string): string => {
    if (relativeFrom.startsWith("file://")) {
      relativeFrom = vscodeUri.URI.parse(relativeFrom).fsPath;
    } else {
      if (!relativeFrom.startsWith(this.ourRoot)) {
        relativeFrom = path.resolve(relativeFrom);
      }
      relativeFrom = vscodeUri.URI.file(relativeFrom).fsPath;
    }
    return relativeFrom;
  }

  public getFilesInFolderRelativeFrom(
    subFolder: string,
    relativeFrom: string
  ): string[] {
    relativeFrom = this.dealtWithRelativeFrom(relativeFrom);

    const dirOfFile = path.dirname(relativeFrom);
    subFolder = path.join(dirOfFile, subFolder);
    return this.getFilesInFolder(subFolder);
  }

  public getFilesInFolderRelativeFromAsFileUri(
    subFolder: string,
    relativeFrom: string
  ): string[] {
    const files = this.getFilesInFolderRelativeFrom(subFolder, relativeFrom);
    return files.map((f) => vscodeUri.URI.file(f).toString());
  }

  public getRelativePath = (relativeFrom: string, filename: string): string => {
    relativeFrom = this.dealtWithRelativeFrom(relativeFrom);

    const dirOfFile = path.dirname(relativeFrom);
    const joinedPath = path.join(dirOfFile, filename);

    return joinedPath;
  }

  public getRelativePathAsFileUri = (
    relativeFrom: string,
    filename: string
  ): string => {
    return vscodeUri.URI.file(
      this.getRelativePath(relativeFrom, filename)
    ).toString();
  }
}
