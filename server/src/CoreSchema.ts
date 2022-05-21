import * as fs from "fs";
import path = require("path");
import { isMap, isPair, isScalar, isSeq, YAMLMap } from "yaml";
import { YamlNode } from "./jsonASTTypes";
import { SingleYAMLDocument } from "./parser/yamlParser07";

export interface SchemaSet {
    [name: string]: Component;
    core: CoreComponent;
}

interface ConfigVarBase {
    key: string;
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

export interface ConfigVarSchema extends ConfigVarBase {
    type: 'schema';
    schema: Schema;
}

export interface ConfigVarTyped extends ConfigVarBase {
    type: 'typed';
    typed_key: string;
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
    type: 'string' | 'integer';
    default?: string;
}
export interface ConfigVarUseId extends ConfigVarBase {
    type: 'use_id';
    use_id_type: string;
}

export interface ConfigVarId {
    id_type: {
        class: string;
        parents: string[];
    };
}

export type ConfigVar = ConfigVarSchema | ConfigVarRegistry | ConfigVarEnum | ConfigVarTrigger | ConfigVarTyped | ConfigVarPin | ConfigVarBoolean | ConfigVarString | ConfigVarUseId;

interface ConfigVars {
    [name: string]: ConfigVar;
    id?: ConfigVar & ConfigVarId;
}

export interface Schema {
    config_vars: ConfigVars;
    extends: string[];
}

interface Component {
    schemas: {
        [name: string]: ConfigVar;
        CONFIG_SCHEMA: ConfigVar;
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
    components: { [name: string]: { docs?: string, dependencies?: string[] } };
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

    getComponentSchema(domain: string): ConfigVar {
        const component = this.getComponent(domain);
        return component.schemas.CONFIG_SCHEMA;
    }
    getComponentPlatformSchema(domain: string, platform: string): ConfigVar {
        const component = this.getComponent(domain, platform);
        return component.schemas.CONFIG_SCHEMA;
    }

    private readFile(name: string) {
        const jsonPath = path.join(__dirname, `schema/${name}.json`);
        const fileContents = fs.readFileSync(jsonPath, "utf-8");
        return JSON.parse(fileContents);
    }


    getExtendedConfigVar(name: string): ConfigVar {
        const parts = name.split('.');
        const c = this.getComponent(parts[0]);
        return c.schemas[parts[1]];
    }

    isPlatform(name: string): boolean {
        return (name in this.schema.core.platforms);
    }

    *getDocComponents(doc: SingleYAMLDocument): Generator<[string, Component, YamlNode]> {
        const docMap = doc.root.internalNode as YAMLMap;
        for (const k of docMap.items) {
            if (isPair(k) && isScalar(k.key)) {
                const componentName = k.key.value as string;
                if (componentName in this.schema.core.components || this.isPlatform(componentName)) {
                    const component = this.getComponent(componentName);
                    yield [componentName, component, k.value as YamlNode];

                    if (this.isPlatform(componentName)) {
                        // iterate elements and lookup platform to load components
                        const platList = docMap.get(componentName);
                        if (isSeq(platList)) {
                            for (const plat of platList.items) {
                                if (isMap(plat)) {
                                    const platCompName = plat.get("platform") as string;
                                    if (platCompName in component.components) {
                                        yield [platCompName + '.' + componentName, this.getComponent(platCompName, componentName), plat];
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        yield ["core", this.schema.core, undefined];
    }

    *getRegistry(registry: string, doc: SingleYAMLDocument): Generator<[string, ConfigVar]> {
        if (registry.includes(".")) {
            // e.g. sensor.filter only items from one component
            const [domain, registryName] = registry.split('.');
            for (const name in this.schema[domain][registryName]) {
                yield [name, this.schema[domain][registryName][name]];
            }
        }
        else {
            // e.g. action, condition: search in all domains
            for (const [componentName, component] of this.getDocComponents(doc)) {
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
    getPinConfigVar(component: string): ConfigVar {
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
                    const s_cv = this.getExtendedConfigVar(extended);
                    if (s_cv.type === "schema") {
                        if (key in s_cv.schema.config_vars) {
                            c = {
                                ...s_cv.schema.config_vars[key],
                                ...c
                            };
                        }
                        c = appendCvs(s_cv.schema, c);
                    }
                }
            }
            return c;
        };
        cv = appendCvs(schema, cv);
        return cv;
    }

    getConfigVarComplete2(cv: ConfigVar): ConfigVar {
        var ret = { ...cv };

        if (cv.type === 'schema' && cv.schema.extends !== undefined) {
            for (const extended of cv.schema.extends) {
                const s_cv = this.getExtendedConfigVar(extended);
                ret = {
                    ...s_cv,
                    ...ret
                };
            }
        }

        return ret;
    }

    * iter_configVars(schema: Schema, doc: SingleYAMLDocument, yielded = []): Generator<[string, ConfigVar]> {
        const docMap = doc.root.internalNode as YAMLMap;
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
                const s = this.getExtendedConfigVar(extended);
                if (s.type === "schema") {
                    for (const pair of this.iter_configVars(s.schema, doc, yielded)) {
                        yield pair;
                    }
                }
            }
        }
    }

    findConfigVar(schema, prop, doc: SingleYAMLDocument): ConfigVar {
        for (const [p, config] of this.iter_configVars(schema, doc)) {
            if (p === prop) {
                return config;
            }
        }
        return undefined;
    }

    getUsableIds(use_id_type: string, doc: SingleYAMLDocument): string[] {
        const ret: string[] = [];

        const pushIds = (node: YamlNode) => {
            if (isSeq(node)) {
                for (const item of node.items) {
                    pushIds(item as YamlNode);
                }
                return;
            }
            if (isMap(node)) {
                const given_id = node.get("id");
                if (given_id) {
                    ret.push(given_id.toString());
                }
            }
        };

        for (const [componentName, component, node] of this.getDocComponents(doc)) {
            const cs = component.schemas.CONFIG_SCHEMA;
            if (cs && cs.type === "schema") {
                const schema_id = this.findConfigVar(cs.schema, "id", doc) as any as ConfigVarId;
                if (schema_id && (schema_id.id_type.class === use_id_type || schema_id.id_type.parents?.includes(use_id_type))) {
                    pushIds(node);
                }
            }
        }
        return ret;
    }

}
