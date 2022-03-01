import { createVerify } from "crypto";
import * as fs from "fs";
import path = require("path");
import { Position } from "vscode-languageserver-textdocument";
import { CompletionItem, CompletionItemKind, Range, TextDocument } from "vscode-languageserver/node";
import { isPair, isMap, isScalar, isSeq, YAMLMap, Node, Scalar } from "yaml";
import { coreKnownTags } from "yaml/dist/schema/tags";
import { YamlNode } from "./jsonASTTypes";
import { SingleYAMLDocument, YamlDocuments } from "./parser/yaml-documents";
import { matchOffsetToDocument } from "./utils/arrUtils";
import { isNumber, isString } from "./utils/objects";
import { TextBuffer } from "./utils/textBuffer";


interface SchemaSet {
    [name: string]: Component;
    core: CoreComponent;
}

interface ConfigVarBase {
    key: string;
    detail?: string;
}

interface ConfigVarRegistry extends ConfigVarBase {
    type: 'registry';
    registry: string;
}

interface ConfigVarTrigger extends ConfigVarBase {
    type: 'trigger';
    schema: Schema;
    has_required_var: Boolean;
}

interface ConfigVarEnum extends ConfigVarBase {
    type: 'enum';
    values: string[];
}

interface ConfigVarSchema extends ConfigVarBase {
    type: 'schema';
    schema: Schema;
}
interface ConfigVarTyped extends ConfigVarBase {
    type: 'typed';
    types: {
        [name: string]: Schema;
    };
}
interface ConfigVarPin extends ConfigVarBase {
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

type ConfigVar = ConfigVarSchema | ConfigVarRegistry | ConfigVarEnum | ConfigVarTrigger | ConfigVarTyped | ConfigVarPin | ConfigVarBoolean | ConfigVarString;

interface ConfigVars {
    [name: string]: ConfigVar;
}
interface Schema {
    config_vars: ConfigVars;
    extends: string[];
}
interface Component {
    schemas: {
        [name: string]: Schema;
        CONFIG_SCHEMA: Schema;
    };
    // These are the components e.g. of sensor, binary_sensor
    components: string[];
    action: {
        [name: string]: Schema;
    };
    condition: {
        [name: string]: Schema;
    };
    filter: {
        [name: string]: Schema;
    };
}
interface CoreComponent extends Component {
    platforms: string[];
    components: string[];
    pins: string[];
}
class CoreSchema {
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
        return (this.schema.core.platforms.indexOf(name) !== -1);
    }

    * getRegistry(registry: string): Generator<string> {
        if (registry.includes(".")) {
            const [domain, registryName] = registry.split('.');
            for (const name in this.schema[domain][registryName]) {
                yield name;
            }
        }
        else {
            for (const c in this.schema) {
                if (this.schema[c][registry] !== undefined) {
                    for (const name in this.schema[c][registry]) {
                        yield ((c === "core") ? "" : (c + ".")) + name;
                    }
                }
            }
        }
    }

    getRegistrySchema(registry: string, entry: string): Schema {
        if (registry === "action") {
            for (const c in this.schema) {
                if (this.schema[c].action !== undefined) {
                    for (const action_name in this.schema[c].action) {
                        if (action_name === entry) {
                            return this.schema[c].action[action_name];
                        }
                    }
                }

            }
        }
    }
    getActionSchema(entry: string) {
        return this.getRegistrySchema("action", entry);
    }
    getPinSchema(component: string): Schema {
        return this.getComponent(component)["pin"];
    }
    getPins(): string[] {
        return this.schema.core.pins;
    }
}
interface PlatformSchema {
    name: string;
    components: Component[];
    schema: Schema;
}

export class CompletionHandler {


    getPath(node: YamlNode, currentDoc: SingleYAMLDocument) {
        const path = [];
        let child: YamlNode;
        while (node) {
            if (isPair(node)) {
                if (isScalar(node.key)) {
                    path.push(node.key.value);
                }
            }
            if (isSeq(node) && child !== undefined) {
                path.push(node.items.indexOf(child));
            }
            child = node;
            node = currentDoc.getParent(node);
        }
        return path.reverse();
    }

