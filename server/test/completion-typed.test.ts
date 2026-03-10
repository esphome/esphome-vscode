import "mocha";
import { expect } from "chai";
import { getCompletionsFor, testCompletionHaveLabels } from "./shared";
import { setVersion } from "../src/connection-source";

describe("typed schema", () => {
  before(async function () {
    setVersion("dev");
  });
  it("ask type only", async () => {
    const result = await getCompletionsFor(
      `
ethernet:
    `,
    );
    expect(result.length).to.be.equal(1);
    testCompletionHaveLabels(result, ["type"]);
  });

  it("suggests types", async () => {
    const result = await getCompletionsFor(
      `
external_components:
  - source: 
      type: `,
    );
    expect(result.length).to.be.equal(2);
    testCompletionHaveLabels(result, ["git", "local"]);
  });

  it("suggests props of type", async () => {
    const result = await getCompletionsFor(
      `
external_components:
  - source: 
      type: git
      `,
    );
    testCompletionHaveLabels(result, ["url", "ref", "username"]);
  });

  it("suggests props of type 2", async () => {
    const result = await getCompletionsFor(
      `
external_components:
  - source: 
      type: local
      `,
    );
    expect(result.length).to.be.equal(1);
    testCompletionHaveLabels(result, ["path"]);
  });

  it("media player", async () => {
    const result = await getCompletionsFor(
      `
media_player:
  - platform: i2s_audio
    dac_type: internal
    `,
      { line: 3, character: 4 },
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

  it("speaker dac_type", async () => {
    const result = await getCompletionsFor(`
speaker:
  - platform: i2s_audio
    dac_type: external
    `);
    testCompletionHaveLabels(result, ["i2s_mode", "i2s_dout_pin"]);
  });
});
