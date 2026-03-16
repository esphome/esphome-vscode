import {
  createConnection,
  TextDocuments,
  Diagnostic,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { Validation } from "./validation";
import { VsCodeFileAccessor } from "./file-accessor";
import { ESPHomeConnectionSource } from "./connection-source";
import { ESPHomeSettings } from "./settings";
import { HoverHandler } from "./hover-handler";
import { ESPHomeDocuments } from "./esphome-document";
import { TextBuffer } from "./utils/text-buffer";
import { CompletionsHandler } from "./completions-handler";
import { DefinitionHandler } from "./definition-handler";
import { DocumentSymbolHandler } from "./document-symbol-handler";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

console.log = connection.console.log.bind(connection.console);
console.warn = connection.window.showWarningMessage.bind(connection.window);
console.error = connection.window.showErrorMessage.bind(connection.window);

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const esphomeDocuments: ESPHomeDocuments = new ESPHomeDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;

const sendDiagnostics = (uri: string, diagnostics: Diagnostic[]) => {
  connection.sendDiagnostics({
    uri,
    diagnostics,
  });
};
let fileAccessor: VsCodeFileAccessor;

const esphomeConnection = new ESPHomeConnectionSource();
let pythonPath = "";

connection.onInitialize((params: InitializeParams) => {
  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: false,
      },
      hoverProvider: {
        workDoneProgress: false,
      },
      definitionProvider: true,
      documentSymbolProvider: true,
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  fileAccessor = new VsCodeFileAccessor(documents);
  pythonPath = params.initializationOptions?.pythonPath;

  return result;
});

connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined,
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }

  esphomeConnection.configure(await getSettings());

  const validation = new Validation(
    fileAccessor,
    esphomeConnection,
    sendDiagnostics,
  );

  documents.onDidOpen((e) => validation.onDocumentChange(e));

  documents.onDidChangeContent((e) => validation.onDocumentChange(e));
});

const completionHandler = new CompletionsHandler(esphomeDocuments);
connection.onCompletion((p) => {
  const doc = documents.get(p.textDocument.uri);
  if (!doc) return;
  esphomeDocuments.update(p.textDocument.uri, new TextBuffer(doc));
  return completionHandler.getCompletions(p.textDocument.uri, p.position);
});

const hoverHandler = new HoverHandler(esphomeDocuments);
connection.onHover((p) => {
  const doc = documents.get(p.textDocument.uri);
  if (!doc) return;
  esphomeDocuments.update(p.textDocument.uri, new TextBuffer(doc));
  return hoverHandler.getHover(p.textDocument.uri, p.position);
});
const definitionHandler = new DefinitionHandler(esphomeDocuments);
connection.onDefinition((p) => {
  const doc = documents.get(p.textDocument.uri);
  if (!doc) return;
  esphomeDocuments.update(p.textDocument.uri, new TextBuffer(doc));
  return definitionHandler.getDefinition(p.textDocument.uri, p.position);
});

const documentSymbolHandler = new DocumentSymbolHandler(esphomeDocuments);
connection.onDocumentSymbol((p) => {
  const doc = documents.get(p.textDocument.uri);
  if (!doc) return;
  esphomeDocuments.update(p.textDocument.uri, new TextBuffer(doc));
  return documentSymbolHandler.getDocumentSymbols(p.textDocument.uri);
});

async function getSettings(): Promise<ESPHomeSettings> {
  let settings = !hasConfigurationCapability
    ? globalSettings
    : await connection.workspace.getConfiguration({
        scopeUri: ".",
        section: "esphome",
      });

  return { ...settings, pythonPath };
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ESPHomeSettings = { validator: "local" };
let globalSettings: ESPHomeSettings = defaultSettings;

connection.onDidChangeConfiguration(async (change) => {
  esphomeConnection.configure(await getSettings());
});

// Only keep settings for open documents, and clear diagnostics.
documents.onDidClose((e) => {
  sendDiagnostics(e.document.uri, []);
});

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  // connection.console.log('We received an file change event');
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