    dumpNode(node: YamlNode, currentDoc: SingleYAMLDocument) {
        const strArr = [];
        while (node) {
            let log_str: string;
            if (isScalar(node)) {
                log_str = `scalar ${node.value}`;
            }
            else if (isMap(node)) {
                log_str = `map ${node.items.length}`;
            }
            else if (isPair(node)) {
                log_str = `pair key: ${node.key} value: ${node.value} `;
            }
            else if (isSeq(node)) {
                log_str = `seq ${node.items.length}`;
            }
            else {
                log_str = "unknown" + node.toString();
            }
            strArr.push(log_str);
            node = currentDoc.getParent(node);
        }

        let i = 0;
        for (const strLine of strArr.reverse()) {
            console.log(`${i++} ${strLine}`);
        }
    }

    private getCurrentWord(doc: TextDocument, offset: number): string {
        let i = offset - 1;
        const text = doc.getText();
        while (i >= 0 && ' \t\n\r\v":{[,]}'.indexOf(text.charAt(i)) === -1) {
            i--;
        }
        return text.substring(i + 1, offset);
    }

    private core_schema: CoreSchema;

    constructor(
        private yamlDocuments: YamlDocuments) {

        this.core_schema = new CoreSchema();
    }

    onCompletion = (document: TextDocument, position: Position): CompletionItem[] => {
        let result: CompletionItem[] = [];

        // tslint:disable-next-line: curly
        if (!document)
            return result;

        const doc = this.yamlDocuments.getYamlDocument(document, {
            customTags: ["!secret scalar", "!lambda scalar", "!include scalar"], yamlVersion: "1.1"
        }, true);

        const textBuffer = new TextBuffer(document);

        // if (!this.configuredIndentation) {
        //   const indent = guessIndentation(textBuffer, 2, true);
        //   this.indentation = indent.insertSpaces ? ' '.repeat(indent.tabSize) : '\t';
        // } else {
        //   this.indentation = this.configuredIndentation;
        // }

        const offset = document.offsetAt(position);

        // Do not show completions when next to ':'
        if (document.getText().charAt(offset - 1) === ':') {
            return result;
        }

        let currentDoc = matchOffsetToDocument(offset, doc);
        if (currentDoc === null) {
            return result;
        }

        // as we modify AST for completion, we need to use copy of original document
        const originalDoc = currentDoc;
        currentDoc = currentDoc.clone();

        const docMap = currentDoc.root.internalNode;
        if (!isMap(docMap)) {
            return;
        }

        if (position.character === 0) {

            return this.addCoreComponents(result, docMap);
        }

        let [node, foundByClosest] = currentDoc.getNodeFromPosition(offset, textBuffer);
        const currentWord = this.getCurrentWord(document, offset);


        let overwriteRange = null;
        if (node && isScalar(node) && node.value === 'null') {
            const nodeStartPos = document.positionAt(node.range[0]);
            nodeStartPos.character += 1;
            const nodeEndPos = document.positionAt(node.range[2]);
            nodeEndPos.character += 1;
            overwriteRange = Range.create(nodeStartPos, nodeEndPos);
        } else if (node && isScalar(node) && node.value) {
            const start = document.positionAt(node.range[0]);
            if (offset > 0 && start.character > 0 && document.getText().charAt(offset - 1) === '-') {
                start.character -= 1;
            }
            overwriteRange = Range.create(start, document.positionAt(node.range[1]));
        } else {
            let overwriteStart = document.offsetAt(position) - currentWord.length;
            if (overwriteStart > 0 && document.getText()[overwriteStart - 1] === '"') {
                overwriteStart--;
            }
            overwriteRange = Range.create(document.positionAt(overwriteStart), position);
        }

        let lineContent = textBuffer.getLineContent(position.line);
        if (lineContent.endsWith('\n')) {
            lineContent = lineContent.substr(0, lineContent.length - 1);
        }
        let originalNode = node;

        try {
            if (node) {
                // Are we in the value side of a map? (this fix for when the cursor is at the right of : and sometimes (depending whitespace after the caret)
                // the returned node is not the value node of the pair but the map itself)
                if (isMap(node)
                    && isPair(node.items[0])
                    && isScalar(node.items[0].key)
                    && isScalar(node.items[0].value)
                    && node.items[0].key.range[2] < offset
                    && node.items[0].value.range[0] > offset) {
                    // are we at the right side of :
                    console.log("we are in the scalar null? value");
                    node = node.items[0].value;
                }
                originalNode = node;
            }

            if (!foundByClosest && isScalar(node)) {
                const p1 = currentDoc.getParent(node);
                if (isPair(p1) && p1.value === null) {
                    // seems to be writing on a key still without value
                    const p2 = currentDoc.getParent(p1);
                    if (isMap(p2)) {
                        node = p2;
                    }
                }
            }

            this.dumpNode(node, currentDoc);
            const p1 = currentDoc.getParent(node);

            var path = this.getPath(node, currentDoc);

            console.log("path " + path.join(' - ') + ' found by closest: ' + foundByClosest);

            // At this point node and path should be meaningful and consistent
            // Path is were completions need to be listed, it really doesn't matter where the cursor is, cursor shouldn't be checked
            // to see what completions are need anymore

            // List items under - platform: |
            if (isPair(p1) && isScalar(p1.key)) {
                if (p1.key.value === "platform") {
                    const p2 = currentDoc.getParent(p1);
                    if (isMap(p2)) {
                        const p3 = currentDoc.getParent(p2);
                        if (isSeq(p3)) {
                            const p4 = currentDoc.getParent(p3);
                            if (isPair(p4) && isScalar(p4.key)) {
                                const platform_name = p4.key.value as string;
                                return this.addPlatformNames(result, platform_name);
                            }
                        }
                    }
                }
            }

            let pathElement;
            // First get the root component
            let schema: Schema;
            let pathIndex = 0;
            if (path.length) {
                pathElement = docMap.get(path[0]);
                if (this.core_schema.isPlatform(path[0])) {
                    if (path.length > 1) {
                        // we are in a platform (e.g. sensor) and there are inner stuff
                        if (isNumber(path[1])) {
                            // the index in the sequence
                            const index = path[1];
                            if (isSeq(pathElement)) {
                                pathElement = pathElement.get(index);
                                pathIndex++;
                            }
                        }
                    }
                    // else branch not needed here as pathElement should be pointing
                    // to the object with the platform key
                    if (isMap(pathElement)) {
                        const domain = pathElement.get("platform");
                        if (isString(domain)) {
                            // this.resolvePlatformComponent(result, path[0], domain, rootComponentMap);
                            schema = this.core_schema.getComponentPlatformSchema(domain, path[0]);
                            // return result;
                        }
                    }
                    if (!schema) {
                        result.push({
                            label: "platform",
                            kind: CompletionItemKind.EnumMember,
                            insertText: isSeq(currentDoc.getParent(node)) ? 'platform: ' : '- platform: ',
                            command: { title: 'chain', command: "editor.action.triggerSuggest" }
                        });
                        return result;
                    }
                }
                else {
                    schema = this.core_schema.getComponentSchema(path[0]);
                }
            }

            if (path.length === 0) {
                this.addCoreComponents(result, docMap);
            }
            else {
                // schema should be ok at this level
                if (pathIndex + 1 === path.length) {
                    // this case might be if a component has any child yet
                    this.addConfigVars(result, schema, pathElement, docMap);
                    return result;
                }

                // Now that a component is known, revolve completions recursively
                this.resolveComponent(result, path, pathIndex, schema, pathElement, node, docMap);
            }
            return result;

        } catch (error) {
            console.log("ERROR:" + JSON.stringify(error));
        }

        return result;
    }

