import { MessageTypes } from './esphome_types';

export abstract class EsphomeConnection {
    handleMessage_!: (msg: MessageTypes) => void;

    abstract sendMessage(msg: any): void;
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
        console.log('forwarding ', msg);
        this.handleMessage_(msg);
    }

    onResponse(handleMessage: (msg: MessageTypes) => void) {
        this.handleMessage_ = handleMessage;
    }
}
