import 'mocha';
import { assert, expect } from 'chai';
import { CompletionHandler } from '../src/completions';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../src/parser/yaml-documents';
import { CompletionItem, Position } from 'vscode-languageserver-types';
import * as Docs from './sampleEsphomeYaml';
import { CoreSchema } from '../src/CoreSchema';
import { SingleYAMLDocument, YamlDocuments } from "../src/parser/yaml-documents";

const coreSchema = new CoreSchema;

const getSingleYAMLDocument = (yamlString: string): SingleYAMLDocument => {
  const document = Docs.getTextDoc(yamlString);
  const yamlDocuments = new YamlDocuments();
  const doc = yamlDocuments.getYamlDocument(document, {
    customTags: ["!secret scalar", "!lambda scalar", "!include scalar"], yamlVersion: "1.1"
  }, true);
  return doc.documents[0];
};

describe('findComponents', () => {
  it('root component single id', () => {
    const result = coreSchema.getUsableIds("i2c::I2CBus", getSingleYAMLDocument(`
i2c:
  id: i2c_one

spi:
  id: spi_one`));

    assert.include(result, 'i2c_one');

    assert.lengthOf(result, 1);
  });

  it('root component list ids', () => {
    const result = coreSchema.getUsableIds("i2c::I2CBus", getSingleYAMLDocument(`
i2c:
  - id: i2c_one
  - id: i2c_two`));

    assert.include(result, 'i2c_one');
    assert.include(result, 'i2c_two');
    assert.lengthOf(result, 2);
  });

  it('root component platform id', () => {
    const result = coreSchema.getUsableIds("light::LightState", getSingleYAMLDocument(`
light:
  platform: binary
  id: light_1
  output: gpio_relay_1
`));

    assert.include(result, 'light_1');
    assert.lengthOf(result, 1);
  });

  it('root component platform ids', () => {
    const result = coreSchema.getUsableIds("light::LightState", getSingleYAMLDocument(`
light:
  - platform: binary
    id: light_1
    output: gpio_relay_1
  - platform: binary
    id: light_2
    name: "Luz mesa cocina"
    output: gpio_relay_2
`));

    assert.include(result, 'light_1');
    assert.include(result, 'light_2');
    assert.lengthOf(result, 2);
  });

  it('non component ids', () => {
    const result = coreSchema.getUsableIds("sensor::Sensor", getSingleYAMLDocument(`

binary_sensor:
  - platform: gpio
    id: gpio1
sensor:
  - platform: dht
    pin: D2
    model: DHT22

    temperature:
      id: test_dht_temp
    humidity:
      id: test_dht_humidity
`));

    assert.include(result, 'test_dht_temp');
    assert.include(result, 'test_dht_humidity');
    assert.lengthOf(result, 2);
  });

  it('script ids', () => {
    const result = coreSchema.getUsableIds("script::Script", getSingleYAMLDocument(`
script:
  - id: s1
    then:
      - delay: 1s
`));

    assert.include(result, 's1');
    assert.lengthOf(result, 1);
  });
  it('script id', () => {
    const result = coreSchema.getUsableIds("script::Script", getSingleYAMLDocument(`
script:
  id: s1
  then:
    - delay: 1s
`));

    assert.include(result, 's1');
    assert.lengthOf(result, 1);
  });


});