import { assert } from "chai";
import { getTextDoc } from "./sample-esphome-yaml";
import { CompletionItem, Position } from "../src/editor-shims";
import { ESPHomeDocuments } from "../src/esphome-document";
import { TextBuffer } from "../src/utils/text-buffer";
import { CompletionsHandler } from "../src/completions-handler";
import { setVersion } from "../src/connection-source";
import { coreSchema } from "../src/editor-shims";

export { setVersion };

export const testCompletionHaveLabels = (
  result: CompletionItem[],
  labelSet: string[],
) => {
  let count = 0;
  for (var c of labelSet) {
    if (result.find((x) => x.label === c)) {
      count++;
    } else {
      assert.fail(
        `expected label '${c}' in result, got instead: ${JSON.stringify(
          result,
        )}`,
      );
    }
  }
  assert(count === labelSet.length, "some completion labels not found");
};
export const testCompletionDoesNotHaveLabels = (
  result: CompletionItem[],
  labelSet: string[],
) => {
  for (var c of labelSet) {
    if (result.find((x) => x.label === c)) {
      assert.fail(`not expected label '${c}' in result`);
    }
  }
};

// Schema is shared across all test documents (same singleton used in production)
export const documents = new ESPHomeDocuments(coreSchema);
const x = new CompletionsHandler(documents);

export const getCompletionsFor = async (
  yamlString: string,
  position?: Position,
) => {
  yamlString = yamlString.trimStart();
  if (position === undefined) {
    // default to end of doc
    const lines = yamlString.split("\n");
    position = {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    };
  }
  console.log("position is " + JSON.stringify(position));
  documents.update("test", new TextBuffer(getTextDoc(yamlString)));
  return await x.getCompletions("test", position);
};
