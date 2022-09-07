import "mocha";
import { assert, expect } from "chai";
import { CompletionItem, coreSchema, Position } from "../src/editor-shims";
import { CompletionsHandler } from "../src/completions-handler";
import { ESPHomeDocuments } from "../src/esphome-document";
import { TextBuffer } from "../src/utils/text-buffer";
import { getTextDoc } from "./sample-esphome-yaml";
import { Document } from "yaml";

const documents = new ESPHomeDocuments();

const getYamlDoc = (yamlString: string): Document => {
  const text = getTextDoc(yamlString);
  documents.update("test", new TextBuffer(text));
  return documents.getDocument("test").yaml;
};

describe("findComponents", () => {
  it("root component single id", async () => {
    const result = await coreSchema.getUsableIds(
      "i2c::I2CBus",
      getYamlDoc(`
i2c:
  id: i2c_one

spi:
  id: spi_one`)
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
  - id: i2c_two`)
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
`)
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
`)
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
`)
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
`)
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
`)
    );

    assert.include(result, "s1");
    assert.lengthOf(result, 1);
  });

  it("custom sensor id", async () => {
    const result = await coreSchema.getUsableIds(
      "sensor::Sensor",
      getYamlDoc(`
sensor:
  - platform: custom
    lambda: |-
      auto my_sensor = new MyCustomSensor();
      App.register_component(my_sensor);
      return {my_sensor};

    sensors:
      name: "My Custom Sensor"
      id: a_custom_sensor
`)
    );

    assert.include(result, "a_custom_sensor");
    assert.lengthOf(result, 1);
  });

  it("custom sensors seq ids", async () => {
    const result = await coreSchema.getUsableIds(
      "sensor::Sensor",
      getYamlDoc(`
sensor:
  - platform: custom
    lambda: |-
      auto my_sensor = new MyCustomSensor();
      App.register_component(my_sensor);
      return {my_sensor};

    sensors:
      - name: "My Custom Sensor A"
        id: a_custom_sensor
      - name: "My Custom Sensor B"
        id: b_custom_sensor
`)
    );

    assert.include(result, "a_custom_sensor", "b_custom_sensor");
    assert.lengthOf(result, 2);
  });

  it("custom binary sensor id", async () => {
    const result = await coreSchema.getUsableIds(
      "binary_sensor::BinarySensor",
      getYamlDoc(`

binary_sensor:
  - platform: custom
    lambda: |-
      return {my_custom_sensor};

    binary_sensors:
      name: "My Custom Binary Sensor"
      id: a_custom_binary_sensor
`)
    );

    assert.include(result, "a_custom_binary_sensor");
    assert.lengthOf(result, 1);
  });

  it("custom binary outputs is", async () => {
    const result = await coreSchema.getUsableIds(
      "output::BinaryOutput",
      getYamlDoc(`
output:
  - platform: custom
    type: binary
    lambda: |-
      return {ape_binary_output(id(ape), 7),
              ape_binary_output(id(ape), 6),
              ape_binary_output(id(ape), 5),
              ape_binary_output(id(ape), 4)};
    outputs:
      - id: custom_output_id_1
      - id: custom_output_id_2
`)
    );

    assert.include(result, "custom_output_id_1", "custom_output_id_2");
    assert.lengthOf(result, 2);
  });
});