    private resolveComponent(result: CompletionItem[], path: any[], pathIndex: number, schema: Schema, pathElement: YAMLMap, node: YamlNode, docMap: YAMLMap) {
        console.log("component: " + path[pathIndex]);
        pathIndex++;
        this.resolveConfigVar(result, path, pathIndex, this.findConfigVar(schema, path[pathIndex], docMap), pathElement, node, docMap);
    }

    private resolveConfigVar(result: CompletionItem[], path: any[], pathIndex: number, cv: ConfigVar, pathElement: YAMLMap, node: YamlNode, docMap: YAMLMap) {

        if (isMap(pathElement) && isString(path[pathIndex])) {
            if (cv.type === "schema") {
                const innerElement = pathElement.get(path[pathIndex]);
                if (isMap(innerElement)) {
                    if (pathIndex + 1 === path.length) {
                        return this.addConfigVars(result, cv.schema, innerElement, docMap);
                    }
                    return this.resolveComponent(result, path, pathIndex, cv.schema, innerElement, node, docMap);
                }
                else {
                    if (pathIndex + 1 === path.length) {
                        return this.addConfigVars(result, cv.schema, null, docMap);
                    }
                    throw new Error("Expected map not found in " + pathIndex);
                }
            }
            else if (cv.type === "enum") {
                return this.addEnums(result, cv);
            }
            else if (cv.type === "trigger") {
                return this.resolveTrigger(result, path, pathIndex, pathElement, cv, node, docMap);
            }
            else if (cv.type === "registry") {
                if (pathIndex + 1 < path.length) {
                    if (isNumber(path[pathIndex + 1])) {
                        const item = pathElement.items[path[pathIndex + 1]];
                        if (isPair(item)) {
                            // is this an action?
                            const action = this.core_schema.getActionSchema(item.key.toString());
                            if (action !== undefined) {
                                if (pathIndex + 3 === path.length) {
                                    return this.addConfigVars(result, action, pathElement, docMap);
                                }
                                return this.resolveComponent(result, path, pathIndex + 3, action, pathElement, node, docMap);
                            }
                        }
                    }
                    if (isString(path[pathIndex + 1])) {
                        const inner = pathElement.get(path[pathIndex + 1]);
                        // we should only have actions here, maps should be one key only
                        if (isMap(inner)) {
                            const item = inner.items[0];
                            if (isPair(item)) {
                                // is this an action?
                                const action = this.core_schema.getActionSchema(item.key.toString());
                                if (action !== undefined) {
                                    if (pathIndex + 3 === path.length) {
                                        return this.addConfigVars(result, action, inner, docMap);
                                    }
                                    return this.resolveComponent(result, path, pathIndex + 3, action, inner, node, docMap);
                                }
                            }
                        }
                    }
                }
                return this.addRegistry(result, cv.registry);
            }
            else if (cv.type === "typed") {
                const innerElement = pathElement.get(path[pathIndex]);
                if (innerElement === null) {
                    result.push({
                        label: "type",
                        kind: CompletionItemKind.Enum,
                        insertText: 'type: ',
                        command: { title: 'chain', command: "editor.action.triggerSuggest" }
                    });
                    return result;
                }
                else if (pathIndex + 2 >= path.length && path[pathIndex + 1] === "type") {
                    for (const schema_type in cv.types) {
                        result.push({
                            label: schema_type,
                            kind: CompletionItemKind.Enum,
                            insertText: schema_type + '\n',
                            command: { title: 'chain', command: "editor.action.triggerSuggest" }
                        });
                    }
                    return result;
                }
                else {
                    if (innerElement !== null && isMap(innerElement)) {
                        const type = innerElement.get('type');
                        if (type !== null && isString(type)) {
                            if (pathIndex + 1 === path.length) {
                                return this.addConfigVars(result, cv.types[type], innerElement, docMap);
                            }
                            return this.resolveComponent(result, path, pathIndex, cv.types[type], innerElement, node, docMap);
                        }
                    }
                }
            }
            else if (cv.type === "string") {
                return result;
            }

            else if (cv.type === "pin") {
                if (pathElement.items.length > 0 && isScalar(node) && node === pathElement.items[0].value) {
                    // cursor is in the value of the pair
                    return this.resolvePinNumbers(result, cv);
                }
                if (!cv.schema) {
                    // This pin does not accept schema, e.g. i2c
                    return result;
                }

                const innerElement = pathElement.get(path[pathIndex]);

                let schema: Schema;

                if (isMap(innerElement)) {
                    // Check if it is using a port expander
                    for (const expander of this.core_schema.getPins()) {
                        if (expander !== "esp32" && expander !== "esp8266" && docMap.get(expander)) {
                            if (innerElement.get(expander)) {
                                schema = this.core_schema.getPinSchema(expander);
                                break;
                            }
                        }
                    }
                }

                if (schema === undefined) {
                    if (docMap.get("esp32")) { // TODO: Support old esphome / board
                        schema = this.core_schema.getPinSchema("esp32");
                    }
                    else if (docMap.get("esp8266")) {
                        schema = this.core_schema.getPinSchema("esp8266");
                    }
                }

                if (schema !== undefined && innerElement === null && !cv.internal) {
                    // suggest all expanders
                    for (const expander of this.core_schema.getPins()) {
                        if (expander !== "esp32" && expander !== "esp8266" && docMap.get(expander)) {
                            schema.config_vars[expander] = { key: "Optional", "type": "string" };
                        }
                    }
                }

                return this.resolveConfigVar(result, path, pathIndex, {
                    type: "schema",
                    key: "Optional",
                    schema: schema,
                }, pathElement, node, docMap);
            }
            else if (cv.type === "boolean") {
                for (var value of ["True", "False"]) {
                    const item: CompletionItem = {
                        label: value,
                        kind: CompletionItemKind.Constant,
                        insertText: value,
                        // command: { title: 'chain', command: "editor.action.triggerSuggest" }
                    };
                    item.preselect = (cv.default === value);
                    result.push(item);
                }
                return result;
            }
        }

        throw new Error("Unexpected path traverse.");
    }
    resolvePinNumbers(result: CompletionItem[], cv: ConfigVarPin) {

        result.push({
            label: "D0",
            kind: CompletionItemKind.Constant,
            insertText: 'type: ',
            command: { title: 'chain', command: "editor.action.triggerSuggest" }
        });
    }

