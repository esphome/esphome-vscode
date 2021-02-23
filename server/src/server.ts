import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	TextDocumentSyncKind,
	InitializeResult
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { Validation } from './Validation';
import { ESPHomeLocalConnection } from './EsphomeLocalConnection';
import { VsCodeFileAccessor } from './fileAccessor';
import { HoverCompletion } from './HoverCompletion';
import { ESPHomeConnectionSource } from "./ESPHomeConnectionSource";
import { ESPHomeSettings } from './ESPHomeSettings';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

console.log = connection.console.log.bind(connection.console);
console.warn = connection.window.showWarningMessage.bind(connection.window);
console.error = connection.window.showErrorMessage.bind(connection.window);

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

const sendDiagnostics = (uri: string, diagnostics: Diagnostic[]) => {
	connection.sendDiagnostics({
		uri,
		diagnostics,
	});
};
let fileAccessor: VsCodeFileAccessor;

const esphomeConnection = new ESPHomeConnectionSource()

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
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}


	fileAccessor = new VsCodeFileAccessor(params.rootUri, documents);

	result.capabilities.hoverProvider = true;
	return result;
});

connection.onInitialized(async () => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}


	const config = await getSettings();

	esphomeConnection.configure(config);


	const validation = new Validation(
		fileAccessor,
		esphomeConnection,
		sendDiagnostics
	);

	documents.onDidChangeContent((e) =>
		validation.onDocumentChange(e)
	);


	const completion = new HoverCompletion();

	connection.onCompletion((p) =>
		completion.onCompletion(
			documents.get(p.textDocument.uri)!,
			p.position
		)
	);

	// connection.onCompletionResolve((p) =>
	// 	completion.onCompletionResolve(p)
	// );

	connection.onHover((p) =>
		completion.onHover(
			documents.get(p.textDocument.uri)!,
			p.position
		)
	);
});

function getSettings(): Thenable<ESPHomeSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	const result = connection.workspace.getConfiguration({
		scopeUri: '.',
		section: 'esphome'
	});

	return result;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ESPHomeSettings = { validator: 'local' };
let globalSettings: ESPHomeSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ESPHomeSettings>> = new Map();

connection.onDidChangeConfiguration(async change => {
	if (hasConfigurationCapability) {
		esphomeConnection.configure(await getSettings());
	} else {
		globalSettings = <ESPHomeSettings>(
			(change.settings.esphome || defaultSettings)
		);
	}


});

function getDocumentSettings(resource: string): Thenable<ESPHomeSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'esphome'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents, and clear diagnostics.
documents.onDidClose(e => {
	sendDiagnostics(e.document.uri, []);
	documentSettings.delete(e.document.uri);
});

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// // This handler provides the initial list of the completion items.
// connection.onCompletion(
// 	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
// 		// The pass parameter contains the position of the text document in
// 		// which code complete got requested. For the example we ignore this
// 		// info and always provide the same completion items.
// 		return [
// 			{
// 				label: 'TypeScript',
// 				kind: CompletionItemKind.Text,
// 				data: 1
// 			},
// 			{
// 				label: 'JavaScript',
// 				kind: CompletionItemKind.Text,
// 				data: 2
// 			}
// 		];
// 	}
// );

// // This handler resolves additional information for the item selected in
// // the completion list.
// connection.onCompletionResolve(
// 	(item: CompletionItem): CompletionItem => {
// 		if (item.data === 1) {
// 			item.detail = 'TypeScript details';
// 			item.documentation = 'TypeScript documentation';
// 		} else if (item.data === 2) {
// 			item.detail = 'JavaScript details';
// 			item.documentation = 'JavaScript documentation';
// 		}
// 		return item;
// 	}
// );

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

