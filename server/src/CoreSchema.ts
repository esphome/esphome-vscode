import * as fs from "fs";
import path = require("path");
import { isMap, isPair, isScalar, isSeq, YAMLMap } from "yaml";

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

    *getDocComponents(docMap: YAMLMap): Generator<[string, Component]> {
        for (const k of docMap.items) {
            if (isPair(k) && isScalar(k.key)) {
                const componentName = k.key.value as string;
                if (componentName in this.schema.core.components || this.isPlatform(componentName)) {
                    const component = this.getComponent(componentName);
                    yield [componentName, component];

                    if (this.isPlatform(componentName)) {
                        // iterate elements and lookup platform to load components
                        const platList = docMap.get(componentName);
                        if (isSeq(platList)) {
                            for (const plat of platList.items) {
                                if (isMap(plat)) {
                                    const platCompName = plat.get("platform") as string;
                                    if (platCompName in component.components) {
                                        yield [platCompName + '.' + componentName, this.getComponent(platCompName, componentName)];
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        yield ["core", this.schema.core];
    }

    *getRegistry(registry: string, docMap: YAMLMap): Generator<[string, ConfigVar]> {
        if (registry.includes(".")) {
            // e.g. sensor.filter only items from one component
            const [domain, registryName] = registry.split('.');
            for (const name in this.schema[domain][registryName]) {
                yield [name, this.schema[domain][registryName][name]];
            }
        }
        else {
            // e.g. action, condition: search in all domains
            for (const [componentName, component] of this.getDocComponents(docMap)) {
                if (component[registry] !== undefined) {
                    for (const name in component[registry]) {
                        if (componentName === "core") {
                            yield [name, component[registry][name]];
                        }
                        else {
                            yield [componentName.split('.').reverse().join('.') + '.' + name, component[registry][name]];
                        }
                    }
                }
            }
        }
    }

    getRegistryConfigVar(registry: string, entry: string): ConfigVar {
        if (registry.includes(".")) {
            const [domain, registryName] = registry.split('.');
            return this.getComponent(domain)[registryName][entry];
        }
        else {
            if (entry.includes(".")) {
                const [domain, actionName] = entry.split(".");
                return this.getComponent(domain)[registry][actionName];
            }
            for (const c in this.schema) {
                const schema = this.getComponent(c);
                if (schema[registry] !== undefined && schema[registry][entry] !== undefined) {
                    return schema[registry][entry];
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

    getConfigVarComplete(schema: Schema, key: string): ConfigVar {
        var cv = { ...schema.config_vars[key] };

        const appendCvs = (s: Schema, c: ConfigVar) => {
            if (s.extends !== undefined) {
                for (const extended of s.extends) {
                    const s_ex = this.getExtendedSchema(extended);
                    if (key in s_ex.config_vars) {
                        c = {
                            ...s_ex.config_vars[key],
                            ...c
                        };
                    }
                }
            }
            return c;
        };

        cv = appendCvs(schema, cv);

        return cv;
    }


    * iter_configVars(schema: Schema, docMap: YAMLMap, yielded = []): Generator<[string, ConfigVar]> {
        for (var prop in schema.config_vars) {
            if (schema.extends?.includes("core.MQTT_COMPONENT_SCHEMA") &&
                (prop === "mqtt_id" || prop === "expire_after") && docMap.get("mqtt") === undefined) {
                // filter mqtt props if mqtt is not used
                continue;
            }
            if (yielded.includes(prop)) {
                continue;
            }
            yielded.push(prop);
            yield [prop, this.getConfigVarComplete(schema, prop)];
        }
        if (schema.extends !== undefined) {
            for (var extended of schema.extends) {
                if (extended.startsWith("core.MQTT") && docMap.get("mqtt") === undefined) {
                    continue;
                }
                const s = this.getExtendedSchema(extended);
                for (const pair of this.iter_configVars(s, docMap, yielded)) {
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
