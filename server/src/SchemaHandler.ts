import { ConfigVar, CoreSchema } from "./CoreSchema";
import { YamlNode } from "./jsonASTTypes";
import { SingleYAMLDocument, YamlDocuments } from "./parser/yaml-documents";
import { isMap, isNode, isPair, isScalar, isSeq, Node, visit } from "yaml";
import { isNumber, isString } from "./utils/objects";

export class SchemaHandler {
    constructor(protected yamlDocuments: YamlDocuments, protected coreSchema: CoreSchema) { }
    public getPath(node: YamlNode, currentDoc: SingleYAMLDocument) {
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

    public getNodeFromPosition(doc: SingleYAMLDocument, positionOffset: number): YamlNode {
        let closestNode: Node;
        visit(doc.internalDocument, (key, node) => {
            if (!node || !isNode(node)) {
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

    public getConfigVarAndPathNode(path: string[], doc: SingleYAMLDocument): [ConfigVar, YamlNode] {
        let pathNode = doc.root.internalNode;
        let cv: ConfigVar;
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

                pathNode = pathNode.get(path[index], true) as YamlNode;
                if (cv === undefined) {
                    const rootComponents = this.coreSchema.getComponentList();
                    if (path[0] in rootComponents) {
                        cv = this.coreSchema.getComponent(path[0]).schemas.CONFIG_SCHEMA;
                    }
                }
                else {
                    if (cv.type === "schema" || cv.type === "trigger") {
                        if (cv.schema !== undefined) {
                            const schema_cv = this.coreSchema.findConfigVar(cv.schema, path[index], doc);
                            if (schema_cv !== undefined) {
                                cv = schema_cv;
                                continue;
                            }
                        }

                        if (cv.type === "trigger") {
                            if (path[index] === "then") {
                                continue;
                            }
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
                pathNode = pathNode.get(path[index], true) as YamlNode;
            }
        }
        return [cv, pathNode];
    }
}