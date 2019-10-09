import * as vscode from 'vscode';
import * as WebSocket from "ws";
import * as ChildProcess from "child_process";
import * as ESPHome from './esphome_types';

export default class EsphomeProvider {
	private output_channel !: vscode.OutputChannel;

	private useWs = false; // if false use local esphome
	private validating: vscode.TextDocument | null = null;

	private diagnosticCollection!: vscode.DiagnosticCollection;
	private ws!: WebSocket;
	private process!: ChildProcess.ChildProcess;

	private pendingValidation: vscode.Uri[] = [];

	private includedFiles: { [id: string]: string[] } = {};

	private addError(uri: vscode.Uri, range: vscode.Range, message: string) {
		console.log(`added error: ${message} to ${uri.path}`);
		let diagnostics = this.diagnosticCollection.get(uri) || [];
		const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
		diagnostics = [...diagnostics, diagnostic];
		this.diagnosticCollection.set(uri, diagnostics);
	}

	private addIncludeFile(file: string, included: string) {
		var includes = this.includedFiles[file] || [];
		if (includes.indexOf(included) === -1) {
			includes.push(included);
			this.includedFiles[file] = includes;
		}
		console.log(`files for ${file} : ${this.includedFiles[file]}`);
	}

	private handleEsphomeError(error: ESPHome.ValidationError) {
		const message = error.message;
		let range: vscode.Range;
		let uri: vscode.Uri;
		if (error.range === null) {
			range = new vscode.Range(0, 0, 1, 0);
			uri = vscode.Uri.file(this.validating!.fileName);
		} else {
			range = new vscode.Range(error.range.start_line, error.range.start_col, error.range.end_line, error.range.end_col);
			uri = vscode.Uri.file(error.range.document);
		}
		this.addError(uri, range, message);
	}

	private handleYamlError(error: ESPHome.YamlValidationError) {
		let skip = 3;
		let message = '';
		error.message.split('\n').forEach(line => {
			console.log(`- ${skip} : ${line}`);
			if (--skip > 0) {
				return;
			}
			if (message === '') {
				message = line;
				console.log('got error ' + line);
			}
			else {
				let location = line.match(/in "([^"]*)", line (\d*), column (\d*):/);
				if (location) {
					const uri = vscode.Uri.file(location[1]);
					const line_number = parseInt(location[2]) - 1;
					const col_number = parseInt(location[3]) - 1;
					const range = new vscode.Range(line_number, col_number, line_number, col_number + 1);

					this.addError(uri, range, message);
				}
				else {
					console.log('unknown location ' + line);
					console.log(location);
				}
				message = '';
				skip = 3;
			}
		});
	}

	private handleMessage(msg: ESPHome.MessageTypes) {
		try {
			switch (msg.type) {
				case 'read_file': {
					console.log(`Got read_file message ${msg.path}`);
					const uri = vscode.Uri.file(msg.path);
					if (msg.path !== this.validating!.fileName) {
						this.addIncludeFile(this.validating!.fileName, uri.path);
					}
					this.diagnosticCollection.delete(uri);
					vscode.workspace.openTextDocument(uri).then((document) => {
						let text = document.getText();
						this.sendMsg({
							type: 'file_response',
							content: text,
						});
					}, (reason) => {
						// won't validate as an include file is missing
						this.addError(this.validating!.uri, new vscode.Range(0, 0, 1, 0), `Could not found '${msg.path}'`);
						this.sendMsg({
							type: 'file_response',
							content: '',
						});
					});
					break;
				}
				case 'result': {
					console.log(`Got result message`, msg);
					msg.validation_errors.forEach((error) => {
						this.handleEsphomeError(error);
					});
					msg.yaml_errors.forEach((error) => {

						this.handleYamlError(error);

					});
					this.validating = null;

					this.validateNext();
					break;
				}
				default: {
					console.log(`Got unknown message type`, msg);
					break;
				}
			}
		}
		catch (exception) {
			this.output_channel.appendLine(exception.toString());
		}
	}

	private validateNext() {
		try {
			while (this.pendingValidation.length > 0) {
				const doc = this.pendingValidation.pop();
				if (!doc || !doc.path.endsWith(".yaml")) {
					continue;
				}

				// TODO: if doc is an included don't revalidate master.
				console.log(`validating next: ${doc.path} pending validation: ${this.pendingValidation.length}`);
				vscode.workspace.openTextDocument(doc).then(openedTextDocument =>
					this.doLint(openedTextDocument));

				return;
			}
		}
		catch (exception) {
			this.output_channel.appendLine(exception.toString());
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
		vscode.workspace.onDidChangeTextDocument((evt) => {
			this.doLint(evt.document);
		}, this);

		vscode.workspace.findFiles('*.yaml').then((uris: vscode.Uri[]) => {
			this.pendingValidation = uris;
			this.validateNext();
		});
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
		if (this.validating !== null) {
			return;
		}

		this.validating = textDocument;
		// Check if this is an included file
		const thisFilePath = vscode.Uri.file(textDocument.fileName).path;
		console.log(`this file path: ${thisFilePath}`);
		for (let key in this.includedFiles) {
			console.log(`testing included file key: ${key} files: ${this.includedFiles[key]}`);
			if (this.includedFiles[key].indexOf(thisFilePath) >= 0) {
				console.log(`Not validating ${textDocument.fileName} as is listed as included file`);
				const doc = vscode.workspace.textDocuments.find(td => td.fileName === key);
				if (doc !== undefined) {
					console.log(`Validating containing document ${doc.uri.path} instead`);
					this.validating = doc;
				}
			}
		}

		console.log(`Validating ${this.validating.fileName}`);

		this.sendMsg({
			type: 'validate',
			file: this.validating.fileName
		});
	}
}

export function activate(ctx: vscode.ExtensionContext) {
	let linter = new EsphomeProvider();
	linter.activate(ctx.subscriptions);
}

export function deactivate() { }
