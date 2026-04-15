import { env } from "process";
import { ChildProcess, exec, ExecException } from "child_process";

import { ESPHomeConnection } from "./connection";
import { MESSAGE_STD_ERR_OUT } from "./types";

function execPromise(
  command: string,
): Promise<{ error: ExecException | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}
export class ESPHomeLocalConnection extends ESPHomeConnection {
  private process!: ChildProcess;
  private killed = false;
  private command?: string;

  constructor(private pythonPath?: string) {
    super();
  }

  sendMessageInternal(msg: any): void {
    let send = JSON.stringify(msg) + "\n";

    // todo check process is alive
    if (this.process.stdin !== null) {
      this.process.stdin.write(send);
    }
  }

  async initialize_command(): Promise<string | undefined> {
    if (this.pythonPath) {
      const cmd = `"${this.pythonPath}" -m esphome version`;
      const result = await execPromise(cmd);
      if (result.stderr) {
        const errorMessage = `Could not execute ESPHome. Make sure selected Python interpreter is correct and restart VS Code. Actual interpreter ${this.pythonPath}.`;
        console.error(errorMessage);
        return undefined;
      }
      console.log(`Using venv "${this.pythonPath}" -- ${result.stdout}`);
      return `"${this.pythonPath}" -m esphome vscode dummy`;
    }
    const cmd = "esphome version";
    const result = await execPromise(cmd);
    if (result.stderr) {
      const errorMessage =
        "Could not execute ESPHome. Make sure you can run ESPHome from the command line. If you have ESPHome in a virtual environment, install the Python extension and select it.";
      console.error(errorMessage);
      return undefined;
    }
    console.log(`Using ${result.stdout}`);
    return "esphome vscode dummy";
  }

  async connect(): Promise<void> {
    console.log("Using local ESPHome");
    var environment = env;
    environment.PYTHONIOENCODING = "utf-8";

    if (this.command === undefined)
      this.command = await this.initialize_command();

    if (!this.command) {
      console.error("Cannot start ESPHome");
      return;
    }

    this.process = exec(this.command, {
      encoding: "utf-8",
      env: environment,
    });
    if (this.process.stdout !== null) {
      this.process.stdout.on("data", (data) => {
        const lines: string[] = data.toString().split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length < 2) continue;
          try {
            const msg = JSON.parse(trimmed);
            this.handleMessage(msg);
          } catch (e) {
            console.log(
              `Error handling response: data: ${typeof data}: '${trimmed}' ${e}`,
            );
          }
        }
      });
    }
    if (this.process.stderr !== null) {
      this.process.stderr.on("data", (data) => {
        console.error("StdErr:" + data.toString());

        this.handleMessage({
          type: MESSAGE_STD_ERR_OUT,
          std_err: data.toString(),
        });
      });
    }
    this.process.on("close", (code, signal) => {
      console.log("Got close: ", code, signal);
    });
    this.process.on("exit", async (code, signal) => {
      console.log("Got exit: ", code, signal);
      await this.connect();
    });
    this.process.on("error", (args) => {
      if (this.killed) return;
      if (args.message.startsWith("spawn esphome")) {
        const errorMessage =
          "Could not execute ESPHome. Make sure you can run ESPHome from the command line.";
        console.error(errorMessage);
      }
      console.error("Got error: ", args);
    });
  }

  disconnect(): void {
    this.killed = true;
    this.process.kill();
  }
}
