import * as ChildProcess from "child_process";
import { ESPHomeConnection } from "./ESPHomeConnection";
import { MESSAGE_RESULT } from "./esphome_types";

export class ESPHomeLocalConnection extends ESPHomeConnection {
    private process!: ChildProcess.ChildProcess;

    constructor() {
        super();
    }

    sendMessageInternal(msg: any): void {
        let send = JSON.stringify(msg) + '\n';
        // console.log(`Sending ${send}`);
        // todo check process is alive
        if (this.process.stdin !== null) {
            this.process.stdin.write(send);
        }
    }

    connect(): void {
        console.log("Using local ESPHome");
        this.process = ChildProcess.spawn('esphome', ['dummy', "vscode"]);
        if (this.process.stdout !== null) {
            this.process.stdout.on('data', (data) => {
                try {
                    if (data.length < 2) {
                        console.log(`Unexpected data too small: ${data}'`);
                        return;
                    }
                    const msg = JSON.parse(data);
                    this.handleMessage(msg);
                }
                catch (e) {
                    console.log(`Error handling reponse: data: ${typeof (data)}: '${data?.toString()}' ${e}`);
                }
            });
        }
        if (this.process.stderr !== null) {
            this.process.stderr.on('data', (data) => {
                console.error(data.toString());

                this.handleMessage({
                    type: MESSAGE_RESULT,
                    validation_errors: [],
                    yaml_errors: []
                });
            });
        }
        this.process.on("close", (code, signal) => {
            console.log('Got close: ', code, signal);
        });
        this.process.on("exit", (code, signal) => {
            console.log('Got exit: ', code, signal);
        });
        this.process.on("error", (args) => {
            if (args.message.startsWith("spawn esphome")) {
                const errorMessage = "Could not execute ESPHome. Make sure you can run ESPHome from the command line.";
                console.error(errorMessage);
            }
            console.error('Got error: ', args);
        });
    }

    disconnect(): void {
        this.process.kill();
    }
}
