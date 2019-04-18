import * as vscode from 'vscode';

import * as WebSocket from "ws";

// This code is bad (I don't know typescript, and hate js :D)
// It's only a very crude prototype, please do change the architecture where necessary.

class EsphomeRange {
	public document!: string;
	public start_line!: number;
	public start_col!: number;
	public end_line!: number;
	public end_col!: number;
}

class ValidationError {
	public range!: EsphomeRange | null;
	public message!: string;
}

export default class EsphomeProvider {
	private diagnosticCollection!: vscode.DiagnosticCollection;
	private ws!: WebSocket;

	public activate(subscriptions: vscode.Disposable[]) {
		subscriptions.push(this);
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection();

		// TODO: Make config option
		this.ws = new WebSocket("ws://localhost:6052/vscode");

		// TODO: Open dynamically, re-open when connection lost etc.
		this.ws.on('open', () => {
			console.log("Websocket Open!");
			const msg = JSON.stringify({type: 'spawn'});
      		this.ws.send(msg);
		});
		this.ws.on('message', (data) => {
			const raw = JSON.parse(data.toString());
			console.log(raw);
			const msg = JSON.parse(raw.data);
			switch (msg.type) {
				case 'read_file': {
					console.log(`Got read_file message ${msg.path}`);
					const uri = vscode.Uri.file(msg.path);
					vscode.workspace.openTextDocument(uri).then((document) => {
						let text = document.getText();
						this.sendWsMsg({
							type: 'file_response',
							content: text,
						});
					});
					break;
				}
				case 'result': {
					console.log(`Got result message`);
					console.log(msg);
					let diagnostics: vscode.Diagnostic[] = [];
					let openDocument = vscode.window.activeTextEditor.document;
					msg.validation_errors.forEach( (error: ValidationError) => {
						let message = error.message;
						let range;
						if (error.range === null) {
							range = new vscode.Range(0, 0, openDocument.lineCount-1, 0);
						} else {
							// Todo: Use error.range.document to add it to the correct diagnostics collection
							range = new vscode.Range(error.range.start_line, error.range.start_col, error.range.end_line, error.range.end_col);
						}
						let diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
						diagnostics.push(diagnostic);
					});
					this.diagnosticCollection.set(openDocument.uri, diagnostics);
					break;
				}
				default: {
					console.log(`Got unknown message type`);
					console.log(msg);
					break;
				}
			}
		});

		vscode.workspace.onDidOpenTextDocument(this.doLint, this, subscriptions);
		vscode.workspace.onDidSaveTextDocument(this.doLint, this);
		// TODO: Activate linting when changing
		// Currently this causes issues because the client is not implemented
		// thread-safe
		//vscode.workspace.onDidChangeTextDocument((evt) => {
		//	this.doLint(evt.document);
		//}, this);

		// vscode.workspace.textDocuments.forEach(this.doLint, this);
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
	}

	private sendWsMsg(data: any): void {
		// Check if WS is open, otherwise ignore
		if (this.ws.readyState !== 1) {
			return;
		}
		let send = JSON.stringify({
			type: 'stdin',
			data: JSON.stringify(data)+'\n',
		});
		console.log(`Sending ${send}`);
		this.ws.send(send);
	}


	private doLint(textDocument: vscode.TextDocument) {
		// Only lint for YAML
		if (textDocument.languageId !== 'yaml') {
			return;
		}

		// TODO: The open file may not be the file we want to validate
		// For example when editing an !included file.
		console.log(`Validating ${textDocument.fileName}`);
		this.sendWsMsg({
			type: 'validate',
			file: textDocument.fileName
		});
	}
}

export function activate(ctx: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "esphome-vscode" is now active!');

	let linter = new EsphomeProvider();
	linter.activate(ctx.subscriptions);
}

export function deactivate() {}
