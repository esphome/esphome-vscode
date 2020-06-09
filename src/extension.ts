import * as vscode from 'vscode';
import EsphomeProvider from "./EsphomeProvider";
import { OtaUploadTask, EsphomeTaskProvider } from './EsphomeTaskProvider';

let esphomeTaskProvider: vscode.Disposable | undefined;

let esphomeOtaStatusBarItem: vscode.StatusBarItem;

export function activate(ctx: vscode.ExtensionContext) {
	let linter = new EsphomeProvider();
	linter.activate(ctx.subscriptions);

	let workspaceRoot = vscode.workspace.rootPath;
	console.log('Workspaceroot: ', workspaceRoot);
	if (!workspaceRoot) {
		return;
	}

	console.log('creating provider: ', workspaceRoot);
	esphomeTaskProvider = vscode.tasks.registerTaskProvider(EsphomeTaskProvider.EsphomeType, new EsphomeTaskProvider(workspaceRoot));

	const esphomeOtaStatusBarCommandId = 'esphome.otaUpload';

	const command = vscode.commands.registerCommand(esphomeOtaStatusBarCommandId, () => {
		vscode.tasks.executeTask(OtaUploadTask);
	});

	// Add taskbar icon for OTA
	// create a new status bar item that we can now manage
	esphomeOtaStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	esphomeOtaStatusBarItem.command = esphomeOtaStatusBarCommandId;

	ctx.subscriptions.push(esphomeOtaStatusBarItem);

	esphomeOtaStatusBarItem.text = "$(rocket) OTA";
	esphomeOtaStatusBarItem.tooltip = "Compile and upload Over The Air";
	esphomeOtaStatusBarItem.show();
}

export function deactivate() { }
