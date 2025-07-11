import "mocha";
import { getCompletionsFor, testCompletionHaveLabels } from "./shared";
import { setVersion } from "../src/connection-source";

describe("completion-sensors", () => {
  before(async function () {
    setVersion("dev");
  });
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
