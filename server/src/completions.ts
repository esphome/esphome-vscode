import { Position } from "vscode-languageserver-textdocument";
import { CompletionItem, CompletionItemKind, InsertTextFormat, Range, TextDocument } from "vscode-languageserver/node";
import { isPair, isMap, isScalar, isSeq, YAMLMap, Node, Scalar, isNode } from "yaml";
import { ConfigVar, CoreSchema, Schema, ConfigVarTrigger, ConfigVarRegistry, ConfigVarPin, ConfigVarEnum, ConfigVarSchema } from "./CoreSchema";
import { YamlNode } from "./jsonASTTypes";
import { SingleYAMLDocument, YamlDocuments } from "./parser/yaml-documents";
import { Telemetry } from "./telemetry";
import { matchOffsetToDocument } from "./utils/arrUtils";
import { isNumber, isString } from "./utils/objects";
import { TextBuffer } from "./utils/textBuffer";

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

    constructor(private yamlDocuments: YamlDocuments, private coreSchema: CoreSchema) { }

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

        // // as we modify AST for completion, we need to use copy of original document
        // const originalDoc = currentDoc;
        // currentDoc = currentDoc.clone();

        const docMap = currentDoc.root.internalNode;
        if (!isMap(docMap)) {
            return;
        }

        if (position.character === 0) {

            return this.addCoreComponents(result, currentDoc);
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
            let cv: ConfigVar;
            let pathIndex = 0;
            if (path.length) {
                pathIndex = 1;
                pathElement = docMap.get(path[0]);
                if (this.coreSchema.isPlatform(path[0])) {
                    if (path.length > 1) {
                        // we are in a platform (e.g. sensor) and there are inner stuff
                        if (isNumber(path[1])) {
                            // the index in the sequence
                            const index = path[1];
                            if (isSeq(pathElement)) {
                                pathElement = pathElement.get(index);
                                pathIndex += 1;
                            }
                        }
                    }
                    // else branch not needed here as pathElement should be pointing
                    // to the object with the platform key
                    if (isMap(pathElement)) {
                        const domain = pathElement.get("platform");
                        if (isString(domain)) {
                            cv = this.coreSchema.getComponentPlatformSchema(domain, path[0]);
                        }
                    }
                    if (!cv) {
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
                    pathElement = docMap.get(path[0]);
                    cv = this.coreSchema.getComponentSchema(path[0]);
                }
            }

            if (path.length === 0) {
                this.addCoreComponents(result, currentDoc);
            }
            else {
                // const cv = schema as any as ConfigVar;
                this.resolveConfigVar(result, path, pathIndex, cv, pathElement, node, currentDoc);
                // // schema should be ok at this level
                // if (pathIndex + 1 === path.length) {
                //     // this case might be if a component has any child yet
                //     this.addConfigVars(result, schema, pathElement, docMap);
                //     return result;
                // }

                // // Now that a component is known, revolve completions recursively
                // this.resolveComponent(result, path, pathIndex, schema, pathElement, node, docMap);
            }

        } catch (error) {
            console.log("Completion:" + error);
        }

        return result;
    }

    private resolveSchema(result: CompletionItem[], path: any[], pathIndex: number, schema: Schema, pathElement: YAMLMap, node: YamlNode, currentDoc: SingleYAMLDocument) {
        console.log("component: " + path[pathIndex]);
        const cv = this.coreSchema.findConfigVar(schema, path[pathIndex], currentDoc);
        const innerNode = pathElement.get(path[pathIndex]) as YAMLMap;
        pathIndex++;
        this.resolveConfigVar(result, path, pathIndex, cv, innerNode, node, currentDoc);
    }

    private resolveConfigVar(result: CompletionItem[], path: any[], pathIndex: number, cv: ConfigVar, pathNode: YAMLMap, cursorNode: YamlNode, currentDoc: SingleYAMLDocument) {
        if (cv.is_list && isNumber(path[pathIndex])) {
            if (isSeq(pathNode)) {
                pathNode = pathNode.get(path[pathIndex]) as any as YAMLMap;
            }
            pathIndex++;
        }
        if (cv.type === "schema") {
            if (isMap(pathNode)) {
                if (pathIndex === path.length) {
                    return this.addConfigVars(result, cv.schema, pathNode, currentDoc);
                }
                return this.resolveSchema(result, path, pathIndex, cv.schema, pathNode, cursorNode, currentDoc);
            }
            else {
                if (pathIndex === path.length) {
                    if (isScalar(cursorNode)) {
                        const complete = this.coreSchema.getConfigVarComplete2(cv);
                        if (complete["maybe"] !== undefined) {
                            const mayb_cv = this.coreSchema.findConfigVar(cv.schema, complete["maybe"], currentDoc);
                            return this.resolveConfigVar(result, path, pathIndex, mayb_cv, null, cursorNode, currentDoc);
                        }
                    }

                    return this.addConfigVars(result, cv.schema, null, currentDoc, cv.is_list);
                }
                throw new Error("Expected map not found in " + pathIndex);
            }
        }
        else if (cv.type === "enum") {
            return this.addEnums(result, cv);
        }
        else if (cv.type === "trigger") {
            return this.resolveTrigger(result, path, pathIndex, pathNode, cv, cursorNode, currentDoc);
        }
        else if (cv.type === "registry") {
            let elem: any = pathNode;
            if (isSeq(elem) && elem.items.length) {
                elem = elem.items[path[pathIndex]];
                if (isNode(elem)) {
                    return this.resolveRegistryInner(result, path, pathIndex + 1, isMap(elem) ? elem : null, cv, cursorNode, currentDoc);
                }
            }
            if (isMap(elem)) {
                return this.resolveRegistryInner(result, path, pathIndex, elem, cv, cursorNode, currentDoc);
            }
            return this.resolveRegistryInner(result, path, pathIndex, isMap(elem) ? elem : null, cv, cursorNode, currentDoc);
        }
        else if (cv.type === "typed") {
            if (pathNode === null) {
                result.push({
                    label: cv.typed_key,
                    kind: CompletionItemKind.Enum,
                    insertText: cv.typed_key + ': ',
                    command: { title: 'chain', command: "editor.action.triggerSuggest" }
                });
                return result;
            }
            else if (pathIndex + 1 >= path.length && path[pathIndex] === cv.typed_key) {
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
                if (pathNode !== null && isMap(pathNode)) {
                    const type = pathNode.get(cv.typed_key);
                    if (type !== null && isString(type)) {
                        if (pathIndex === path.length) {
                            return this.addConfigVars(result, cv.types[type], pathNode, currentDoc);
                        }
                        return this.resolveSchema(result, path, pathIndex, cv.types[type], pathNode, cursorNode, currentDoc);
                    }
                    // there are other options but still not `type`
                    result.push({
                        label: cv.typed_key,
                        kind: CompletionItemKind.Enum,
                        insertText: cv.typed_key + ': ',
                        command: { title: 'chain', command: "editor.action.triggerSuggest" }
                    });
                    return result;
                }
            }
        }
        else if (cv.type === "string") {
            if (cv["templatable"]) {
                const item: CompletionItem = {
                    label: "!lambda ",
                    insertTextFormat: InsertTextFormat.Snippet,
                    insertText: "!lambda return \"${0:<string expression>}\";",
                    kind: CompletionItemKind.Function,
                };
                result.push(item);
            }
            return result;
        }

        else if (cv.type === "pin") {
            //if (parentElement.items.length > 0 && isScalar(node) && node === parentElement.items[0].value) {
            // cursor is in the value of the pair
            //    return this.resolvePinNumbers(result, cv);
            //}
            if (!cv.schema) {
                // This pin does not accept schema, e.g. i2c
                return result;
            }



            let pinCv: ConfigVar;

            if (isMap(pathNode)) {
                // Check if it is using a port expander
                for (const expander of this.coreSchema.getPins()) {
                    if (expander !== "esp32" && expander !== "esp8266" && (currentDoc.root.internalNode as YAMLMap).get(expander)) {
                        if (pathNode.get(expander)) {
                            pinCv = this.coreSchema.getPinConfigVar(expander);
                            break;
                        }
                    }
                }
            }

            if (pinCv === undefined) {
                const chipset = this.getChipset(currentDoc);
                if (chipset === "esp32") {
                    pinCv = this.coreSchema.getPinConfigVar("esp32");
                }
                else if (chipset === "esp8266") {
                    pinCv = this.coreSchema.getPinConfigVar("esp8266");
                }
            }

            if (pinCv !== undefined && pinCv.type === "schema" && pathNode === null && !cv.internal) {
                // suggest all expanders
                for (const expander of this.coreSchema.getPins()) {
                    if (expander !== "esp32" && expander !== "esp8266" && (currentDoc.root.internalNode as YAMLMap).get(expander)) {
                        pinCv.schema.config_vars[expander] = { key: "Optional", "type": "string" };
                    }
                }
            }

            return this.resolveConfigVar(result, path, pathIndex, pinCv, pathNode, cursorNode, currentDoc);
        }
        else if (cv.type === "boolean") {
            if (cv["templatable"]) {
                const item: CompletionItem = {
                    label: "!lambda ",
                    insertTextFormat: InsertTextFormat.Snippet,
                    insertText: "!lambda return \"${0:<boolean expression>}\";",
                    kind: CompletionItemKind.Function,
                };
                result.push(item);
            }
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
        else if (cv.type === "use_id") {
            const usableIds = this.coreSchema.getUsableIds(cv.use_id_type, currentDoc);
            for (var usableId of usableIds) {
                const item: CompletionItem = {
                    label: usableId,
                    kind: CompletionItemKind.Variable,
                    insertText: value,
                    // command: { title: 'chain', command: "editor.action.triggerSuggest" }
                };
                result.push(item);
            }
            return result;
        }

        else if (cv["templatable"]) {
            const item: CompletionItem = {
                label: "!lambda",
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: "!lambda return \"${0:<expression>}\";",
                kind: CompletionItemKind.Function,
            };
            result.push(item);
        }
        throw new Error("Unexpected path traverse.");
    }

    getChipset(currentDoc: SingleYAMLDocument): "esp8266" | "esp32" | undefined {
        const docMap = currentDoc.root.internalNode as YAMLMap;
        if (docMap.get("esp8266", true) !== undefined) {
            return "esp8266";
        }
        if (docMap.get("esp32", true) !== undefined) {
            return "esp32";
        }
        const esphome = docMap.get("esphome");
        if (isMap(esphome)) {
            const chipset = esphome.get("platform");
            if (isString(chipset)) {
                if (chipset.toLowerCase() === "esp32") { return "esp32"; }
                if (chipset.toLowerCase() === "esp8266") { return "esp8266"; }
            }
        }
    }

    resolveRegistryInner(result: CompletionItem[], path: any[], pathIndex: number, pathNode: YAMLMap, cv: ConfigVarRegistry, node: YamlNode, doc: SingleYAMLDocument) {
        const final = pathIndex === path.length;
        if (final && pathNode === null) {
            return this.addRegistry(result, cv, doc);
        }
        const registryCv = this.coreSchema.getRegistryConfigVar(cv.registry, path[pathIndex]);
        const inner = pathNode.get(path[pathIndex]);
        return this.resolveConfigVar(result, path, pathIndex + 1, registryCv, isMap(inner) ? inner : null, node, doc);
    }

    resolvePinNumbers(result: CompletionItem[], cv: ConfigVarPin) {

        result.push({
            label: "D0",
            kind: CompletionItemKind.Constant,
            insertText: 'type: ',
            command: { title: 'chain', command: "editor.action.triggerSuggest" }
        });
    }

    resolveTriggerInner(result: CompletionItem[], path: any[], pathIndex: number, pathNode: YamlNode, cv: ConfigVarTrigger, node: YamlNode, doc: SingleYAMLDocument) {
        console.log("resolve inner: " + pathNode?.toString() + ' - cv: ' + cv.type);
        const final = pathIndex === path.length;
        if (final) {
            // If this has a schema, use it, these are suggestions so user will see the trigger parameters even when they are optional
            // However if the only option is 'then:' we should avoid it for readability
            if (cv.schema !== undefined) {
                return this.addConfigVars(result, cv.schema, isMap(pathNode) ? pathNode : null, doc);
            }
            return this.addRegistry(result, { type: "registry", "registry": "action", "key": null }, doc);
        }

        if (path[pathIndex] === "then") {
            // all triggers support then, even when they do not have a schema
            // then is a trigger without schema so...
            let thenNode = pathNode;
            if (isMap(pathNode)) {
                thenNode = pathNode.get("then", true) as YamlNode;
            }
            return this.resolveTrigger(result, path, pathIndex + 1, thenNode, { type: 'trigger', key: 'Optional', schema: undefined, has_required_var: false }, node, doc);
        }

        // navigate into the prop
        // this can be an action or a prop of this trigger
        if (cv.schema !== undefined) {
            const innerProp = this.coreSchema.findConfigVar(cv.schema, path[pathIndex], doc);
            if (innerProp !== undefined) {
                return this.resolveSchema(result, path, pathIndex, cv.schema, isMap(pathNode) ? pathNode : null, node, doc);
            }
        }
        // is this an action?
        const action = this.coreSchema.getActionConfigVar(path[pathIndex]);
        if (action !== undefined) {
            var innerNode: YamlNode;
            if (isMap(pathNode)) {
                innerNode = pathNode.get(path[pathIndex]) as YamlNode;
            }
            if (pathIndex + 1 === path.length && isMap(pathNode)) {
                if (isScalar(node)) {
                    const complete = this.coreSchema.getConfigVarComplete2(action);
                    if (complete.type === 'schema' && complete["maybe"] !== undefined) {
                        const mayb_cv = this.coreSchema.findConfigVar(action.schema, complete["maybe"], doc);
                        return this.resolveConfigVar(result, path, pathIndex, mayb_cv, null, node, doc);
                    }
                    return result;
                }

                return this.addConfigVars(result, action.schema, innerNode as YAMLMap, doc);
            }

            return this.resolveSchema(result, path, pathIndex + 1, action.schema, innerNode as YAMLMap, node, doc);
        }
    }

    resolveTrigger(result: CompletionItem[], path: any[], pathIndex: number, pathNode: YamlNode, cv: ConfigVarTrigger, node: YamlNode, doc: SingleYAMLDocument) {
        console.log("trigger: " + path[pathIndex]);
        // trigger can be a single item on a map or otherwise a seq.
        if (isSeq(pathNode)) {
            let innerNode: YamlNode;
            if (pathIndex < path.length) {
                if (pathNode.items.length) { innerNode = pathNode.items[path[pathIndex]] as YamlNode; }
                return this.resolveTriggerInner(result, path, pathIndex + 1, innerNode, cv, node, doc);
            }
            if (cv.schema && !cv.has_required_var) {
                // if this has a schema, when inside the list we no longer can setup automation props
                cv = cv.schema.config_vars.then as ConfigVarTrigger;
            }
            return this.resolveTriggerInner(result, path, pathIndex, innerNode, cv, node, doc);

        }
        return this.resolveTriggerInner(result, path, pathIndex, isMap(pathNode) ? pathNode : null, cv, node, doc);
    }


    private addPlatformNames(result: CompletionItem[], platform_name: string) {
        const c = this.coreSchema.getComponent(platform_name);

        if (c.components === undefined) {
            console.log(`Error: not a platform ${platform_name}`);
            return result;
        }

        for (var component in c.components) {
            const item: CompletionItem = {
                label: component,
                kind: CompletionItemKind.EnumMember,
                insertText: component + '\n  ',
                command: { title: 'chain', command: "editor.action.triggerSuggest" }
            };
            if (c.components[component].docs !== undefined) {
                item.documentation = {
                    kind: "markdown",
                    value: c.components[component].docs
                };
            }
            result.push(item);
        }

        return result;
    }

    private addCoreComponents(result: CompletionItem[], doc: SingleYAMLDocument) {
        const chipset = this.getChipset(doc);
        const docMap = doc.root.internalNode as YAMLMap;
        // suggest platforms, e.g. sensor:, binary_sensor:
        const platformList = this.coreSchema.getPlatformList();
        for (var platformName in platformList) {
            // Don't add duplicate keys
            if (this.mapHasScalarKey(docMap, platformName)) {
                continue;
            }
            result.push({
                label: platformName,
                documentation: {
                    kind: "markdown",
                    value: platformList[platformName].docs
                },
                kind: CompletionItemKind.Class,
                insertText: platformName + ':\n  - platform: ',
                command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }
        // suggest component/hub e.g. dallas:, sim800l:
        const components = this.coreSchema.getComponentList();
        for (var componentName in components) {
            // skip platforms added in previous loop
            if (componentName in platformList) {
                continue;
            }
            // Don't add duplicate keys
            if (this.mapHasScalarKey(docMap, componentName)) {
                continue;
            }

            // Filter esp32 or esp8266 components only when the other target is used
            if (components[componentName].dependencies) {
                let missingDep = false;
                for (const dep of components[componentName].dependencies) {
                    if (dep === "esp8266" || dep === "esp32") {
                        if (docMap.get(dep) === undefined) {
                            missingDep = true;
                            break;
                        }
                    }
                }
                if (missingDep) {
                    continue;
                }
            }

            result.push({
                label: componentName,
                documentation: {
                    kind: "markdown",
                    value: components[componentName].docs
                },
                kind: CompletionItemKind.Field,
                insertText: componentName + ':\n  ',
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

    private addConfigVars(result: CompletionItem[], schema: Schema, node: YAMLMap, doc: SingleYAMLDocument, isList = false) {
        let preselected = false;
        const ret: { [name: string]: CompletionItem } = {};

        for (const [prop, config] of this.coreSchema.iterConfigVars(schema, doc)) {
            // Skip existent properties
            if (node !== null && this.mapHasScalarKey(node, prop)) {
                continue;
            }
            const item: CompletionItem = {
                label: prop,
                insertText: prop + ': ',
            };
            result.push(item);

            if (isList) {
                item.insertText = "- " + item.insertText;
            }

            let triggerSuggest = false;
            if (config.docs) {
                item.documentation = {
                    kind: 'markdown',
                    value: config.docs,
                };
            }
            if (config["templatable"] !== undefined) {
                item.detail = "lambda";
                triggerSuggest = true;
            }
            else {
                if (config.key === "Required") {
                    item.sortText = "00" + prop;
                    item.detail = "Required";
                }
                else {
                    if (config.type === "integer" || config.type === "string" || config.type === undefined) {
                        if (config["default"] !== undefined) {
                            item.insertTextFormat = InsertTextFormat.Snippet;
                            item.insertText = prop + ': ${0:' + config["default"] + '}';
                        }
                    }
                }
            }

            switch (config.type) {
                case "schema":
                    item.kind = CompletionItemKind.Struct;
                    item.insertText += '\n  ';
                    triggerSuggest = true;
                    break;
                case "typed":
                    item.kind = CompletionItemKind.Struct;
                    item.insertText += '\n  ' + config.typed_key + ': ';
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

            if (triggerSuggest) {
                item.command = { title: 'chain', command: "editor.action.triggerSuggest" };
            }
        }
    }

    addEnums(result: CompletionItem[], cv: ConfigVarEnum) {
        if (cv["templatable"]) {
            const item: CompletionItem = {
                label: "!lambda ",
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: "!lambda return \"${0:<enum expression>}\";",
                kind: CompletionItemKind.Function,
            };
            result.push(item);
        }
        for (var value of cv.values) {
            if (isNumber(value as any)) {
                value = value.toString();
            }
            let c: CompletionItem = {
                label: value,
                kind: CompletionItemKind.EnumMember,
                insertText: value,
                // command: { title: 'chain', command: "editor.action.triggerSuggest" }
            };
            if (cv["default"] === value) {
                c.preselect = true;
            }
            if (cv["values_docs"] !== undefined && cv["values_docs"][value] !== undefined) {
                c.documentation = { kind: "markdown", value: cv["values_docs"][value] };
            }

            result.push(c);
        }
    }

    addRegistry(result: CompletionItem[], configVar: ConfigVarRegistry, doc: SingleYAMLDocument) {
        for (const [value, props] of this.coreSchema.getRegistry(configVar.registry, doc)) {
            if (configVar.filter && !configVar.filter.includes(value)) {
                continue;
            }
            const item: CompletionItem = {
                label: value,
                kind: CompletionItemKind.Keyword,
                insertText: "- " + value + ": ",
                sortText: value.includes(".") ? ("z" + value) : value,
                command: { title: 'chain', command: "editor.action.triggerSuggest" }
            };
            if (props.docs) {
                item.documentation = { kind: "markdown", value: props.docs };
            }
            const completeCv = this.coreSchema.getConfigVarComplete2(props);
            if (!completeCv["maybe"]) {
                item.insertText += "\n    ";
            }

            result.push(item);
        }
    }
}

