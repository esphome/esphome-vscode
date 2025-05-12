import "mocha";
import { expect } from "chai";
import { getCompletionsFor, testCompletionHaveLabels } from "./shared";

describe("completion-sensors", () => {
  it("list sgp4x memebers", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  - platform: sgp4x
    `,
    );
    testCompletionHaveLabels(result, ["id", "voc", "compensation"]);
  });
});
