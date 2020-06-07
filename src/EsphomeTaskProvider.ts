
import * as vscode from 'vscode';

export let OtaUploadTask = new vscode.Task({
    type: 'esphome',
    task: 'esphome'
}, 'esphome compile', 'ESPHome', new vscode.ShellExecution('esphome ${relativeFile} run --upload-port OTA'));

export class EsphomeTaskProvider implements vscode.TaskProvider {
    static EsphomeType: string = 'esphome';

    constructor(workspaceRoot: string) {
        console.log('returning provideTAsks');
        // let pattern = path.join(workspaceRoot, 'Rakefile');
        // let fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        // fileWatcher.onDidChange(() => this.rakePromise = undefined);
        // fileWatcher.onDidCreate(() => this.rakePromise = undefined);
        // fileWatcher.onDidDelete(() => this.rakePromise = undefined);
    }

    public provideTasks(): Thenable<vscode.Task[]> | undefined {
        console.log('returning provideTAsks');

        let tasks: vscode.Task[] = [OtaUploadTask];

        console.log('returning provideTAsks');

        return Promise.resolve(tasks);
    }

    public resolveTask(_task: vscode.Task): vscode.Task | undefined {

        console.log('returning provideTAsks');
        const task = _task.definition.task;
        // A Rake task consists of a task and an optional file as specified in RakeTaskDefinition
        // Make sure that this looks like a Rake task by checking that there is a task.
        if (task) {
            // resolveTask requires that the same definition object be used.
            const definition: EsphomeTaskDefinition = <any>_task.definition;

            console.log('returning new resolved task', definition.task);
            return new vscode.Task(definition, definition.task, 'esphome', new vscode.ShellExecution(`${definition.task}`));
        }
        console.log('returning undefined resolved task');


        return undefined;

    }
}


interface EsphomeTaskDefinition extends vscode.TaskDefinition {
	/**
	 * The task name
	 */
    task: string;
}