import * as fs from "fs";
import path = require("path");
import { isMap, isPair, isScalar, isSeq, YAMLMap } from "yaml";
import { Range } from "yaml/dist/nodes/Node";
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
    maybe?: string;
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
                const parts = entry.split('.');
                if (parts.length === 3) {
                    const [domain, platform, actionName] = parts;
                    return this.getComponent(platform, domain)[registry][actionName];
                }
                else {
                    const [domain, actionName] = parts;
                    return this.getComponent(domain)[registry][actionName];
                }
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

    * iterConfigVars(schema: Schema, doc: SingleYAMLDocument, yielded = []): Generator<[string, ConfigVar]> {
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
                    for (const pair of this.iterConfigVars(s.schema, doc, yielded)) {
                        yield pair;
                    }
                }
            }
        }
    }

    findConfigVar(schema, prop, doc: SingleYAMLDocument): ConfigVar {
        for (const [p, config] of this.iterConfigVars(schema, doc)) {
            if (p === prop) {
                return config;
            }
        }
        return undefined;
    }


    * iterDeclaringIdsInner(idType: string, map: YAMLMap, declaringCv: ConfigVar, doc: SingleYAMLDocument): Generator<YamlNode> {
        let schema: Schema;
        if (declaringCv.type === "schema") {
            schema = declaringCv.schema;
        }
        else if (declaringCv.type === "typed") {
            const schemaType = map.get(declaringCv.typed_key) as string;
            schema = declaringCv.types[schemaType];
        }
        else {
            return;
        }
        for (const k of map.items) {
            if (isPair(k) && isScalar(k.key)) {
                const propName = k.key.value as string;
                const cv = this.findConfigVar(schema, propName, doc);
                if (cv) {
                    const idCv = cv as any as ConfigVarId;
                    if (idCv.id_type && (idCv.id_type.class === idType || idCv.id_type.parents?.includes(idType))) {
                        yield k.value as YamlNode;
                    }
                    if (isMap(k.value)) {
                        for (const yieldNode of this.iterDeclaringIdsInner(idType, k.value, cv, doc)) {
                            yield yieldNode;
                        }
                    }
                    else if (cv.is_list && isSeq(k.value)) {
                        for (const seqItem of k.value.items) {
                            if (isMap(seqItem)) {
                                for (const yieldNode of this.iterDeclaringIdsInner(idType, seqItem, cv, doc)) {
                                    yield yieldNode;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    * iterDeclaringIds(idType: string, doc: SingleYAMLDocument): Generator<YamlNode> {
        const docMap = doc.root.internalNode as YAMLMap;
        for (const k of docMap.items) {
            if (isPair(k) && isScalar(k.key)) {
                const componentName = k.key.value as string;
                if (componentName in this.schema.core.components || this.isPlatform(componentName)) {
                    const component = this.getComponent(componentName);
                    const cv = component.schemas.CONFIG_SCHEMA;
                    if (isMap(k.value) && isScalar(k.value.get("id", true)) && cv) {
                        for (const yieldNode of this.iterDeclaringIdsInner(idType, k.value, cv, doc)) { yield yieldNode; }
                    }
                    else if (isSeq(k.value) && cv && cv.is_list) {
                        const nodeList = k.value;
                        for (const item of nodeList.items) {
                            if (isMap(item) && isScalar(item.get("id", true)) && cv) {
                                for (const yieldNode of this.iterDeclaringIdsInner(idType, item, cv, doc)) { yield yieldNode; }
                            }
                        }
                    }
                    if (this.isPlatform(componentName)) {
                        // iterate elements and lookup platform to load components
                        const platNode = k.value;
                        if (isSeq(platNode)) {
                            for (const seqItemNode of platNode.items) {
                                if (isMap(seqItemNode)) {
                                    const platCompName = seqItemNode.get("platform") as string;
                                    if (platCompName in component.components) {
                                        const platCv = this.getComponent(platCompName, componentName).schemas.CONFIG_SCHEMA;
                                        for (const yieldNode of this.iterDeclaringIdsInner(idType, seqItemNode, platCv, doc)) { yield yieldNode; }
                                    }
                                }
                            }
                        }
                        else if (isMap(platNode)) {
                            const platCompName = platNode.get("platform") as string;
                            if (platCompName in component.components) {
                                const platCv = this.getComponent(platCompName, componentName).schemas.CONFIG_SCHEMA;
                                for (const yieldNode of this.iterDeclaringIdsInner(idType, platNode, platCv, doc)) { yield yieldNode; }
                            }
                        }
                    }
                }
            }
        }
    }

    findComponentDefinition(id_type: string, id: string, doc: SingleYAMLDocument): Range {
        for (const item of this.iterDeclaringIds(id_type, doc)) {
            if (isScalar(item) && item.value === id) {
                return item.range;
            }
        }
        return null;
    }

    getUsableIds(use_id_type: string, doc: SingleYAMLDocument): string[] {
        const ret: string[] = [];
        for (const item of this.iterDeclaringIds(use_id_type, doc)) {
            ret.push(item.toString());
        }
        return ret;
    }
}
