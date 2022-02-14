import * as fs from "fs";
import path = require("path");
import { CompletionItem, CompletionItemKind, Range, TextDocument, TextDocumentPositionParams, TextDocuments } from "vscode-languageserver/node";
import { isNode, isPair, isMap, isScalar, isSeq, YAMLMap, Node, Scalar } from "yaml";
import { YamlNode } from "./jsonASTTypes";
import { SingleYAMLDocument, YamlDocuments } from "./parser/yaml-documents";
import { matchOffsetToDocument } from "./utils/arrUtils";
import { indexOf, isMapContainsEmptyPair } from "./utils/astUtils";
import { TextBuffer } from "./utils/textBuffer";


interface Schema {
    config_vars: {};
    extends: string[];
}
interface SchemaSet {
    component: Schema;
    [name: string]: Schema;
}
interface Component {
    name: string;
    multi_conf: Boolean;
    loaded: Boolean;
    schema: SchemaSet;
    /// Name of the included components when this is a platform component
    platforms: string[];
}

class CoreSchema {

    constructor() {
        const initData = this.readFile("core");
        this.platforms = initData["platforms"];
        this.components = initData["components"];
        this.extended = initData["extended"];
    }

    platforms: string[];
    components: {
        [name: string]: Component;
    };
    extended: {
        [name: string]: Schema;
    };

    getComponent(domain: string) {
        const component = this.components[domain];
        if (component?.loaded !== true) {
            this.readComponentSchema(domain);
        }
        return this.components[domain];
    }
    getComponentPlatformSchema(domain: string, platform: string): Schema {
        const component = this.getComponent(domain);
        return component.schema[platform];
    }

    private readFile(name: string) {
        const jsonPath = path.join(__dirname, `schema/${name}.json`);
        const fileContents = fs.readFileSync(jsonPath, "utf-8");
        return JSON.parse(fileContents);
    }

    private readComponentSchema(name: string) {
        const read = this.readFile(name);

        if (this.components[name] === undefined) {
            this.components[name] = read;
        }
        else {
            const component = this.components[name];
            for (var k in read) {
                component[k] = {
                    ...component[k],
                    ...read[k]
                };
            }
        }
        this.components[name].loaded = true;
    }

    getExtendedSchema(name: string) {
        const e = this.extended[name];
        if (e !== undefined) {
            return e;
        }
        const comp = this.components[name];
        if (comp !== undefined) {
            return comp.schema.component;
        }
        // TODO: try load component
        console.log("Could not find extended schema: " + name);
        return undefined;
    }

}
interface PlatformSchema {
    name: string;
    components: Component[];
    schema: Schema;
}

export class CompletionHandler {
    dumpNode(node: YamlNode, currentDoc: SingleYAMLDocument) {
        let i = 1;
        while (node) {
            if (isScalar(node)) {
                console.log(`${i}: scalar ${node.value}`);
            }
            else if (isMap(node)) {
                console.log(`${i}: map ${node.items.length}`);
            }
            else if (isPair(node)) {
                console.log(`${i}: pair key: ${node.key} value: ${node.value} `);
            }
            else if (isSeq(node)) {
                console.log(`${i}: seq ${node.items.length}`);
            }
            else {
                console.log(`${i}: unknown ${node.toString()}`);
            }

            node = currentDoc.getParent(node);
            i = i + 1;
        }
    }
    private createTempObjNode(currentWord: string, node: Node, currentDoc: SingleYAMLDocument): YAMLMap {
        const obj = {};
        obj[currentWord] = null;
        const map: YAMLMap = currentDoc.internalDocument.createNode(obj) as YAMLMap;
        map.range = node.range;
        (map.items[0].key as Node).range = node.range;
        (map.items[0].value as Node).range = node.range;
        return map;
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
        private textDocuments: TextDocuments<TextDocument>,
        private yamlDocuments: YamlDocuments) {

        this.core_schema = new CoreSchema();
    }

