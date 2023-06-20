import "mocha";
import { expect } from "chai";
import { getCompletionsFor, testCompletionHaveLabels } from "./shared";

describe("typed schema", () => {
  it("ask type only", async () => {
    const result = await getCompletionsFor(
      `
esp32:
  framework:
    `
    );
    expect(result.length).to.be.equal(1);
    testCompletionHaveLabels(result, ["type"]);
  });

  it("suggests types", async () => {
    const result = await getCompletionsFor(
      `
esp32:
  framework:
    type: `
    );
    expect(result.length).to.be.equal(2);
    testCompletionHaveLabels(result, ["esp-idf", "arduino"]);
  });

  it("suggests props of type", async () => {
    const result = await getCompletionsFor(
      `
esp32:
  framework:
    type: esp-idf
    `,
      { line: 3, character: 4 }
    );
    testCompletionHaveLabels(result, ["advanced", "version", "source"]);
  });

  it("suggests props of type 2", async () => {
    const result = await getCompletionsFor(
      `
esp32:
  framework:
    type: arduino
    `,
      { line: 3, character: 4 }
    );
    expect(result.length).to.be.equal(3);
    testCompletionHaveLabels(result, ["version"]);
  });

  it("media player", async () => {
    const result = await getCompletionsFor(
      `
media_player:
  - platform: i2s_audio
    dac_type: internal
    `,
      { line: 3, character: 4 }
    );
    testCompletionHaveLabels(result, ["mode"]);
  });
  it("single ext component types", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: arduino
esp32:
  board: d1
external_components:
  source:
    type: `);
    testCompletionHaveLabels(result, ["git", "local"]);
  });
  it("list ext component types", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: arduino
esp32:
  board: d1
external_components:
  - source:
      type: `);
    testCompletionHaveLabels(result, ["git", "local"]);
  });

  it("single ext component types g", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: arduino
esp32:
  board: d1
external_components:
  source:
    type: g`);
    testCompletionHaveLabels(result, ["git"]);
  });
});
