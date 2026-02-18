import "mocha";
import { assert } from "chai";

import { ESPHomeDocuments } from "../src/esphome-document";
import { TextBuffer } from "../src/utils/text-buffer";
import { getTextDoc } from "./sample-esphome-yaml";

import { DocumentSymbolHandler } from "../src/document-symbol-handler";
import { SymbolKind } from "vscode-languageserver-types";

const documents = new ESPHomeDocuments();
const handler = new DocumentSymbolHandler(documents);

const getSymbols = (yamlString: string) => {
  const text = getTextDoc(dedent(yamlString));
  documents.update("test", new TextBuffer(text));
  return handler.getDocumentSymbols("test");
};

describe("Document Symbols", () => {
  it("should parse top-level symbols", () => {
    const symbols = getSymbols(`
      esphome:
        name: test_device

      wifi:
        ssid: "MySSID"
        password: "MyPassword"      
    `);
    assert.lengthOf(symbols, 2);

    const esphome = symbols.find(s => s.name === "esphome");
    assert.exists(esphome);
    assert.equal(esphome!.kind, SymbolKind.Class);

    const wifi = symbols.find(s => s.name === "wifi");
    assert.exists(wifi);
    assert.equal(wifi!.kind, SymbolKind.Interface);
  });

  it("should parse nested symbols recursively", () => {
    const symbols = getSymbols(`
      sensor:
        - platform: dht
          pin: D2
          temperature:
            name: "Living Room Temp"
    `);
    // Check the top-level
    const sensorSymbol = symbols[0];
    assert.equal(sensorSymbol.name, "sensor");
    assert.equal(sensorSymbol.kind, SymbolKind.Class);

    // Check children (list item)
    assert.lengthOf(sensorSymbol.children!, 1);
    const dhtSymbol = sensorSymbol.children![0];
    assert.equal(dhtSymbol.name, "dht");
    assert.equal(dhtSymbol.kind, SymbolKind.Object);

    // Check children of the sensor item
    const childrenNames = dhtSymbol.children!.map(c => c.name);
    assert.include(childrenNames, "pin");
    assert.include(childrenNames, "temperature");
    assert.include(childrenNames, "platform");

    // Check nested temperature
    const tempSymbol = dhtSymbol.children!.find(c => c.name === "temperature");
    assert.exists(tempSymbol);
    assert.lengthOf(tempSymbol!.children!, 1);
    assert.equal(tempSymbol!.children![0].name, "name");
    assert.equal(tempSymbol!.children![0].detail, "Living Room Temp");
    assert.equal(tempSymbol!.children![0].kind, SymbolKind.Field);
  });

  it("should handle sequences", () => {
    const symbols = getSymbols(`
      my_list:
        - item1
        - item2
    `);
    const listSymbol = symbols[0];
    assert.lengthOf(listSymbol.children!, 2);
    assert.equal(listSymbol.children![0].name, "item1");
    assert.equal(listSymbol.children![0].kind, SymbolKind.String);
    assert.equal(listSymbol.children![1].name, "item2");
    assert.equal(listSymbol.children![1].kind, SymbolKind.String);
  });

  it("should calculate correct ranges", () => {
    const symbols = getSymbols(`
      wifi:
        ssid: "MySSID"
    `);
    const wifi = symbols.find(s => s.name === "wifi");
    assert.exists(wifi);

    // selectionRange should be just the key 'wifi'
    assert.equal(wifi!.selectionRange.start.line, 0);
    assert.equal(wifi!.selectionRange.start.character, 0);
    assert.equal(wifi!.selectionRange.end.line, 0);
    assert.equal(wifi!.selectionRange.end.character, 4);

    // full range should include the whole block (wifi: to "MySSID")
    assert.equal(wifi!.range.start.line, 0);
    assert.equal(wifi!.range.start.character, 0);
    assert.equal(wifi!.range.end.line, 1);
    assert.equal(wifi!.range.end.character, 16);
  });

  it("should use 'id', 'name' or 'platform' for sequence item labels", () => {
    const symbols = getSymbols(`
      switch:
        - id: relay_1
          platform: gpio
        - name: "Relay 2"
          platform: gpio
        - platform: gpio
          id: relay_3
          name: "Relay 3"
    `);
    const switchSymbol = symbols[0];
    assert.lengthOf(switchSymbol.children!, 3);

    assert.equal(switchSymbol.children![0].name, "relay_1");
    assert.equal(switchSymbol.children![1].name, "Relay 2");
    assert.equal(switchSymbol.children![2].name, "gpio");
  });

  it("should handle symbol mapping", () => {
    const symbols = getSymbols(`
      esphome:
        name: test

      on_boot:
        then:
          - logger.log: "Boot Successful"

      api:
        port: 6053

      i2c:
        sda: GPIO4
        scl: GPIO5

      sensor:
        - platform: dht
          pin: 12

      board: esp32dev

      script:
        - id: my_script
          then:
            - lambda: |-
                log("main", "Hello World!");
    `);
    const findSymbol = (name: string) => symbols.find(s => s.name === name);

    // Core components (Class)
    assert.equal(findSymbol("esphome")?.kind, SymbolKind.Class);
    assert.equal(findSymbol("sensor")?.kind, SymbolKind.Class);

    // Triggers (Event)
    assert.equal(findSymbol("on_boot")?.kind, SymbolKind.Event);
    assert.equal(findSymbol("script")?.kind, SymbolKind.Event);

    // Protocols/Interfaces (Interface)
    assert.equal(findSymbol("api")?.kind, SymbolKind.Interface);
    assert.equal(findSymbol("i2c")?.kind, SymbolKind.Interface);

    // Constants
    const apiSymbol = findSymbol("api");
    const portSymbol = apiSymbol?.children?.find(s => s.name === "port");
    assert.equal(portSymbol?.kind, SymbolKind.Constant);

    // Enums
    assert.equal(findSymbol("board")?.kind, SymbolKind.Enum);

    // Functions
    const scriptItem = findSymbol("script")?.children?.[0];
    const thenSymbol = scriptItem?.children?.find(s => s.name === "then");
    const firstAction = thenSymbol?.children?.[0];
    const lambdaSymbol = firstAction?.children?.find(s => s.name === "lambda");
    assert.equal(lambdaSymbol?.kind, SymbolKind.Function);

    // GPIO Pin (Interface)
    const sensorItem = findSymbol("sensor")?.children?.[0];
    const pinSymbol = sensorItem?.children?.find(s => s.name === "pin");
    assert.equal(pinSymbol?.kind, SymbolKind.Interface);
  });
});

// HELPERS
// -------

/**
 * Simple dedent helper to strip common leading whitespace from multiline strings.
 * This should make the yaml strings peppered in the tests more readable
 */
export function dedent(str: string): string {
  const lines = str.split("\n");
  // Remove first and last lines, if empty
  if (lines.length > 0 && lines[0].trim() === "") lines.shift();
  if (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();

  // Determine the minimum indentation level
  const minIndent = lines.reduce((min, line) => {
    if (line.trim() === "") return min;
    const match = line.match(/^(\s*)/);
    const indent = match ? match[1].length : 0;
    return Math.min(min, indent);
  }, Infinity);

  // Dedent all lines
  return lines.map((line) => (line.trim() === "" ? "" : line.slice(minIndent)))
    .join("\n");
}
