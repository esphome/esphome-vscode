import { isScalar, visit } from "yaml";
import { Position } from "./editor-shims";
import { ESPHomeDocuments } from "./esphome-document";
import { ConfigVarId } from "./esphome-schema";

export class ReferencesHandler {
  constructor(private documents: ESPHomeDocuments) {}

  public async getReferences(uri: string, position: Position) {
    try {
      const document = this.documents.getDocument(uri);
      const lineContent = document.text.getLineContent(position.line);
      if (lineContent.trim().length === 0) {
        return;
      }
      const offset = document.text.offsetAt(position);
      const node = document.getNodeFromOffset(offset);

      if (!node) return;
      const path = document.getPath(node);

      if (path.length === 1) {
        return null;
      }

      const cvAndPath = await document.getConfigVarAndPathNode(path);
      if (cvAndPath === undefined) {
        return;
      }
      const [cv, pathNode] = cvAndPath;

      const idCv = cv as any as ConfigVarId;
      if (idCv.id_type && isScalar(pathNode)) {
        const idTypeClass = idCv.id_type.class;
        const idTypeParents: string[] = idCv.id_type.parents ?? [];
        const targetId = pathNode.value as string;

        // Collect all scalar nodes whose value matches the target id
        const candidates: any[] = [];
        visit(document.yaml, (_, visitNode) => {
          if (isScalar(visitNode) && visitNode.value === targetId) {
            candidates.push(visitNode);
          }
        });

        const results = [];
        for (const candidate of candidates) {
          const candidatePath = document.getPath(candidate);
          if (candidatePath.length < 2) continue;
          try {
            const result = await document.getConfigVarAndPathNode(candidatePath);
            if (!result) continue;
            const [candidateCv] = result;
            if (
              candidateCv.type === "use_id" &&
              (candidateCv.use_id_type === idTypeClass ||
                idTypeParents.includes(candidateCv.use_id_type))
            ) {
              if (candidate.range) {
                results.push({
                  uri,
                  range: {
                    start: document.text.getPosition(candidate.range[0]),
                    end: document.text.getPosition(
                      candidate.range[0] + targetId.length,
                    ),
                  },
                });
              }
            }
          } catch {
            // skip nodes whose path can't be resolved
          }
        }
        return results;
      }
    } catch (error) {
      console.log("References:" + error);
    }
    return null;
  }
}
