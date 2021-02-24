
import * as WebSocket from "ws";
import { ESPHomeConnection } from "./ESPHomeConnection";

export class ESPHomeDashboardConnection extends ESPHomeConnection {
    private ws!: WebSocket;
    constructor(readonly endPoint: string) {
        super();
    }

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

    connect(): void {
        const regex = /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
        let uri = this.endPoint;
        if (uri.indexOf('//') === -1) {
            uri = 'http://' + uri;
        }
        const match = uri.match(regex)

        if (match === null) {
            console.error(`Could not understand end point '${this.endPoint}'`)
            return;
        }

        const httpUri = `${match[2]}://${match[4]}/`;
        const wsUri = `ws://${match[4]}/vscode`;

        console.log(`Using ESPHome dashboard at: ${wsUri} server: ${httpUri}`);
        this.ws = new WebSocket(wsUri.toString());

        // TODO: Open dynamically, re - open when connection lost etc.
        this.ws.on('open', () => {
            console.log("Connection established.");
            const msg = JSON.stringify({ type: 'spawn' });
            this.ws.send(msg);
        });
        this.ws.on('error', (err: Error) => {
            console.log("Cannot connect to ESPHome dashboard" + err);
            console.error(`Cannot connect to ESPHome dashboard. Make sure you can access '${httpUri}' and have set the option 'leave_front_door_open': true`);
        });
        this.ws.on('message', (data) => {
            const raw = JSON.parse(data.toString());
            const msg = JSON.parse(raw.data);
            this.handleMessage(msg);
        });
    }

    public disconnect(): void { }

}
