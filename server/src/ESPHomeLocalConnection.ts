import * as ChildProcess from "child_process";
import * as process from "process";
import { ESPHomeConnection } from "./ESPHomeConnection";
import { MESSAGE_STD_ERR_OUT } from "./esphome_types";

export class ESPHomeLocalConnection extends ESPHomeConnection {
  private process!: ChildProcess.ChildProcess;
  private killed = false;

  constructor() {
    super();
  }

  sendMessageInternal(msg: any): void {
    let send = JSON.stringify(msg) + "\n";

    // todo check process is alive
    if (this.process.stdin !== null) {
      this.process.stdin.write(send);
    }
  }

  connect(): void {
    console.log("Using local ESPHome");
    var environment = process.env;
    environment.PYTHONIOENCODING = "utf-8";

    this.process = ChildProcess.exec("esphome vscode dummy", {
      encoding: "utf-8",
      env: environment,
    });
    if (this.process.stdout !== null) {
      this.process.stdout.on("data", (data) => {
        try {
          if (data.length < 2) {
            console.log(`Unexpected data too small: ${data}'`);
            return;
          }
          const msg = JSON.parse(data);
          this.handleMessage(msg);
        } catch (e) {
          console.log(
            `Error handling response: data: ${typeof data}: '${data?.toString()}' ${e}`,
          );
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
    this.process.on("exit", (code, signal) => {
      console.log("Got exit: ", code, signal);
      this.connect();
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
