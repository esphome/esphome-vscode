import "mocha";
import { getCompletionsFor, testCompletionHaveLabels } from "./shared";
import { setVersion } from "../src/connection-source";

describe("complete_ids", () => {
  before(async function () {
    setVersion("dev");
  });

  it("i2c_ids", async () => {
    const result = await getCompletionsFor(`
i2c:
  - id: i2c_one
  - id: i2c_two

ads1115:
  i2c_id: `);
    testCompletionHaveLabels(result, ["i2c_one", "i2c_two"]);
  });

  it("i2c_ids_prop_and_trailing_space", async () => {
    const result = await getCompletionsFor(
      `
i2c:
  - id: i2c_one
  - id: i2c_two

ads1115:
  address: 23
  i2c_id:  `,
      { line: 6, character: 10 },
    );
    testCompletionHaveLabels(result, ["i2c_one", "i2c_two"]);
  });

  it("output_ids", async () => {
    const result = await getCompletionsFor(`
output:
  - platform: gpio
    pin: GPIO3
    id: output_gpio3
  - platform: gpio
    pin: GPIO4
    id: output_gpio4

switch:
  - platform: output
    name: x
    output: `);
    testCompletionHaveLabels(result, ["output_gpio3", "output_gpio4"]);
  });

  it("switch_toggle_action_id", async () => {
    const result = await getCompletionsFor(`
switch:
  - platform: gpio
    id: sw_1
  - platform: gpio
    id: sw_2
    on_turn_on:
      - switch.toggle:
          id: `);
    testCompletionHaveLabels(result, ["sw_1", "sw_2"]);
  });

  it("switch_toggle_action_maybe", async () => {
    const result = await getCompletionsFor(`
switch:
  - platform: gpio
    id: sw_1
  - platform: gpio
    id: sw_2
    on_turn_on:
      - switch.toggle: `);
    testCompletionHaveLabels(result, ["sw_1", "sw_2"]);
  });

  it("switch_toggle_action_maybe_then_list", async () => {
    const result = await getCompletionsFor(`
switch:
  - platform: gpio
    id: sw_1
    pin: GPIO2
  - platform: output
    output: o_gpio3
    id: sw_2
    on_turn_on:
      then:
        - switch.turn_off: `);
    testCompletionHaveLabels(result, ["sw_1", "sw_2"]);
  });

  it("turn on lights by id", async () => {
    const result = await getCompletionsFor(`
light:
  - platform: binary
    id: light1
  - platform: binary
    id: light2
    on_state:
      - light.turn_on:
          id: `);
    testCompletionHaveLabels(result, ["light1", "light2"]);
  });

  it("conditions by id", async () => {
    const result = await getCompletionsFor(`
binary_sensor:
  - platform: gpio
    pin: GPIO2
    id: bs_gpio2
    on_click:
      then:
        - if:
            condition:
              - binary_sensor.is_on:
                 id: `);
    testCompletionHaveLabels(result, ["bs_gpio2"]);
  });

  it("conditions by may be id", async () => {
    const result = await getCompletionsFor(`
binary_sensor:
  - platform: gpio
    pin: GPIO2
    id: bs_gpio2
    on_click:
      then:
        - if:
            condition:
              - binary_sensor.is_on: `);
    testCompletionHaveLabels(result, ["bs_gpio2"]);
  });

  it("completes area ids", async () => {
    const result = await getCompletionsFor(`
esphome:
  
  areas:
    - name: Area 1
      id: area_1

  devices:
    - name: Device 1
      id: device_1
      area_id: `);
    testCompletionHaveLabels(result, ["area_1"]);
  });

  it("completes devices ids", async () => {
    const result = await getCompletionsFor(`
esphome:
  devices:
    - name: Device 1
      id: device_1
switch:
  platform: template
  device_id: `);
    testCompletionHaveLabels(result, ["device_1"]);
  });

  it("completes devices ids in sensors", async () => {
    const result = await getCompletionsFor(`
esphome:
  devices:
    - name: Device 1
      id: device_1
sensor:
  - platform: sim800l
    rssi:
      name: Generador RSSI
      device_id: `);
    testCompletionHaveLabels(result, ["device_1"]);
  });

  it("completes global ids", async () => {
    const result = await getCompletionsFor(`
globals:
  - id: global_float
    type: float
    initial_value: "0.0"
esphome:
  on_boot:
      # tank almost full
      - globals.set:
          id: `);
    testCompletionHaveLabels(result, ["global_float"]);
  });
});
