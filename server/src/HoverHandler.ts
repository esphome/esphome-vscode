import { listenerCount } from "process";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Hover, MarkupContent, Position, Range } from "vscode-languageserver-types";
import { isMap, isPair, isScalar, isSeq, Node, visit } from "yaml";
import { ConfigVar, CoreSchema, Schema } from "./CoreSchema";
import { YamlNode } from "./jsonASTTypes";
import { SingleYAMLDocument, YamlDocuments, yamlDocumentsCache } from "./parser/yaml-documents";
import { matchOffsetToDocument } from "./utils/arrUtils";
import { isNumber, isString } from "./utils/objects";
import { TextBuffer } from "./utils/textBuffer";

export class HoverHandler {
    constructor(private yamlDocuments: YamlDocuments, private coreSchema: CoreSchema) { }

    onHover(textDocument: TextDocument, position: Position): import("vscode-jsonrpc").HandlerResult<import("vscode-languageserver-types").Hover, void> {
        try {
            const offset = textDocument.offsetAt(position);
            const yamlDocument = yamlDocumentsCache.getYamlDocument(textDocument);
            const singleYamlDocument = matchOffsetToDocument(offset, yamlDocument);
            if (singleYamlDocument === null) {
                return Promise.resolve(undefined);
            }

            const currentDocIndex = yamlDocument.documents.indexOf(singleYamlDocument);
            singleYamlDocument.currentDocIndex = currentDocIndex;
            return this.getHover(textDocument, position, singleYamlDocument);
        }
        catch (error) {
            console.log('yaml.hover.error', { error, documentUri: textDocument.uri });
        }
    }

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

    private getNodeFromPosition(doc: SingleYAMLDocument, positionOffset: number): YamlNode {
        let closestNode: Node;
        visit(doc.internalDocument, (key, node: Node) => {
            if (!node) {
                return;
            }
            const range = node.range;
            if (!range) {
                return;
            }

            if (range[0] <= positionOffset && range[1] >= positionOffset) {
                closestNode = node;
            } else {
                return visit.SKIP;
            }
        });

        return closestNode;
    }

    private getHover(document: TextDocument, position: Position, doc: SingleYAMLDocument): Promise<Hover | null> {

        const offset = document.offsetAt(position);
        const textBuffer = new TextBuffer(document);
        const textBufferPosition = textBuffer.getPosition(offset);
        const lineContent = textBuffer.getLineContent(textBufferPosition.line);
        if (lineContent.trim().length === 0) {
            return null;
        }

        let node = this.getNodeFromPosition(doc, offset);

        // const hoverRange = Range.create(
        //   document.positionAt(node),
        //   document.positionAt(hoverRangeNode.offset + hoverRangeNode.length)
        // );
        const hoverRange = null;

        const createHover = (contents: string): Hover => {
            const markupContent: MarkupContent = {
                kind: 'markdown',
                value: contents,
            };
            const result: Hover = {
                contents: markupContent,
                range: hoverRange,
            };
            return result;
        };

        const docNode = doc.root.internalNode as any;
        let pathNode;
        pathNode = docNode;



        return new Promise<Hover>((resolve, reject) => {

            try {

                var path = this.getPath(node, doc);

                let schema: Schema;
                let cv: ConfigVar;

                if (path.length === 1) {
                    const rootComponents = this.coreSchema.getComponentList();
                    if (path[0] in rootComponents) {
                        return resolve(createHover(rootComponents[path[0]].docs));
                    }
                    const platformComponents = this.coreSchema.getPlatformList();
                    if (path[0] in platformComponents) {
                        return resolve(createHover(platformComponents[path[0]].docs));
                    }

                    return resolve(null);
                }

                for (let index = 0; index < path.length; index++) {
                    if (isString(path[index]) && isMap(pathNode)) {
                        if (cv === undefined && index <= 2 && pathNode.get("platform")) {
                            const componentName = pathNode.get("platform");
                            if (isString(componentName)) {
                                const platformComponents = this.coreSchema.getPlatformList();
                                if (path[0] in platformComponents) {
                                    const c = this.coreSchema.getComponent(path[0]);
                                    if (c.components !== undefined && componentName in c.components) {
                                        cv = this.coreSchema.getComponentPlatformSchema(componentName, path[0]);
                                    }
                                }
                            }
                        }

                        pathNode = pathNode.get(path[index], true);
                        if (cv === undefined) {
                            const rootComponents = this.coreSchema.getComponentList();
                            if (path[0] in rootComponents) {
                                cv = this.coreSchema.getComponent(path[0]).schemas.CONFIG_SCHEMA;
                            }
                        }
                        else {
                            if (cv.type === "schema" || cv.type === "trigger") {
                                if (cv.schema !== undefined) {
                                    const schema_cv = this.coreSchema.findConfigVar(cv.schema, path[index], docNode);
                                    if (schema_cv !== undefined) {
                                        cv = schema_cv;
                                        continue;
                                    }
                                }

                                if (cv.type === "trigger") {
                                    const action = this.coreSchema.getActionConfigVar(path[index]);
                                    if (action !== undefined) {
                                        cv = action;
                                        continue;
                                    }
                                }
                            }
                            if (cv.type === "registry") {
                                cv = this.coreSchema.getRegistryConfigVar(cv.registry, path[index]);
                            }
                        }
                    }
                    else if (isNumber(path[index]) && isSeq(pathNode)) {
                        pathNode = pathNode.get(path[index], true);
                    }
                }

                let content: string;
                if (cv !== undefined) {
                    content = cv.docs;
                } else {
                    content = JSON.stringify(schema);

                    if (schema["docs"] !== undefined) {
                        content = schema["docs"];
                    }
                }

                const hover = createHover(content);
                resolve(hover);
            }
            catch (ex) {
                console.log(ex);
            }
        });
    }
}