    onCompletion = ({ textDocument, position }: TextDocumentPositionParams): CompletionItem[] => {
        let result: CompletionItem[] = [];
        const document = this.textDocuments.get(textDocument.uri);
        // tslint:disable-next-line: curly
        if (!document)
            return result;

        if (position.character === 0) {
            return this.resolveCoreComponents(result);
        }

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
        currentDoc = currentDoc.clone();

        let [node, foundByClosest] = currentDoc.getNodeFromPosition(offset, textBuffer);
        const currentWord = this.getCurrentWord(document, offset);

        this.dumpNode(node, currentDoc);

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

        try {

            let currentProperty: YamlNode = null;

            if (!node) {
                if (!currentDoc.internalDocument.contents || isScalar(currentDoc.internalDocument.contents)) {
                    const map = currentDoc.internalDocument.createNode({});
                    map.range = [offset, offset + 1, offset + 1];
                    currentDoc.internalDocument.contents = map;
                    // eslint-disable-next-line no-self-assign
                    currentDoc.internalDocument = currentDoc.internalDocument;
                    node = map;
                } else {
                    node = currentDoc.findClosestNode(offset, textBuffer);
                    foundByClosest = true;
                }
            }

            const originalNode = node;
            if (node) {
                // Are we in the value side of a map?
                if (isMap(node)
                    && isPair(node.items[0])
                    && isScalar(node.items[0].key)
                    && isScalar(node.items[0].value)
                    && node.items[0].key.range[2] < offset
                    && node.items[0].value.range[0] > offset) {
                    // are we at the right side of =
                    console.log("we are in the scalar null? value");
                    node = node.items[0].value;
                }

                if (lineContent.length === 0) {
                    node = currentDoc.internalDocument.contents as Node;
                } else {
                    const parent = currentDoc.getParent(node);
                    if (parent) {
                        if (isScalar(node)) {
                            if (node.value) {
                                if (isPair(parent)) {
                                    if (parent.value === node) {
                                        if (lineContent.trim().length > 0 && lineContent.indexOf(':') < 0) {
                                            const map = this.createTempObjNode(currentWord, node, currentDoc);
                                            if (isSeq(currentDoc.internalDocument.contents)) {
                                                const index = indexOf(currentDoc.internalDocument.contents, parent);
                                                if (typeof index === 'number') {
                                                    currentDoc.internalDocument.set(index, map);
                                                    // eslint-disable-next-line no-self-assign
                                                    currentDoc.internalDocument = currentDoc.internalDocument;
                                                }
                                            } else {
                                                currentDoc.internalDocument.set(parent.key, map);
                                                // eslint-disable-next-line no-self-assign
                                                currentDoc.internalDocument = currentDoc.internalDocument;
                                            }

                                            currentProperty = (map as YAMLMap).items[0];
                                            node = map;
                                        } else if (lineContent.trim().length === 0) {
                                            const parentParent = currentDoc.getParent(parent);
                                            if (parentParent) {
                                                node = parentParent;
                                            }
                                        }
                                    } else if (parent.key === node) {
                                        const parentParent = currentDoc.getParent(parent);
                                        currentProperty = parent;
                                        if (parentParent) {
                                            node = parentParent;
                                        }
                                    }
                                } else if (isSeq(parent)) {
                                    if (lineContent.trim().length > 0) {
                                        const map = this.createTempObjNode(currentWord, node, currentDoc);
                                        parent.delete(node);
                                        parent.add(map);
                                        // eslint-disable-next-line no-self-assign
                                        currentDoc.internalDocument = currentDoc.internalDocument;
                                        node = map;
                                    } else {
                                        node = parent;
                                    }
                                }
                            } else if (node.value === null) {
                                if (isPair(parent)) {
                                    if (parent.key === node) {
                                        node = parent;
                                    } else {
                                        if (isNode(parent.key) && parent.key.range) {
                                            const parentParent = currentDoc.getParent(parent);
                                            if (foundByClosest && parentParent && isMap(parentParent) && isMapContainsEmptyPair(parentParent)) {
                                                node = parentParent;
                                            } else {
                                                const parentPosition = document.positionAt(parent.key.range[0]);
                                                //if cursor has bigger indentation that parent key, then we need to complete new empty object
                                                if (position.character > parentPosition.character && position.line !== parentPosition.line) {
                                                    const map = this.createTempObjNode(currentWord, node, currentDoc);

                                                    if (parentParent && (isMap(parentParent) || isSeq(parentParent))) {
                                                        parentParent.set(parent.key, map);
                                                        // eslint-disable-next-line no-self-assign
                                                        currentDoc.internalDocument = currentDoc.internalDocument;
                                                    } else {
                                                        currentDoc.internalDocument.set(parent.key, map);
                                                        // eslint-disable-next-line no-self-assign
                                                        currentDoc.internalDocument = currentDoc.internalDocument;
                                                    }
                                                    currentProperty = (map as YAMLMap).items[0];
                                                    node = map;
                                                } else if (parentPosition.character === position.character) {
                                                    if (parentParent) {
                                                        node = parentParent;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else if (isSeq(parent)) {
                                    if (lineContent.charAt(position.character - 1) !== '-') {
                                        const map = this.createTempObjNode(currentWord, node, currentDoc);
                                        parent.delete(node);
                                        parent.add(map);
                                        // eslint-disable-next-line no-self-assign
                                        currentDoc.internalDocument = currentDoc.internalDocument;
                                        node = map;
                                    } else {
                                        node = parent;
                                    }
                                }
                            }
                        } else if (isMap(node)) {
                            if (!foundByClosest && lineContent.trim().length === 0 && isSeq(parent)) {
                                const nextLine = textBuffer.getLineContent(position.line + 1);
                                if (textBuffer.getLineCount() === position.line + 1 || nextLine.trim().length === 0) {
                                    node = parent;
                                }
                            }
                        }
                    } else if (isScalar(node)) {
                        const map = this.createTempObjNode(currentWord, node, currentDoc);
                        currentDoc.internalDocument.contents = map;
                        // eslint-disable-next-line no-self-assign
                        currentDoc.internalDocument = currentDoc.internalDocument;
                        currentProperty = map.items[0];
                        node = map;
                    } else if (isMap(node)) {
                        for (const pair of node.items) {
                            if (isNode(pair.value) && pair.value.range && pair.value.range[0] === offset + 1) {
                                node = pair.value;
                            }
                        }
                    }
                }
            }
            console.log("FIXED:");
            this.dumpNode(node, currentDoc);
            const p1 = currentDoc.getParent(node);

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
                                return this.resolvePlatformNames(result, platform_name);
                            }
                        }
                    }
                }
            }

            if (isMap(node) && isSeq(p1)) {
                const p2 = currentDoc.getParent(p1);
                if (isPair(p2)) {
                    const p3 = currentDoc.getParent(p2);
                    if (p3 === currentDoc.root.internalNode
                        && isScalar(p2.key)) {
                        const platform = p2.key.value as string;
                        let domain = null;
                        // Find platform name
                        for (var m of node.items) {
                            if (isScalar(m.key) && isScalar(m.value) && m.key.value === "platform") {
                                domain = m.value.value;
                                break;
                            }
                        }
                        if (domain === null) {
                            result.push({
                                label: "platform",
                                kind: CompletionItemKind.EnumMember,
                                insertText: 'platform: ',
                                command: { title: 'chain', command: "editor.action.triggerSuggest" }
                            });
                            return result;
                        }
                        this.resolvePlatformComponent(result, platform, domain);
                    }
                }
                const xp1 = p1;
            }


        } catch (error) {
            console.log(error);
        }
        if (result.length === 0) {
            return this.resolveCoreComponents(result);
        }
        return result;
    }

    private resolvePlatformNames(result: CompletionItem[], platform_name: string) {
        const c = this.core_schema.getComponent(platform_name);

        if (c.platforms === undefined) {
            console.log(`Error: not a platform ${platform_name}`);
            return result;
        }

        for (var component of c.platforms) {
            result.push({
                label: component,
                kind: CompletionItemKind.EnumMember,
                insertText: component + '\n  ',
                command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }

        return result;
    }

    private resolveCoreComponents(result: CompletionItem[]) {
        for (var name of this.core_schema.platforms) {
            result.push({
                label: name,
                kind: CompletionItemKind.Class,
                insertText: name + ':\n  - platform: ',
                command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }
        for (var component in this.core_schema.components) {
            const schema = this.core_schema.components[component];
            if (schema.schema.component !== undefined) {
                result.push({
                    label: component,
                    kind: CompletionItemKind.Field,
                    insertText: component + ':\n  ',
                    command: { title: 'chain', command: "editor.action.triggerSuggest" }
                });
            }
        }
        return result;
    }

    private resolvePlatformComponent(result: CompletionItem[], platform: string, domain: string) {
        const schema = this.core_schema.getComponentPlatformSchema(domain, platform);
        this.addConfigVars(result, schema);
    }

    private addConfigVars(result: CompletionItem[], schema: Schema) {
        for (var prop in schema.config_vars) {
            result.push({
                label: prop,
                kind: CompletionItemKind.Property,
                insertText: prop + ': ',
                // command: { title: 'chain', command: "editor.action.triggerSuggest" }
            });
        }
        for (var extended of schema.extends) {
            const s = this.core_schema.getExtendedSchema(extended);
            this.addConfigVars(result, s);
        }
    }

}