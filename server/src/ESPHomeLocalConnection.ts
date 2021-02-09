//import * as vscode from "vscode";
import * as ChildProcess from "child_process";
import { ESPHomeConnection } from "./ESPHomeConnection";

export class ESPHomeLocalConnection extends ESPHomeConnection {
    private process!: ChildProcess.ChildProcess;

    constructor(/*readonly outputChannel: vscode.OutputChannel*/) {
        super();
    }

    sendMessageInternal(msg: any): void {
        let send = JSON.stringify(msg) + '\n';
        console.log(`Sending ${send}`);
        // todo check process is alive
        if (this.process.stdin !== null)
            this.process.stdin.write(send);
    }

    connect(): void {
        console.log("Using local ESPHome");
        this.process = ChildProcess.spawn('esphome', ['dummy', "vscode"]);
        if (this.process.stdout !== null)
            this.process.stdout.on('data', (data) => {
                console.log('Got out: ' + data.toString());
                const msg = JSON.parse(data);
                this.handleMessage(msg);
            });
        if (this.process.stderr !== null)
            this.process.stderr.on('data', (data) => {
                console.log('Got err: ' + data.toString());
                const msg = JSON.parse(data);
                this.handleMessage(msg);
            });
        this.process.on("close", (code, signal) => {
            console.log('Got close: ', code, signal);
        });
        this.process.on("exit", (code, signal) => {
            console.log('Got exit: ', code, signal);
        });
        this.process.on("error", (args) => {
            if (args.message.startsWith("spawn esphome")) {
                const errorMessage = "Could not execute ESPHome. Make sure you can run ESPHome from the command line.";
                //vscode.window.showErrorMessage(errorMessage);
                console.error(errorMessage);
                //this.outputChannel.appendLine(errorMessage);
            }
            else { /*this.outputChannel.appendLine("Unknown error: " + args.message);*/ }
            console.error('Got error: ', args);
        });
    }

    disconnect(): void {
        //this.outputChannel.appendLine("Terminating local ESPHome");
        this.process.kill();
    }
}
