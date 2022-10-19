import "mocha";
import { expect } from "chai";
import { ESPHomeDocuments } from "../src/esphome-document";
import { TextBuffer } from "../src/utils/text-buffer";
import { getTextDoc } from "./sample-esphome-yaml";
import { isMap } from "yaml";
import { HoverHandler } from "../src/hover-handler";
import { Hover, MarkupContent } from "vscode-languageserver-types";

const documents = new ESPHomeDocuments();

describe("custom tags", () => {
  it("parse secrets", async () => {
    const yaml = `
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password`;
    const yamlString = yaml.trimStart();

    documents.update("test_uri", new TextBuffer(getTextDoc(yamlString)));
    const doc = documents.getDocument("test_uri");

    const x = doc;
    const map = doc.yaml?.contents;
    expect(isMap(map));
    if (isMap(map)) {
      // @ts-ignore
      expect(doc.yaml?.contents.items[0].value.items[0].value.tag).to.equal(
        "!secret"
      );
    }
  });

  it("get hover !secret", async () => {
    const yaml = `
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

api:
`;
    const yamlString = yaml.trimStart();

    documents.update("test_uri", new TextBuffer(getTextDoc(yamlString)));
    const doc = documents.getDocument("test_uri");

    const hoverHandler = new HoverHandler(documents);

    const hover = await hoverHandler.getHover("test_uri", {
      line: 1,
      character: 12,
    });

    const contents = hover?.contents as MarkupContent;
    expect(contents?.value).to.include("wifi");
  });

  it("don't fall thru", async () => {
    const yaml = `
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

api:
`;
    const yamlString = yaml.trimStart();

    documents.update("test_uri", new TextBuffer(getTextDoc(yamlString)));
    const doc = documents.getDocument("test_uri");

    const hoverHandler = new HoverHandler(documents);

    const hover = await hoverHandler.getHover("test_uri", {
      line: 1,
      character: 7, // cursor is between ssid: and !secret, this test for a bug where api: hovers were shown
    });

    const contents = hover?.contents as MarkupContent;
    expect(contents?.value).to.not.include("api");
    expect(contents?.value).to.include("wifi");
  });
});
