import { ESPHomeDashboardConnection } from "./ESPHomeDashboardConnection";
import { ESPHomeLocalConnection } from "./ESPHomeLocalConnection";
import { ESPHomeSettings } from "./ESPHomeSettings";
import { MESSAGE_VERSION, MessageTypes } from "./esphome_types";
import { ESPHomeConnection } from "./ESPHomeConnection";

// This class checks configuration settings and decides which connection to use
// The same base ESPHomeConnection is used for this.
const DEFAULT_VERSION = "2025.4.0";
export class ESPHomeConnectionSource extends ESPHomeConnection {
  // The real connection
  private relay!: ESPHomeConnection;
  private handleMessageSource_!: (msg: MessageTypes) => void;
  private relayType: string | undefined;

  connect(): void {
    throw new Error("Method not implemented.");
  }
  disconnect(): void {
    throw new Error("Method not implemented.");
  }
  sendMessageInternal(msg: any): void {
    throw new Error("Method not implemented.");
  }

  configure(config: ESPHomeSettings) {
    const newRelayType = config.validator;
    if (this.relayType !== undefined) {
      if (this.relayType != newRelayType) this.relay.disconnect();
      else {
        if (this.relayType === "local") {
          // nothing to do
          return;
        }
      }
    }
    this.relayType = newRelayType;
    if (config.validator === "local") {
      console.log("Configuring ESPHome with local validation...");
      this.relay = new ESPHomeLocalConnection();
    } else {
      if (config.dashboardUri === undefined) {
        console.error("Invalid dashboard uri. Check the configuration");
        return;
      }
      console.log(
        `Configuring ESPHome with dashboard validation at ${config.dashboardUri}...`,
      );

      this.relay = new ESPHomeDashboardConnection(config.dashboardUri);
    }
    this.relay.onResponse(this.handleRelayResponse.bind(this));
    this.relay.connect();
  }

  sendMessage(msg: any): void {
    if (this.relay !== undefined) {
      this.relay.sendMessage(msg);
    }
  }

  onResponse(handleMessage: (msg: MessageTypes) => void) {
    this.handleMessageSource_ = handleMessage;
  }

  private handleRelayResponse(m: MessageTypes): void {
    // newer versions of esphome push version on connection established
    if (m.type == MESSAGE_VERSION) {
      setVersion(m.value);
      return;
    } else {
      if (_version == undefined) {
        console.log(
          `First message is not version. Default to ${DEFAULT_VERSION}`,
        );
        setVersion(DEFAULT_VERSION);
      }
    }
    if (this.handleMessageSource_) this.handleMessageSource_(m);
  }
}

let _version: string | undefined;
let _version_promise: Promise<string> | undefined;
let _version_resolve: ((value: string) => void) | undefined;
let _version_timeout: NodeJS.Timeout | undefined;

function setVersion(newVersion: string) {
  _version = newVersion;
  if (_version_resolve) {
    clearTimeout(_version_timeout);
    _version_resolve(_version);
    _version_resolve = undefined;
  }
}

export async function version(): Promise<string> {
  if (!_version_promise) {
    _version_promise = new Promise<string>((resolve) => {
      if (_version) {
        resolve(_version);
        return;
      }
      _version_resolve = resolve;
      _version_timeout = setTimeout(() => {
        console.log("Version default given by timeout");
        _version = DEFAULT_VERSION; // Default version
        resolve(_version); // fallback to current _version
      }, 10000);
    });
  }
  return _version_promise;
}
