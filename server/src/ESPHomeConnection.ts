import { MessageTypes } from './esphome_types';

export abstract class ESPHomeConnection {
    private handleMessage_!: (msg: MessageTypes) => void;

    abstract sendMessageInternal(msg: any): void;
    sendMessage(msg: any): void {
        this.sendMessageInternal(msg);
    }
    abstract connect(): void;
    abstract disconnect(): void;
    private _isConnected: boolean = false;
    public get isConnected(): boolean {
        return this._isConnected;
    }
    protected setIsConnected(v: boolean) {
        this._isConnected = v;
    }

    protected handleMessage(msg: MessageTypes) {
        this.handleMessage_(msg);
    }

    onResponse(handleMessage: (msg: MessageTypes) => void) {
        this.handleMessage_ = handleMessage;
    }
}
