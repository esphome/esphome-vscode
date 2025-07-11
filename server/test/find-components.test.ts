import "mocha";
import { assert } from "chai";
import { coreSchema } from "../src/editor-shims";
import { ESPHomeDocuments } from "../src/esphome-document";
import { TextBuffer } from "../src/utils/text-buffer";
import { getTextDoc } from "./sample-esphome-yaml";
import { Document } from "yaml";
import { setVersion } from "../src/connection-source";

const documents = new ESPHomeDocuments();

const getYamlDoc = (yamlString: string): Document => {
  const text = getTextDoc(yamlString);
  documents.update("test", new TextBuffer(text));
  return documents.getDocument("test").yaml;
};

describe("findComponents", () => {
  before(async function () {
    setVersion("dev");
  });
  it("root component single id", async () => {
    const result = await coreSchema.getUsableIds(
      "i2c::I2CBus",
      getYamlDoc(`
i2c:
  id: i2c_one

spi:
  id: spi_one
  type: quad`),
    );

    assert.include(result, "i2c_one");

    assert.lengthOf(result, 1);
  });

  it("root component list ids", async () => {
    const result = await coreSchema.getUsableIds(
      "i2c::I2CBus",
      getYamlDoc(`
i2c:
  - id: i2c_one
  - id: i2c_two`),
    );

    assert.include(result, "i2c_one");
    assert.include(result, "i2c_two");
    assert.lengthOf(result, 2);
  });

  it("root component platform id", async () => {
    const result = await coreSchema.getUsableIds(
      "light::LightState",
      getYamlDoc(`
light:
  platform: binary
  id: light_1
  output: gpio_relay_1
`),
    );

    assert.include(result, "light_1");
    assert.lengthOf(result, 1);
  });

  it("root component platform ids", async () => {
    const result = await coreSchema.getUsableIds(
      "light::LightState",
      getYamlDoc(`
light:
  - platform: binary
    id: light_1
    output: gpio_relay_1
  - platform: binary
    id: light_2
    name: "Luz mesa cocina"
    output: gpio_relay_2
`),
    );

    assert.include(result, "light_1");
    assert.include(result, "light_2");
    assert.lengthOf(result, 2);
  });

  it("non component ids", async () => {
    const result = await coreSchema.getUsableIds(
      "sensor::Sensor",
      getYamlDoc(`

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
`),
    );

    assert.include(result, "test_dht_temp");
    assert.include(result, "test_dht_humidity");
    assert.lengthOf(result, 2);
  });

  it("script ids", async () => {
    const result = await coreSchema.getUsableIds(
      "script::Script",
      getYamlDoc(`
script:
  - id: s1
    then:
      - delay: 1s
`),
    );

    assert.include(result, "s1");
    assert.lengthOf(result, 1);
  });
  it("script id", async () => {
    const result = await coreSchema.getUsableIds(
      "script::Script",
      getYamlDoc(`
script:
  id: s1
  then:
    - delay: 1s
`),
    );

    assert.include(result, "s1");
    assert.lengthOf(result, 1);
  });
});
