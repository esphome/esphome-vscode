import * as fs from "fs";
import path = require("path");
import { YAMLMap } from "yaml";

export interface SchemaSet {
    [name: string]: Component;
    core: CoreComponent;
}

interface ConfigVarBase {
    key: string;
    detail?: string;
    is_list?: boolean;
    docs?: string;
}

export interface ConfigVarRegistry extends ConfigVarBase {
    type: 'registry';
    registry: string;
    filter?: string[];
}

export interface ConfigVarTrigger extends ConfigVarBase {
    type: 'trigger';
    schema: Schema;
    has_required_var: Boolean;
}

export interface ConfigVarEnum extends ConfigVarBase {
    type: 'enum';
    values: string[];
}

interface ConfigVarSchema extends ConfigVarBase {
    type: 'schema';
    schema: Schema;
}

export interface ConfigVarTyped extends ConfigVarBase {
    type: 'typed';
    types: {
        [name: string]: Schema;
    };
}
export interface ConfigVarPin extends ConfigVarBase {
    type: 'pin';
    schema: Boolean;
    internal: Boolean;
    modes: ('output' | 'input' | 'pullup')[];
}
interface ConfigVarBoolean extends ConfigVarBase {
    type: 'boolean';
    default: string;
}
interface ConfigVarString extends ConfigVarBase {
    type: 'string';
}

export type ConfigVar = ConfigVarSchema | ConfigVarRegistry | ConfigVarEnum | ConfigVarTrigger | ConfigVarTyped | ConfigVarPin | ConfigVarBoolean | ConfigVarString;

interface ConfigVars {
    [name: string]: ConfigVar;
}
export interface Schema {
    config_vars: ConfigVars;
    extends: string[];
}

interface Component {
    schemas: {
        [name: string]: Schema;
        CONFIG_SCHEMA: Schema;
    };
    // These are the components e.g. of sensor, binary_sensor
    components: { docs?: string };

    action: {
        [name: string]: ConfigVar;
    };
    condition: {
        [name: string]: ConfigVar;
    };
    filter: {
        [name: string]: ConfigVar;
    };
}
interface CoreComponent extends Component {
    platforms: { [name: string]: { docs?: string } };
    components: { [name: string]: { docs?: string } };
    pins: string[];
}

export class CoreSchema {
    schema: SchemaSet;
    loaded_schemas: string[] = ["core", "esphome"];

    constructor() {
        this.schema = this.readFile("esphome");
    }

    getPlatformList() {
        return this.schema.core.platforms;
    }
    getComponentList() {
        return this.schema.core.components;
    }

    getComponent(domain: string, platform: string = null) {
        if (!this.loaded_schemas.includes(domain)) {
            this.schema = {
                ...this.schema,
                ...this.readFile(domain)
            };
            this.loaded_schemas.push(domain);
        }
        if (platform !== null) {
            return this.schema[`${domain}.${platform}`];
        }
        return this.schema[domain];
    }

    getComponentSchema(domain: string) {
        const component = this.getComponent(domain);
        return component.schemas.CONFIG_SCHEMA;
    }
    getComponentPlatformSchema(domain: string, platform: string): Schema {
        const component = this.getComponent(domain, platform);
        return component.schemas.CONFIG_SCHEMA;
    }

    private readFile(name: string) {
        const jsonPath = path.join(__dirname, `schema/${name}.json`);
        const fileContents = fs.readFileSync(jsonPath, "utf-8");
        return JSON.parse(fileContents);
    }


    getExtendedSchema(name: string) {
        const parts = name.split('.');
        const c = this.getComponent(parts[0]);
        return c.schemas[parts[1]];
    }

    isPlatform(name: string): boolean {
        return (name in this.schema.core.platforms);
    }

    *getRegistry(registry: string): Generator<[string, ConfigVar]> {
        if (registry.includes(".")) {
            const [domain, registryName] = registry.split('.');
            for (const name in this.schema[domain][registryName]) {
                yield [name, this.schema[domain][registryName][name]];
            }
        }
        else {
            for (const c in this.schema) {
                if (this.schema[c][registry] !== undefined) {
                    for (const name in this.schema[c][registry]) {
                        if (c === "core") {
                            yield [name, this.schema[c][registry][name]];
                        }
                        else {
                            yield [c.split('.').reverse().join('.') + '.' + name, this.schema[c][registry][name]];
                        }
                    }
                }
            }
        }
    }

    getRegistryConfigVar(registry: string, entry: string): ConfigVar {
        if (registry.includes(".")) {
            const [domain, registryName] = registry.split('.');
            return this.schema[domain][registryName][entry];
        }
        else {
            for (const c in this.schema) {
                if (this.schema[c][registry] !== undefined && this.schema[c][registry][entry] !== undefined) {
                    return this.schema[c][registry][entry];
                }
            }
        }
    }
    getActionConfigVar(entry: string): ConfigVarTrigger {
        return this.getRegistryConfigVar("action", entry) as ConfigVarTrigger;
    }
    getPinSchema(component: string): Schema {
        return this.getComponent(component)["pin"];
    }
    getPins(): string[] {
        return this.schema.core.pins;
    }

    * iter_configVars(schema: Schema, docMap: YAMLMap): Generator<[string, ConfigVar]> {
        for (var prop in schema.config_vars) {
            if (schema.extends?.includes("core.MQTT_COMPONENT_SCHEMA") &&
                (prop === "mqtt_id" || prop === "expire_after") && docMap.get("mqtt") === undefined) {
                // filter mqtt props if mqtt is not used
                continue;
            }
            yield [prop, schema.config_vars[prop]];
        }
        if (schema.extends !== undefined) {
            for (var extended of schema.extends) {
                if (extended.startsWith("core.MQTT") && docMap.get("mqtt") === undefined) {
                    continue;
                }
                const s = this.getExtendedSchema(extended);
                for (const pair of this.iter_configVars(s, docMap)) {
                    yield pair;
                }
            }
        }
    }

    findConfigVar(schema, prop, docMap: YAMLMap): ConfigVar {
        for (const [p, config] of this.iter_configVars(schema, docMap)) {
            if (p === prop) {
                return config;
            }
        }
        return undefined;
    }


}
