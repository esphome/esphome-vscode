import "mocha";
import { getCompletionsFor, testCompletionHaveLabels } from "./shared";

describe("completion-sensors", () => {
  it("list sgp4x members", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  - platform: sgp4x
    `,
    );
    testCompletionHaveLabels(result, ["id", "voc", "compensation"]);
  });
});
