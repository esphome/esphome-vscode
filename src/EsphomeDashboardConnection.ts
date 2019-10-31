import * as vscode from 'vscode';
import * as WebSocket from "ws";
import { EsphomeConnection } from "./EsphomeConnection";

export class EsphomeDashboardConnection extends EsphomeConnection {
    sendMessageInternal(msg: any): void {
        // Check if WS is open, otherwise ignore
        if (this.ws.readyState !== 1) {
            return;
        }
        let send = JSON.stringify({
            type: 'stdin',
            data: JSON.stringify(msg) + '\n',
        });
        console.log(`Sending ${send}`);
        this.ws.send(send);
    }

    /**
     *
     */
    private ws!: WebSocket;
    constructor(readonly outputChannel: vscode.OutputChannel, readonly endPoint: string) {
        super();
    }

    connect(): void {
        this.outputChannel.appendLine(`Using ESPHome dashboard at: ${this.endPoint}`);
        this.ws = new WebSocket(`ws://${this.endPoint}/vscode`);

        // TODO: Open dynamically, re-open when connection lost etc.
        this.ws.on('open', () => {
            this.outputChannel.appendLine("Connection established.");
            const msg = JSON.stringify({ type: 'spawn' });
            this.ws.send(msg);
        });
        this.ws.on('error', (err: Error) => {
            this.outputChannel.appendLine("Cannot connect to ESPHome dashboard" + err);
            vscode.window.showErrorMessage("Cannot connect to ESPHome dashboard. Make sure you can access to ${this.endPoint} and have set option 'leave_front_door_open': true");
        });
        this.ws.on('message', (data) => {
            const raw = JSON.parse(data.toString());
            console.log(raw);
            const msg = JSON.parse(raw.data);
            this.handleMessage(msg);
        });
    }

    public disconnect(): void { }

}
