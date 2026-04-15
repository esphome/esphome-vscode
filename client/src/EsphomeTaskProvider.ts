import * as vscode from "vscode";

let OtaUploadTask = new vscode.Task(
  {
    type: "esphome",
    task: "ota",
  },
  vscode.TaskScope.Workspace,
  "Upload OTA",
  "ESPHome",
  new vscode.ShellExecution("esphome", [
    "run",
    "${relativeFile}",
    "--device",
    "OTA",
  ]),
);

class EsphomeTaskProvider implements vscode.TaskProvider {
  static EsphomeType: string = "esphome";

  constructor(workspaceRoot: string) {}

  public provideTasks(): Thenable<vscode.Task[]> | undefined {
    let tasks: vscode.Task[] = [OtaUploadTask];

    return Promise.resolve(tasks);
  }

  public resolveTask(_task: vscode.Task): vscode.Task | undefined {
    const task = _task.definition.task;
    // A Rake task consists of a task and an optional file as specified in RakeTaskDefinition
    // Make sure that this looks like a Rake task by checking that there is a task.
    if (task) {
      // resolveTask requires that the same definition object be used.
      const definition: EsphomeTaskDefinition = <any>_task.definition;

      return new vscode.Task(
        definition,
        vscode.TaskScope.Workspace,
        definition.task,
        "esphome",
        new vscode.ShellExecution(`${definition.task}`),
      );
    }

    return undefined;
  }
}

interface EsphomeTaskDefinition extends vscode.TaskDefinition {
  task: string;
}

export function addTasks(context: vscode.ExtensionContext) {
  let workspaceRoot = vscode.workspace.rootPath;
  console.log("Workspaceroot: ", workspaceRoot);
  if (!workspaceRoot) {
    return;
  }

  console.log("creating provider: ", workspaceRoot);
  const esphomeTaskProvider = vscode.tasks.registerTaskProvider(
    EsphomeTaskProvider.EsphomeType,
    new EsphomeTaskProvider(workspaceRoot),
  );

  const esphomeOtaStatusBarCommandId = "esphome.otaUpload";

  const command = vscode.commands.registerCommand(
    esphomeOtaStatusBarCommandId,
    () => {
      vscode.tasks.executeTask(OtaUploadTask);
    },
  );

  // Add taskbar icon for OTA
  // create a new status bar item that we can now manage
  const esphomeOtaStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  esphomeOtaStatusBarItem.command = esphomeOtaStatusBarCommandId;

  context.subscriptions.push(esphomeOtaStatusBarItem);

  esphomeOtaStatusBarItem.text = "$(rocket) OTA";
  esphomeOtaStatusBarItem.tooltip = "Compile and upload Over The Air";
  esphomeOtaStatusBarItem.show();
}
