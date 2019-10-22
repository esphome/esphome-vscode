import * as vscode from 'vscode';
import * as ESPHome from './esphome_types';
import * as Path from 'path';
import * as Fs from 'fs';
import { EsphomeConnection } from './EsphomeConnection';
import { EsphomeDashboardConnection } from './EsphomeDashboardConnection';
import { EsphomeLocalConnection } from './EsphomeLocalConnection';

export default class EsphomeProvider {
	private connection!: EsphomeConnection;
	private output_channel !: vscode.OutputChannel;

	private validating: vscode.TextDocument | null = null;

	private diagnosticCollection!: vscode.DiagnosticCollection;
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

	private handleRelativePath(path: string) {
		let pathStr = path;
		const parsedPath = Path.parse(path);
		if (parsedPath.root.length === 0) {
			// got a relative path filename
			pathStr = Path.join(Path.parse(this.validating!.fileName).dir, path);
		}
		console.log(`Parsed path`, path, pathStr);
		return pathStr;
	}

	private handleMessage(msg: ESPHome.MessageTypes) {
		try {
			console.log(`Got message`, msg.type, msg);
			switch (msg.type) {
				case 'read_file': {
					console.log(`openning`, msg.path, this);
					const pathStr = this.handleRelativePath(msg.path);
					const uri = vscode.Uri.file(pathStr);
					if (msg.path !== this.validating!.fileName) {
						this.addIncludeFile(this.validating!.fileName, uri.path);
					}
					this.diagnosticCollection.delete(uri);
					// ESPHome might send included files withouth path

					console.log(`openning`, uri, this.connection);
					vscode.workspace.openTextDocument(uri).then((document) => {
						let text = document.getText();
						this.connection.sendMessage({
							type: 'file_response',
							content: text,
						});
					}, (reason) => {
						// won't validate as an include file is missing
						this.addError(this.validating!.uri, new vscode.Range(0, 0, 1, 0), `Could not open '${msg.path}': ${reason}`);
						this.connection.sendMessage({
							type: 'file_response',
							content: '',
						});
					});
					break;
				}
				case 'result': {
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
				case 'check_directory_exists': {
					const pathStr = this.handleRelativePath(msg.path);
					const fileExists = Fs.existsSync(pathStr);
					console.log(`checking directory exists: `, pathStr, fileExists);

					this.connection.sendMessage({
						type: 'directory_exists_response',
						content: fileExists
					});
					break;
				}
				case 'check_file_exists': {
					const pathStr = this.handleRelativePath(msg.path);
					const fileExists = Fs.existsSync(pathStr);
					console.log(`checking file exists: `, pathStr, fileExists);

					this.connection.sendMessage({
						type: 'file_exists_response',
						content: fileExists
					});
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

	private connectToEsphome() {
		console.log(`changing esphome connection`, this);
		if (this.connection) {
			this.connection.disconnect();
		}

		const useWs = vscode.workspace.getConfiguration("esphome").get("validator") !== "local";
		if (useWs) {
			let address: string = vscode.workspace.getConfiguration("esphome").get("dashboardUri") || '';
			this.connection = new EsphomeDashboardConnection(this.output_channel, address);
		}
		else {
			this.connection = new EsphomeLocalConnection(this.output_channel);
		}
		this.validating = null;
		this.connection.onResponse((m) => this.handleMessage(m));
		this.connection.connect();
	}

	public activate(subscriptions: vscode.Disposable[]) {
		subscriptions.push(this);
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection();

		this.output_channel = vscode.window.createOutputChannel("ESPHome");
		this.output_channel.appendLine("ESPHome initialized");

		vscode.workspace.onDidChangeConfiguration(e => {
			try {
				if (e.affectsConfiguration('esphome.validator')
					|| e.affectsConfiguration('esphome.dashboardUri')) {
					this.connectToEsphome();
				}
			}
			catch (e) { console.log(e); }
		});

		vscode.workspace.onDidOpenTextDocument(this.doLint, this, subscriptions);
		vscode.workspace.onDidSaveTextDocument(this.doLint, this);
		vscode.workspace.onDidChangeTextDocument((evt) => this.doLint(evt.document), this);

		this.connectToEsphome();

		// vscode.workspace.findFiles('*.yaml').then((uris: vscode.Uri[]) => {
		// 	this.pendingValidation = uris;
		// 	this.validateNext();
		// });
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
	}

	private doLint(textDocument: vscode.TextDocument) {
		console.log(`do lint on ` + textDocument.fileName + ` current: `, this.validating);
		try {
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

			this.connection.sendMessage({
				type: 'validate',
				file: this.validating.fileName
			});
		} catch (e) {
			console.log(e);
			this.validating = null;
		}
	}
}

export function activate(ctx: vscode.ExtensionContext) {
	let linter = new EsphomeProvider();
	linter.activate(ctx.subscriptions);
}

export function deactivate() { }
