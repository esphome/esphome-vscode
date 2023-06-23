import "mocha";
import { assert, expect } from "chai";
import { esphomeDoc4 } from "./sample-esphome-yaml";
import {
  getCompletionsFor,
  testCompletionDoesNotHaveLabels,
  testCompletionHaveLabels,
} from "./shared";

describe("complete", () => {
  it("empty file lists esphome, wifi and others", async () => {
    const result = await getCompletionsFor("");
    testCompletionHaveLabels(result, ["esphome", "wifi"]);
  });

  it("partial completes esph___", async () => {
    const result = await getCompletionsFor("esph");
    testCompletionHaveLabels(result, ["esphome", "wifi"]);
  });

  it("partial completes esph___ with other content", async () => {
    const result = await getCompletionsFor(`
substitutions:

esph`);
    testCompletionHaveLabels(result, ["esphome", "wifi"]);
  });

  it("partial completes can___ with other content", async () => {
    const result = await getCompletionsFor(
      `
can

esphome:
    `,
      { line: 0, character: 3 }
    );
    testCompletionHaveLabels(result, ["esphome", "wifi"]);
  });

  it("completes platforms", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  - platform: `
    );
    testCompletionHaveLabels(result, ["adc", "dallas", "dht"]);
  });

  it("partial completes properties", async () => {
    const result = await getCompletionsFor(
      `
canbus:
  - platform: esp32_can
    tx_p`
    );
    testCompletionHaveLabels(result, ["tx_pin", "rx_pin"]);
  });
  it("partial completes properties with other content", async () => {
    const result = await getCompletionsFor(
      `
canbus:
  - platform: esp32_can
    tx_p

esphome:`,
      { line: 2, character: 8 }
    );
    testCompletionHaveLabels(result, ["tx_pin", "rx_pin"]);
  });

  it("esphome props, empty esphome dict", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  `,
      { line: 1, character: 2 }
    );
    testCompletionHaveLabels(result, ["name", "on_boot", "project"]);
  });

  it("esphome props, not empty esphome dict", async () => {
    const result = await getCompletionsFor(`
esphome:
  project:
  `);
    testCompletionHaveLabels(result, ["name", "on_boot"]);
    testCompletionDoesNotHaveLabels(result, ["project"]);
  });

  it("esphome props, not empty esphome dict whitespace", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  project:
    `,
      { line: 2, character: 2 }
    );
    testCompletionHaveLabels(result, ["name", "on_boot"]);
    testCompletionDoesNotHaveLabels(result, ["project"]);
  });

  it("esphome project props, not empty project dict", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  project:
    name:
    `,
      { line: 3, character: 4 }
    );
    expect(result).to.be.lengthOf(1);
    testCompletionHaveLabels(result, ["version"]);
  });

  it("esphome project props, full project dict, no suggestions", async () => {
    const result = await getCompletionsFor(esphomeDoc4, {
      line: 4,
      character: 4,
    });
    assert(result.length === 0, "expected 0 results");
  });

  it("trigger with optional props and empty data", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_boot:
    `,
      { line: 2, character: 4 }
    );
    testCompletionHaveLabels(result, ["then", "priority"]);
  });

  it("trigger with optional props and then", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_boot:
    then:
    `
    );
    testCompletionHaveLabels(result, ["priority"]);
  });

  it("trigger with no props", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_loop:
    `,
      { line: 2, character: 4 }
    );
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it("trigger with then", async () => {
    const result = await getCompletionsFor(
      `esphome:
  on_loop:
    then:
      `,
      { line: 3, character: 6 }
    );
    testCompletionHaveLabels(result, [
      "delay",
      "if",
      "wait_until",
      "lambda",
      "repeat",
      "while",
    ]);
    expect(result).to.be.lengthOf(6);
  });

  it("trigger with prop and then", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_boot:
    priority: 100
    then:
      `,
      { line: 4, character: 6 }
    );
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it("trigger with action list", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_loop:
    - delay: 3s
    `
    );
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it("trigger with then and action list", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_loop:
    then:
      - delay: 3s
      `
    );
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it("trigger with an action as prop", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_loop:
    if:
    `
    );
    assert(result.length === 0, "expected 0 results");
  });

  it("trigger with an action as prop completes the props", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_loop:
    if:
      `,
      { line: 3, character: 6 }
    );
    testCompletionHaveLabels(result, ["condition", "then", "else"]);
  });

  it("trigger with an action as seq", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_loop:
    - if:
        `,
      { line: 3, character: 8 }
    );
    testCompletionHaveLabels(result, ["condition", "then", "else"]);
  });

  it("trigger with an action as seq dont repeat props", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  name: arduino
  on_loop:
    - delay:
        days: 1
        hours: 3
        `,
      { line: 6, character: 8 }
    );
    testCompletionHaveLabels(result, ["minutes", "seconds"]);
    testCompletionDoesNotHaveLabels(result, ["days", "hours"]);
  });

  it("trigger with an action dont repeat props", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  name: arduino
  on_loop:
    delay:
      days: 1
      hours: 3
      `,
      { line: 6, character: 6 }
    );
    testCompletionHaveLabels(result, ["minutes", "seconds"]);
    testCompletionDoesNotHaveLabels(result, ["days", "hours"]);
  });

  it("action registry (not a normal trigger)", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_loop:
    if:
      then:
        `,
      { line: 4, character: 8 }
    );
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it("condition registry", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  on_loop:
    if:
      condition:
        `,
      { line: 4, character: 8 }
    );
    testCompletionHaveLabels(result, ["and", "for", "or"]);
  });

  it("sensors lists platform only", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  `,
      { line: 1, character: 2 }
    );
    expect(result.length).to.be.equal(1);
    testCompletionHaveLabels(result, ["platform"]);
  });

  it("sensor props no list", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  platform: dallas
  `,
      { line: 2, character: 2 }
    );
    testCompletionHaveLabels(result, ["dallas_id", "device_class"]);
  });

  it("sensor props in list", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  - platform: dallas
    `,
      { line: 2, character: 4 }
    );
    testCompletionHaveLabels(result, ["dallas_id", "device_class"]);
  });

  it("sensor device enum no list", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  platform: dallas
  device_class: `,
      { line: 2, character: 16 }
    );
    testCompletionHaveLabels(result, ["aqi", "power"]);
  });
  it("sensor device enum list", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  - platform: dallas
    device_class: `,
      { line: 2, character: 18 }
    );
    testCompletionHaveLabels(result, ["aqi", "power"]);
  });

  it("logger action enum", async () => {
    const result = await getCompletionsFor(
      `
logger:
  level: DEBUG
  on_message:
    level: `,
      { line: 3, character: 11 }
    );
    testCompletionHaveLabels(result, ["DEBUG", "ERROR"]);
  });

  it("logger seq action enum", async () => {
    const result = await getCompletionsFor(
      `
logger:
  level: DEBUG
  on_message:
    - level: `,
      { line: 3, character: 13 }
    );
    testCompletionHaveLabels(result, ["DEBUG", "ERROR"]);
  });

  it("complete bools", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  name_add_mac_suffix: `,
      { line: 1, character: 23 }
    );
    testCompletionHaveLabels(result, ["True", "False"]);
  });

  it("list sensor filters", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  - platform: template
    filters:
      `,
      { line: 3, character: 6 }
    );
    testCompletionHaveLabels(result, ["delta", "median"]);
  });

  it("list binary sensor filters", async () => {
    const result = await getCompletionsFor(
      `
binary_sensor:
  - platform: template
    filters:
      `,
      { line: 3, character: 6 }
    );
    testCompletionHaveLabels(result, ["delayed_on", "invert"]);
  });

  it("list light effects", async () => {
    const result = await getCompletionsFor(
      `
light:
  - platform: binary
    effects:
      `,
      { line: 3, character: 6 }
    );
    testCompletionHaveLabels(result, ["strobe", "automation"]);
  });

  it("list addressable light effects", async () => {
    const result = await getCompletionsFor(
      `
light:
  - platform: fastled_clockless
    effects:
      `,
      { line: 3, character: 6 }
    );
    testCompletionHaveLabels(result, [
      "strobe",
      "automation",
      "addressable_random_twinkle",
    ]);
  });

  it("sensor filter in prop show props", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  - platform: template
    filters:
      median:
        send_every:
        `,
      { line: 5, character: 8 }
    );
    testCompletionHaveLabels(result, ["window_size", "send_first_at"]);
    expect(result).to.be.lengthOf(2);
  });

  it("sensor filter in seq show props", async () => {
    const result = await getCompletionsFor(
      `
sensor:
  - platform: template
    filters:
      - median:
          send_every:
          `,
      { line: 5, character: 10 }
    );
    testCompletionHaveLabels(result, ["window_size", "send_first_at"]);
    expect(result).to.be.lengthOf(2);
  });

  it("resolve typed platforms", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  name: arduino
esp8266:
  board: d1
output:
  - platform: template
    `,
      { line: 6, character: 4 }
    );
    testCompletionHaveLabels(result, ["type"]);
    expect(result).to.be.lengthOf(1);
  });

  it("resolve pin esp8266", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  name: arduino
esp8266:
  board: d1
output:
  - platform: gpio
    pin:
      `,
      { line: 7, character: 6 }
    );
    testCompletionHaveLabels(result, ["number", "mode"]);
    testCompletionDoesNotHaveLabels(result, ["drive_strength"]);
  });

  it("resolve pin esp32", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  name: arduino
esp32:
  board: d1
output:
  - platform: gpio
    pin:
      `,
      { line: 7, character: 6 }
    );
    testCompletionHaveLabels(result, ["number", "mode", "drive_strength"]);
  });

  it("fill preselect default value", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: arduino
esp32:
  board: d1
logger:
  bau`);
    expect(
      result.find((r) => r.label === "baud_rate")?.insertText
    ).to.be.string("baud_rate: ${0:115200}");
  });

  it("interval suggests without list", async () => {
    const result = await getCompletionsFor(
      `
esphome:
  name: arduino
esp32:
  board: d1
interval:
  interval: 1h
  `,
      { line: 6, character: 2 }
    );
    testCompletionHaveLabels(result, ["then"]);
    testCompletionDoesNotHaveLabels(result, ["interval"]);
  });

  it("interval suggests with list", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: arduino
esp32:
  board: d1
interval:
  - interval: 1h
    then:
      delay: 1s
  - interval: 2h
    `);
    testCompletionHaveLabels(result, ["then"]);
    testCompletionDoesNotHaveLabels(result, ["interval"]);
  });

  it("list automations when schema and list has an automation", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: test-completions
  on_boot:
    - delay: 2s
    `);
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it("root components marked list", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: test-completions
i2c:
  - id: d2
    `);
    testCompletionHaveLabels(result, ["frequency"]);
  });

  it("pzemac restart", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: test-completions

sensor:
  - platform: pzemac
    voltage:
      on_value:
        `);
    testCompletionHaveLabels(result, ["pzemac.reset_energy"]);
  });

  it("component update", async () => {
    const result = await getCompletionsFor(`
esphome:
  name: test-completions

sensor:
  - platform: adc # Polling component
    on_value:
      `);
    testCompletionHaveLabels(result, ["component.update"]);
  });
  it("component update non platform", async () => {
    const result = await getCompletionsFor(`
interval:
esphome:
  name: test-completions
  on_loop:
    `);

    testCompletionHaveLabels(result, ["component.update"]);
  });
  it("script execute non platform", async () => {
    const result = await getCompletionsFor(`
script:
esphome:
  name: test-completions
  on_loop:
    `);

    testCompletionHaveLabels(result, ["script.execute"]);
  });

  it("script execute non platform dont crash", async () => {
    const result = await getCompletionsFor(`
script:
not_a_component:
esphome:
  name: test-completions
  on_loop:
    `);

    testCompletionHaveLabels(result, ["script.execute"]);
  });

  it("homeassistant actions with api component", async () => {
    const result = await getCompletionsFor(`
api:
esphome:
  name: test-completions
  on_loop:
    `);

    testCompletionHaveLabels(result, [
      "homeassistant.event",
      "homeassistant.service",
    ]);
  });

  it("dont repeat actions", async () => {
    const result = await getCompletionsFor(`
sim800l:
sensor:
  - platform: sim800l
    rssi:
      id: rssi_sensor
esphome:
  name: test-completions
  on_loop:
    `);

    const matchCount = result.filter((c) => c.label === "sim800l.connect")
      .length;
    if (matchCount !== 1) {
      assert.fail(`expected 1 match but found ${matchCount} instead`);
    }
  });

  it("list add dash", async () => {
    const result = await getCompletionsFor(`
i2c:
  `);

    assert(
      result.find((r) => r.label === "frequency")?.insertText?.startsWith("- ")
    );
  });

  it("list dont add dash twice", async () => {
    const result = await getCompletionsFor(`
i2c:
  - `);

    assert(
      result
        .find((r) => r.label === "frequency")
        ?.insertText?.startsWith("frequency")
    );
  });
  it("registry add dash", async () => {
    const result = await getCompletionsFor(`
esphome:
  on_loop:
    - delay: 1s
    `);

    assert(
      result.find((r) => r.label === "delay")?.insertText?.startsWith("- ")
    );
  });

  it("registry dont add dash twice", async () => {
    const result = await getCompletionsFor(`
esphome:
  on_loop:
    - delay: 1s
    - `);

    assert(
      result.find((r) => r.label === "delay")?.insertText?.startsWith("delay")
    );
  });

  it("complete menu items single", async () => {
    const result = await getCompletionsFor(`
lcd_menu:
  items:
    - type: `);

    testCompletionHaveLabels(result, ["label", "menu"]);
  });
  it("complete menu items single menu", async () => {
    const result = await getCompletionsFor(`
lcd_menu:
  items:
    - type: menu
      `);
    testCompletionHaveLabels(result, ["items"]);
  });
  it("complete menu items recursive", async () => {
    const result = await getCompletionsFor(`
lcd_menu:
  items:
    - type: menu
      items:
        - `);

    testCompletionHaveLabels(result, ["type"]);
  });
});
