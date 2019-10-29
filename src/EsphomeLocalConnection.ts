import * as vscode from "vscode";
import * as ChildProcess from "child_process";
import { EsphomeConnection } from "./EsphomeConnection";

export class EsphomeLocalConnection extends EsphomeConnection {
    private process!: ChildProcess.ChildProcess;

    constructor(readonly outputChannel: vscode.OutputChannel) {
        super();
    }

    sendMessageInternal(msg: any): void {
        let send = JSON.stringify(msg) + '\n';
        console.log(`Sending ${send}`);
        this.process.stdin.write(send);
    }

    connect(): void {
        this.outputChannel.appendLine("Using local ESPHome");
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
        this.process.on("close", (code, signal) => {
            console.log('Got close: ', code, signal);
        });
        this.process.on("exit", (code, signal) => {
            console.log('Got exit: ', code, signal);
        });
        this.process.on("error", (args) => {
            if (args.message.startsWith("spawn esphome")) {
                const errorMessage = "Could not execute ESPHome. Make sure you can run ESPHome from the command line.";
                vscode.window.showErrorMessage(errorMessage);
                this.outputChannel.appendLine(errorMessage);
            }
            else { this.outputChannel.appendLine("Unknown error: " + args.message); }
            console.log('Got error: ', args);
        });
    }

    disconnect(): void {
        this.outputChannel.appendLine("Terminating local ESPHome");
        this.process.kill();
    }
}
