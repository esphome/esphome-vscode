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


        return {
            contents: {

                kind: "markdown",
                value: "Hello from hover"

            }

        };
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
                console.log("finding node: " + node.toString());
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

        let docNode;
        docNode = doc.root.internalNode;

        return new Promise<Hover>((resolve, reject) => {


            var path = this.getPath(node, doc);

            let index = 0;
            let schema: Schema;
            let cv: ConfigVar;

            while (index < path.length) {
                if (isString(path[index]) && isMap(docNode)) {
                    docNode = docNode.get(path[index], true);
                    if (schema === undefined) {
                        schema = this.coreSchema.getComponent(path[index]).schemas.CONFIG_SCHEMA;
                    }
                    else {
                        if (cv === undefined) {
                            cv = this.coreSchema.findConfigVar(schema, path[index], docNode);
                        }
                    }
                }
                index++;
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
        });
    }
}
