import "mocha";
import { assert } from "chai";
import { ESPHomeDocuments } from "../src/esphome-document";
import { TextBuffer } from "../src/utils/text-buffer";
import { getTextDoc } from "./sample-esphome-yaml";
import { DefinitionHandler } from "../src/definition-handler";
import { setVersion } from "../src/connection-source";
import { coreSchema } from "../src/editor-shims";
import { TextDocument } from "vscode-languageserver-textdocument";

const documents = new ESPHomeDocuments(coreSchema);
const definitionHandler = new DefinitionHandler(documents);

// Separate instance for cross-document tests
const multiDocDocuments = new ESPHomeDocuments(coreSchema);
const multiDocDefinitionHandler = new DefinitionHandler(multiDocDocuments);

const loadYaml = (yamlString: string): string => {
  const text = getTextDoc(yamlString);
  documents.update("test", new TextBuffer(text));
  return "test";
};

describe("DefinitionHandler", () => {
  before(async function () {
    setVersion("dev");
  });

  it("light.toggle id reference resolves to light id definition with maybe id", async () => {
    const yaml = `
light:
  - platform: binary
    id: luz_cocina
  - platform: binary
    id: luz_mesa_cocina
    name: "Luz mesa"
  - platform: binary
    id: luz_exterior_pasillo

binary_sensor:
  - platform: gpio
    on_state:
      then:
        - light.toggle: luz_mesa_cocina
`;
    const uri = loadYaml(yaml);

    // Position is 0-based. After trimStart the light.toggle line is line 13.
    // "        - light.toggle: luz_mesa_cocina"
    //                           ^-- column 24 (0-based), pointing inside "luz_mesa_cocina"
    const position = { line: 13, character: 31 };

    const result = await definitionHandler.getDefinition(uri, position);

    assert.isNotNull(result, "expected a definition result");
    assert.isDefined(result, "expected a definition result");

    // The definition should point to line 4 (0-based), where "id: luz_mesa_cocina" is defined
    assert.equal(
      result!.range.start.line,
      4,
      "definition should point to line 4 (0-based) where luz_mesa_cocina id is declared",
    );
  });

  it("light.toggle id reference resolves to light id definition", async () => {
    const yaml = `
light:
  - platform: binary
    id: luz_cocina
  - platform: binary
    id: luz_mesa_cocina
    name: "Luz mesa"
  - platform: binary
    id: luz_exterior_pasillo

binary_sensor:
  - platform: gpio
    on_state:
      then:
        - light.toggle:
            id: luz_mesa_cocina
`;
    const uri = loadYaml(yaml);

    const position = { line: 14, character: 17 };

    const result = await definitionHandler.getDefinition(uri, position);

    assert.isNotNull(result, "expected a definition result");
    assert.isDefined(result, "expected a definition result");

    // The definition should point to line 4 (0-based), where "id: luz_mesa_cocina" is defined
    assert.equal(
      result!.range.start.line,
      4,
      "definition should point to line 4 (0-based) where luz_mesa_cocina id is declared",
    );
  });

  it("switch.turn_on id reference resolves to switch id definition", async () => {
    const yaml = `
switch:
  - platform: output
    id: switchBoiler

climate:
  - platform: thermostat
    heat_action:
      - switch.turn_on: switchBoiler
`;
    const uri = loadYaml(yaml);

    const position = { line: 7, character: 30 };

    const result = await definitionHandler.getDefinition(uri, position);

    assert.isNotNull(result, "expected a definition result");
    assert.isDefined(result, "expected a definition result");

    assert.equal(
      result!.range.start.line,
      2,
      "definition should point to line 2 (0-based) where switchBoiler id is declared",
    );
  });

  it("light.toggle id reference resolves to id declared in !include'd file", async () => {
    const mainUri = "file:///test/main.yaml";
    const lightsUri = "file:///test/lights.yaml";

    const lightsContent = `light:
  - platform: binary
    id: luz_cocina
  - platform: binary
    id: luz_mesa_cocina
    name: "Luz mesa"
`;

    multiDocDocuments.setFileLoader(async (relativePath) => {
      if (relativePath === "lights.yaml") return lightsContent;
      return undefined;
    });

    const mainYaml = `<<: !include lights.yaml

binary_sensor:
  - platform: gpio
    on_state:
      then:
        - light.toggle: luz_mesa_cocina
`;
    await multiDocDocuments.update(
      mainUri,
      new TextBuffer(TextDocument.create(mainUri, "yaml", 0, mainYaml)),
    );

    // "        - light.toggle: luz_mesa_cocina"
    //                          ^-- character 24
    const position = { line: 6, character: 24 };

    const result = await multiDocDefinitionHandler.getDefinition(
      mainUri,
      position,
    );

    assert.isNotNull(result, "expected a definition result");
    assert.isDefined(result, "expected a definition result");

    assert.equal(
      result!.uri,
      lightsUri,
      "definition should point to the included lights.yaml file",
    );
    assert.equal(
      result!.range.start.line,
      4,
      "definition should point to line 4 (0-based) in lights.yaml where luz_mesa_cocina id is declared",
    );
  });
});
