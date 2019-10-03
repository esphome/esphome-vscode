import * as vscode from 'vscode';

import * as WebSocket from "ws";

import * as ChildProcess from "child_process";

// This code is bad (I don't know typescript, and hate js :D)
// It's only a very crude prototype, please do change the architecture where necessary.

interface EsphomeRange {
	document: string;
	start_line: number;
	start_col: number;
	end_line: number;
	end_col: number;
}

interface ValidationError {
	range: EsphomeRange | null;
	message: string;
}

const MESSAGE_READ_FILE = 'read_file';
const MESSAGE_RESULT = 'result';

interface MessageReadFile {
	type: typeof MESSAGE_READ_FILE;
	path: string;
}

interface YamlValidationError {
	message: string;
}

interface MessageResult {
	type: typeof MESSAGE_RESULT;
	validation_errors: ValidationError[];
	yaml_errors: YamlValidationError[];
}

type MessageTypes = MessageReadFile | MessageResult;

export default class EsphomeProvider {
	private output_channel !: vscode.OutputChannel;

	private useWs = false; // if false use local esphome
	private validating: string | null = null;


	private diagnosticCollection!: vscode.DiagnosticCollection;
	private ws!: WebSocket;
	private process!: ChildProcess.ChildProcess;

	private handleMessage(msg: MessageTypes) {
		switch (msg.type) {
			case 'read_file': {
				console.log(`Got read_file message ${msg.path}`);
				const uri = vscode.Uri.file(msg.path);
				vscode.workspace.openTextDocument(uri).then((document) => {
					let text = document.getText();
					this.sendMsg({
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
				let openDocument = vscode.window.activeTextEditor!.document;
				msg.validation_errors.forEach((error) => {
					let message = error.message;
					let range;
					if (error.range === null) {
						range = new vscode.Range(0, 0, openDocument.lineCount - 1, 0);
					} else {
						// Todo: Use error.range.document to add it to the correct diagnostics collection
						range = new vscode.Range(error.range.start_line, error.range.start_col, error.range.end_line, error.range.end_col);
					}
					let diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
					diagnostics.push(diagnostic);
				});
				msg.yaml_errors.forEach((error) => {
					let message = error.message;
					// Todo: Use error.range.document to add it to the correct diagnostics collection

					let skip = 3;
					let parse_error = '';
					message.split('\n').forEach(line => {
						console.log(`- ${skip} : ${line}`);
						if (--skip > 0) {
							return;
						}
						if (parse_error === '') {
							parse_error = line;
							console.log('got error ' + line);
						}
						else
						{
							console.log('adding diag ' + line);
							let location = line.match(/in "([^"]*)", line (\d*), column (\d*):/);
							if (location)
							{
								let line_number = parseInt(location[2]) - 1;
								let col_number = parseInt(location[3]) - 1;
								console.log(`parsed loc: ${location[1]}:${col_number}`);
								let range = new vscode.Range(line_number, col_number, line_number, col_number + 1);
								let diagnostic = new vscode.Diagnostic(range, parse_error, vscode.DiagnosticSeverity.Error);
								diagnostics.push(diagnostic);
							}
							else {
								console.log('unknown location ' + line);
								console.log(location);
							}
							parse_error = '';
							skip = 3;
						}

					});

				});
				this.diagnosticCollection.set(openDocument.uri, diagnostics);
				this.validating = null;
				break;
			}
			default: {
				console.log(`Got unknown message type`);
				console.log(msg);
				break;
			}
		}
	}

	public activate(subscriptions: vscode.Disposable[]) {
		subscriptions.push(this);
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection();

		this.output_channel = vscode.window.createOutputChannel("ESPHome");
		this.output_channel.appendLine("ESPHome initialized");

		this.useWs = vscode.workspace.getConfiguration("esphome").get("validator") !== "local";

		// TODO: Make config option
		if (this.useWs) {
			let address = vscode.workspace.getConfiguration("esphome").get("dashboardUri");
			this.output_channel.appendLine(`Using ESPHome dashboard at: ${address}`);
			this.ws = new WebSocket(`ws://${address}/vscode`);

			// TODO: Open dynamically, re-open when connection lost etc.
			this.ws.on('open', () => {
				console.log("Websocket Open!");
				const msg = JSON.stringify({ type: 'spawn' });
				this.ws.send(msg);
			});
			this.ws.on('message', (data) => {
				const raw = JSON.parse(data.toString());
				console.log(raw);
				const msg = JSON.parse(raw.data);
				this.handleMessage(msg);
			});
		}
		else {
			this.output_channel.appendLine("Using local ESPHome");

			this.process = ChildProcess.spawn('esphome', ['dummy', "vscode"]);

			this.process.stdout.on('data', (data) => {
				console.log('Got out: ' + data.toString());
				const msg = JSON.parse(data);
				this.handleMessage(msg);
			});
			this.process.stderr.on('data', (data) => {
				console.log('Got err: ' + data.toString());
				const msg = JSON.parse(data);
				this.handleMessage(msg);
			});
		}


		vscode.workspace.onDidOpenTextDocument(this.doLint, this, subscriptions);
		vscode.workspace.onDidSaveTextDocument(this.doLint, this);
		// TODO: Activate linting when changing
		// Currently this causes issues because the client is not implemented
		// thread-safe
		vscode.workspace.onDidChangeTextDocument((evt) => {
			this.doLint(evt.document);
		}, this);

		vscode.workspace.textDocuments.forEach(this.doLint, this);
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
	}

	private sendMsg(msg: any) {
		if (this.useWs) {
			this.sendWsMsg(msg);
		}
		else {
			this.sendCpMsg(msg);
		}
	}
	private sendWsMsg(data: any): void {
		// Check if WS is open, otherwise ignore
		if (this.ws.readyState !== 1) {
			return;
		}
		let send = JSON.stringify({
			type: 'stdin',
			data: JSON.stringify(data) + '\n',
		});
		console.log(`Sending ${send}`);
		this.ws.send(send);
	}

	private sendCpMsg(data: any) {
		let send = JSON.stringify(data) + '\n';
		console.log(`Sending ${send}`);
		this.process.stdin.write(send);
	}

	private doLint(textDocument: vscode.TextDocument) {
		// Only lint for YAML
		if (textDocument.languageId !== 'yaml') {
			return;
		}
		if (textDocument.fileName.endsWith('secrets.yaml')) {
			return;
		}

		if (this.validating !== null) {
			return;
		}
		this.validating = textDocument.fileName;
		// TODO: The open file may not be the file we want to validate
		// For example when editing an !included file.
		console.log(`Validating ${textDocument.fileName}`);

		this.sendMsg({
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

export function deactivate() { }