    resolveTrigger(result: CompletionItem[], path: any[], pathIndex: number, pathElement: YAMLMap<unknown, unknown>, cv: ConfigVarTrigger, node: YamlNode, docMap: YAMLMap) {
        console.log("trigger: " + path[pathIndex]);
        // trigger can be a single item on a map or otherwise a seq.
        let inner = pathElement.get(path[pathIndex]);
        if (isMap(inner)) {
            const final = pathIndex + 1 === path.length;
            if (final) {
                // show autocomplete for other props, like then, (depending on trigger schema, on_value_range / above; on_boot / priority, etc)
                this.addConfigVars(result, cv.schema, inner, docMap);
                return;
            }

            if (path[pathIndex + 1] === "then") {
                // all triggers support then, even when they do not have a schema
                // then is a trigger without schema so...
                return this.resolveTrigger(result, path, pathIndex + 1, inner, { type: 'trigger', key: 'Optional', schema: undefined, has_required_var: false }, node, docMap);
            }

            // navigate into the prop
            // this can be an action or a prop of this trigger
            if (cv.schema !== undefined) {
                const innerProp = this.findConfigVar(cv.schema, path[pathIndex + 1], docMap);
                if (innerProp !== undefined) {
                    return this.resolveComponent(result, path, pathIndex + 1, cv.schema, inner, node, docMap);
                }
            }
            // is this an action?
            const action = this.core_schema.getActionSchema(path[pathIndex + 1]);
            if (action !== undefined) {
                if (pathIndex + 2 === path.length) {
                    return this.addConfigVars(result, action, inner, docMap);
                }
                return this.resolveComponent(result, path, pathIndex + 1, action, inner, node, docMap);
            }

            return this.resolveComponent(result, path, pathIndex + 1, cv.schema, inner, node, docMap);

        }
        if (isSeq(inner)) {
            if (pathIndex + 2 < path.length) {
                // navigate into seq
                inner = inner.items[path[pathIndex + 1]];
                // we should only have actions here, maps should be one key only
                if (isMap(inner)) {
                    const item = inner.items[0];
                    if (isPair(item)) {
                        // is this an action?
                        const action = this.core_schema.getActionSchema(item.key.toString());
                        if (action !== undefined) {
                            if (pathIndex + 3 === path.length) {
                                return this.addConfigVars(result, action, inner, docMap);
                            }
                            return this.resolveComponent(result, path, pathIndex + 2, action, inner, node, docMap);
                        }
                    }
                }
            }
            this.addRegistry(result, "action");
            return;
        }
        if (inner === null) {
            // This is an empty action
            // If this has a schema, use it, these are suggestions so user will see the trigger parameters even when they are optional
            // However if the only option is 'then:' we should avoid it for readability
            if (cv.schema !== undefined) {
                return this.addConfigVars(result, cv.schema, null, docMap);
            }
            else {
                return this.addRegistry(result, "action");
            }
        }
    }


