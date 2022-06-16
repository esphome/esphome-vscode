import { TextDocument } from "vscode-languageserver-textdocument";
import { Definition, Position } from "vscode-languageserver-types";
import { CoreSchema } from "./CoreSchema";
import { SingleYAMLDocument, YamlDocuments, yamlDocumentsCache } from "./parser/yaml-documents";
import { matchOffsetToDocument } from "./utils/arrUtils";
import { isScalar, YAMLMap } from "yaml";
import { TextBuffer } from "./utils/textBuffer";
import { SchemaHandler } from "./SchemaHandler";

export class DefinitionHandler extends SchemaHandler {
    constructor(yamlDocuments: YamlDocuments, coreSchema: CoreSchema) {
        super(yamlDocuments, coreSchema);
    }

    onDefinition(textDocument: TextDocument, position: Position): import("vscode-jsonrpc").HandlerResult<import("vscode-languageserver-types").Definition, void> {
        try {
            const offset = textDocument.offsetAt(position);
            const yamlDocument = yamlDocumentsCache.getYamlDocument(textDocument);
            const singleYamlDocument = matchOffsetToDocument(offset, yamlDocument);
            if (singleYamlDocument === null) {
                return Promise.resolve(undefined);
            }

            const currentDocIndex = yamlDocument.documents.indexOf(singleYamlDocument);
            singleYamlDocument.currentDocIndex = currentDocIndex;

            return this.getDefinition(textDocument, position, singleYamlDocument);
        }
        catch (error) {
            console.log('definition.error', { error, documentUri: textDocument.uri });
        }
    }

    private getDefinition(document: TextDocument, position: Position, doc: SingleYAMLDocument): Promise<Definition | null> {

        const offset = document.offsetAt(position);
        const textBuffer = new TextBuffer(document);
        const textBufferPosition = textBuffer.getPosition(offset);
        const lineContent = textBuffer.getLineContent(textBufferPosition.line);
        if (lineContent.trim().length === 0) {
            return null;
        }

        let node = this.getNodeFromPosition(doc, offset);
        const docNode = doc.root.internalNode as YAMLMap;

        return new Promise<Definition>((resolve, reject) => {
            try {
                var path = this.getPath(node, doc);

                if (path.length === 1) {
                    return resolve(null);
                }

                const [cv, pathNode] = this.getConfigVarAndPathNode(path, doc);

                let fullCv = this.coreSchema.getConfigVarComplete2(cv);

                if (fullCv.type === 'schema' && fullCv.maybe !== undefined) {
                    fullCv = this.coreSchema.findConfigVar(fullCv.schema, fullCv.maybe, doc);
                    fullCv = this.coreSchema.getConfigVarComplete2(fullCv);
                }
                if (fullCv.type === 'use_id' && isScalar(pathNode)) {
                    const typeId = fullCv.use_id_type;
                    const targetId = pathNode.value as string;
                    const range = this.coreSchema.findComponentDefinition(typeId, targetId, doc);
                    if (range === null) {
                        resolve(null);
                    }
                    const definition = {
                        uri: document.uri,
                        range:
                        {
                            start: textBuffer.getPosition(range[0]),
                            end: textBuffer.getPosition(range[0] + targetId.length),
                        }
                    };
                    resolve(definition);
                }
            }
            catch (error) {
                console.log("Definition:" + error);
            }
            resolve(null);
        });
    }
}
