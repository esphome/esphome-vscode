import "mocha";
import { assert } from "chai";
import { ESPHomeDocuments } from "../src/esphome-document";
import { TextBuffer } from "../src/utils/text-buffer";
import { getTextDoc } from "./sample-esphome-yaml";
import { setVersion } from "../src/connection-source";
import { coreSchema } from "../src/editor-shims";

const documents = new ESPHomeDocuments(coreSchema);

const getESPHomeDoc = (yamlString: string) => {
  const text = getTextDoc(yamlString);
  documents.update("test", new TextBuffer(text));
  return documents.getDocument("test");
};

describe("findComponents", () => {
  before(async function () {
    setVersion("dev");
  });
  it("root component single id", async () => {
    const result = await getESPHomeDoc(`
i2c:
  id: i2c_one

spi:
  id: spi_one
  type: quad`).getUsableIds("i2c::I2CBus");

    assert.include(result, "i2c_one");

    assert.lengthOf(result, 1);
  });

  it("root component list ids", async () => {
    const result = await getESPHomeDoc(`
i2c:
  - id: i2c_one
  - id: i2c_two`).getUsableIds("i2c::I2CBus");

    assert.include(result, "i2c_one");
    assert.include(result, "i2c_two");
    assert.lengthOf(result, 2);
  });

  it("root component platform id", async () => {
    const result = await getESPHomeDoc(`
light:
  platform: binary
  id: light_1
  output: gpio_relay_1
`).getUsableIds("light::LightState");

    assert.include(result, "light_1");
    assert.lengthOf(result, 1);
  });

  it("root component platform ids", async () => {
    const result = await getESPHomeDoc(`
light:
  - platform: binary
    id: light_1
    output: gpio_relay_1
  - platform: binary
    id: light_2
    name: "Luz mesa cocina"
    output: gpio_relay_2
`).getUsableIds("light::LightState");

    assert.include(result, "light_1");
    assert.include(result, "light_2");
    assert.lengthOf(result, 2);
  });

  it("non component ids", async () => {
    const result = await getESPHomeDoc(`

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
`).getUsableIds("sensor::Sensor");

    assert.include(result, "test_dht_temp");
    assert.include(result, "test_dht_humidity");
    assert.lengthOf(result, 2);
  });

  it("script ids", async () => {
    const result = await getESPHomeDoc(`
script:
  - id: s1
    then:
      - delay: 1s
`).getUsableIds("script::Script");

    assert.include(result, "s1");
    assert.lengthOf(result, 1);
  });
  it("script id", async () => {
    const result = await getESPHomeDoc(`
script:
  id: s1
  then:
    - delay: 1s
`).getUsableIds("script::Script");

    assert.include(result, "s1");
    assert.lengthOf(result, 1);
  });
});
