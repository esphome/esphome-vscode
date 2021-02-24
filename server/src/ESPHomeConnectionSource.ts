import { ESPHomeDashboardConnection } from './EsphomeDashboardConnection';
import { ESPHomeLocalConnection } from './ESPHomeLocalConnection';
import { ESPHomeSettings } from './ESPHomeSettings';
import { MessageTypes } from './esphome_types';
import { ESPHomeConnection } from './ESPHomeConnection';

// This class checks configuration settings and decides which connection to use
// The same base ESPHomeConnection is used for this.

export class ESPHomeConnectionSource extends ESPHomeConnection {

    // The real connection
    private relay!: ESPHomeConnection;
    private handleMessageSource_!: (msg: MessageTypes) => void;


    connect(): void {
        throw new Error('Method not implemented.');
    }
    disconnect(): void {
        throw new Error('Method not implemented.');
    }
    sendMessageInternal(msg: any): void {
        throw new Error('Method not implemented.');
    }

    configure(config: ESPHomeSettings) {
        if (this.relay !== undefined) {
            this.relay.disconnect();

        }
        if (config.validator === 'local') {
            console.log("Configuring ESPHome with local validation...");
            this.relay = new ESPHomeLocalConnection();
            this.relay.connect();
        }
        else {
            if (config.dashboardUri === undefined) {
                console.error("Invalid dashboard uri. Check the configuration");
                return;
            }
            console.log(`Configuring ESPHome with dashboard validation at ${config.dashboardUri}...`);

            this.relay = new ESPHomeDashboardConnection(config.dashboardUri);
            this.relay.connect();
        }
        this.relay.onResponse(m => this.handleMessageSource_(m));
    }

    sendMessage(msg: any): void {
        if (this.relay !== undefined) {
            this.relay.sendMessage(msg);
        }
    }

    onResponse(handleMessage: (msg: MessageTypes) => void) {
        this.handleMessageSource_ = handleMessage;
    }
}
