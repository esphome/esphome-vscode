import * as path from "path";
import { workspace, ExtensionContext, extensions } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  RevealOutputChannelOn,
} from "vscode-languageclient/node";
import { addTasks } from "./EsphomeTaskProvider";

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
  // The server is implemented in node
  let serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js"),
  );
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  let serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // try to send the selected python interpreter path, for local esphome in virtual environment
  const pythonExt = extensions.getExtension("ms-python.python");
  await pythonExt?.activate();
  const pythonApi = pythonExt?.exports;
  const interpreterPath = (
    await pythonApi?.environments.resolveEnvironment(
      pythonApi.environments.getActiveEnvironmentPath().path,
    )
  )?.executable?.uri?.fsPath;

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: "file", language: "esphome" }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    initializationOptions: {
      pythonPath: interpreterPath,
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "esphome",
    "ESPHome Language Server",
    serverOptions,
    clientOptions,
  );

  // Start the client. This will also launch the server
  client.start();

  addTasks(context);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
