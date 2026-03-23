import { isMap, isPair, isScalar } from "yaml";
import { coreSchema, Position } from "./editor-shims";
import { ESPHomeDocuments } from "./esphome-document";

export class DefinitionHandler {
  constructor(private documents: ESPHomeDocuments) {}

  public async getDefinition(uri: string, position: Position) {
    try {
      const document = this.documents.getDocument(uri);
      const lineContent = document.text.getLineContent(position.line);
      if (lineContent.trim().length === 0) {
        return;
      }
      const offset = document.text.offsetAt(position);
      const node = document.getNodeFromOffset(offset);

      if (!node) return;

      var path = document.getPath(node);
      // Navigate to !include file target
      let includeFile: string | undefined;
      const parentNode = document.getParent(node);
      const isKeyNode = isPair(parentNode) && parentNode.key === node;
      if (
        !isKeyNode &&
        isScalar(node) &&
        typeof node.value === "string" &&
        (node.tag === "!include" ||
          (path.length > 2 && path[0] === "packages" && path[2] === "file"))
      ) {
        includeFile = node.value;
      } else if (isMap(node) && node.tag === "!include") {
        const fileVal = node.get("file");
        if (typeof fileVal === "string") includeFile = fileVal;
      }
      if (includeFile) {
        const targetUri = new URL(includeFile, uri).toString();
        return {
          uri: targetUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        };
      }

      if (path.length === 1) {
        return null;
      }

      const cvAndPath = await document.getConfigVarAndPathNode(path);
      if (cvAndPath === undefined) {
        return;
      }
      const [cv, pathNode] = cvAndPath;
      let fullCv = await coreSchema.getConfigVarComplete2(cv);

      if (fullCv.type === "schema" && fullCv.maybe !== undefined) {
        fullCv = await coreSchema.getConfigVarComplete(
          fullCv.schema,
          fullCv.maybe,
        );
      }
      if (fullCv.type === "use_id" && isScalar(pathNode)) {
        const typeId = fullCv.use_id_type;
        const targetId = pathNode.value as string;
        // Use document method for merged-scope ID search (includes all files)
        const range = await document.findComponentDefinition(typeId, targetId);
        if (!range) {
          return null;
        }
        const definition = {
          uri: uri,
          range: {
            start: document.text.getPosition(range[0]),
            end: document.text.getPosition(range[0] + targetId.length),
          },
        };
        return definition;
      }
    } catch (error) {
      console.log("Definition:" + error);
    }
    return null;
  }
}