    private addPlatformNames(result: CompletionItem[], platform_name: string) {
        const c = this.core_schema.getComponent(platform_name);

        if (c.components === undefined) {
            console.log(`Error: not a platform ${platform_name}`);
            return result;
        }

        for (var component of c.components) {
            result.push({
                label: component,
                kind: CompletionItemKind.EnumMember,
                insertText: component + '\n  ',
                command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }

        return result;
    }

    private addCoreComponents(result: CompletionItem[], docMap: YAMLMap) {
        // suggest platforms, e.g. sensor:, binary_sensor:
        const platformList = this.core_schema.getPlatformList();
        for (var name of platformList) {
            // Don't add duplicate keys
            if (this.mapHasScalarKey(docMap, name)) {
                continue;
            }
            result.push({
                label: name,
                kind: CompletionItemKind.Class,
                insertText: name + ':\n  - platform: ',
                command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }
        // suggest component/hub e.g. dallas:, sim800l:
        for (var component of this.core_schema.getComponentList()) {
            // skip platforms added in previous loop
            if (platformList.indexOf(component) !== -1) {
                continue;
            }
            // Don't add duplicate keys
            if (this.mapHasScalarKey(docMap, component)) {
                continue;
            }
            result.push({
                label: component,
                kind: CompletionItemKind.Field,
                insertText: component + ':\n  ',
                command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }
        return result;
    }

    private mapHasScalarKey(map: YAMLMap, key: string): boolean {
        for (var item of map.items) {
            if (isScalar(item.key) && item.key.value === key) {
                return true;
            }
        }
        return false;
    }

    private addConfigVars(result: CompletionItem[], schema: Schema, node: YAMLMap, docMap: YAMLMap) {
        let preselected = false;
        for (const [prop, config] of this.iter_configVars(schema, docMap)) {
            // Skip existent properties
            if (node !== null && this.mapHasScalarKey(node, prop)) {
                continue;
            }
            let triggerSuggest = false;
            const item: CompletionItem = {
                label: prop,
                insertText: prop + ': '
            };
            if (config.detail) {
                item.detail = config.detail;
            }
            else {
                item.detail = config.key;
            }

            switch (config.type) {
                case "schema":
                    item.kind = CompletionItemKind.Struct;
                    item.insertText += '\n  ';
                    triggerSuggest = true;
                    break;
                case "enum":
                    item.kind = CompletionItemKind.Enum;
                    triggerSuggest = true;
                    break;
                case "trigger":
                    item.kind = CompletionItemKind.Event;
                    break;
                case "registry":
                    item.kind = CompletionItemKind.Field;
                    break;
                case "pin":
                    item.kind = CompletionItemKind.Interface;
                    break;
                case "boolean":
                    triggerSuggest = true;
                    item.kind = CompletionItemKind.Variable;
                    break;
                default:
                    item.kind = CompletionItemKind.Property;
                    break;
            }
            if (config.key === "Required" && !preselected) {
                item.preselect = true;
                preselected = true;
            }

            if (triggerSuggest) {
                item.command = { title: 'chain', command: "editor.action.triggerSuggest" };
            }
            result.push(item);
        }
    }

    * iter_configVars(schema: Schema, docMap: YAMLMap): Generator<[string, ConfigVar]> {
        for (var prop in schema.config_vars) {
            if (prop === "mqtt_id" && docMap.get("mqtt") === undefined) {
                continue;
            }
            yield [prop, schema.config_vars[prop]];
        }
        if (schema.extends !== undefined) {
            for (var extended of schema.extends) {
                if (extended.startsWith("core.MQTT") && docMap.get("mqtt") === undefined) {
                    continue;
                }
                const s = this.core_schema.getExtendedSchema(extended);
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


    addEnums(result: CompletionItem[], cv: ConfigVarEnum) {
        for (var value of cv.values) {
            result.push({
                label: value,
                kind: CompletionItemKind.EnumMember,
                insertText: value,
                // command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }
    }

    addRegistry(result: CompletionItem[], registry: string) {
        for (var value of this.core_schema.getRegistry(registry)) {
            result.push({
                label: value,
                kind: CompletionItemKind.Keyword,
                insertText: "- " + value + ": ",
                // command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }
    }
}

