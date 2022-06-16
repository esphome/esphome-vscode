import { TextDocument } from "vscode-languageserver-textdocument";
import { Hover, MarkupContent, Position } from "vscode-languageserver-types";
import { isScalar, YAMLMap } from "yaml";
import { CoreSchema, Schema } from "./CoreSchema";
import { SingleYAMLDocument, YamlDocuments, yamlDocumentsCache } from "./parser/yaml-documents";
import { SchemaHandler } from "./SchemaHandler";
import { matchOffsetToDocument } from "./utils/arrUtils";
import { TextBuffer } from "./utils/textBuffer";

export class HoverHandler extends SchemaHandler {
    constructor(yamlDocuments: YamlDocuments, coreSchema: CoreSchema) {
        super(yamlDocuments, coreSchema);
    }

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


    private getHover(document: TextDocument, position: Position, doc: SingleYAMLDocument): Promise<Hover | null> {

        const offset = document.offsetAt(position);
        const textBuffer = new TextBuffer(document);
        const textBufferPosition = textBuffer.getPosition(offset);
        const lineContent = textBuffer.getLineContent(textBufferPosition.line);
        if (lineContent.trim().length === 0) {
            return null;
        }

        let node = this.getNodeFromPosition(doc, offset);

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

        const docNode = doc.root.internalNode as YAMLMap;
        let pathNode;
        pathNode = docNode;

        return new Promise<Hover>((resolve, reject) => {
            try {
                var path = this.getPath(node, doc);

                let schema: Schema;

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

                const [cv, pathNode] = this.getConfigVarAndPathNode(path, doc);

                let content: string;
                if (cv !== undefined) {
                    content = cv.docs;
                    if (content === undefined && path.length === 3 && path[2] === 'platform' && isScalar(pathNode)) {
                        content = this.coreSchema.getComponent(path[0]).components[pathNode.value as string].docs;
                    }
                } else {
                    content = JSON.stringify(schema);

                    if (schema["docs"] !== undefined) {
                        content = schema["docs"];
                    }
                }

                const hover = createHover(content);
                resolve(hover);
            }
            catch (error) {
                console.log("Hover:" + error);
            }
        });
    }
}
