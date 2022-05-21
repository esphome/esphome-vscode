import 'mocha';
import { assert, expect } from 'chai';
import { CompletionHandler } from '../src/completions';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../src/parser/yaml-documents';
import { CompletionItem, Position } from 'vscode-languageserver-types';
import * as Docs from './sampleEsphomeYaml';
import { CoreSchema } from '../src/CoreSchema';

const testCompletionHaveLabels = (result: CompletionItem[], testSet) => {
    let count = 0;
    for (var c of testSet) {
        if (result.find(x => x.label === c)) {
            count++;
        }
        else {
            assert.fail(`expected label '${c}' in result, got instead: ${JSON.stringify(result)}`);
        }
    }
    assert(count === testSet.length, "some completion labels not found");
};
const testCompletionDoesNotHaveLabels = (result: CompletionItem[], testSet) => {
    let count = 0;
    for (var c of testSet) {
        if (result.find(x => x.label === c)) {
            assert.fail(`not expected label '${c}' in result`);
        }
    }
};

const coreSchema = new CoreSchema;

const x = new CompletionHandler(yamlDocumentsCache, coreSchema);


const getCompletionsFor = (yamlString: string, position: Position = null): CompletionItem[] => {
    yamlString = yamlString.trimStart();
    if (position === null) {
        // default to end of doc
        const lines = yamlString.split('\n');
        position = {
            line: lines.length - 1,
            character: lines[lines.length - 1].length
        };
    }
    console.log('position is ' + JSON.stringify(position));
    return x.onCompletion(Docs.getTextDoc(yamlString), position);
};

describe('complete_ids', () => {
    it('i2c_ids', () => {
        const result = getCompletionsFor(`
i2c:
  - id: i2c_one
  - id: i2c_two

ads1115:
  i2c_id: `);
        testCompletionHaveLabels(result, ["i2c_one", "i2c_two"]);
    });
    it('output_ids', () => {
        const result = getCompletionsFor(`
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

    it('switch_toggle_action_id', () => {
        const result = getCompletionsFor(`
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


    it('switch_toggle_action_maybe', () => {
        const result = getCompletionsFor(`
switch:
  - platform: gpio
    id: sw_1
  - platform: gpio
    id: sw_2
    on_turn_on:
      - switch.toggle: `);
        testCompletionHaveLabels(result, ["sw_1", "sw_2"]);
    });

    it('switch_toggle_action_maybe_then_list', () => {
        const result = getCompletionsFor(`
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

    it('turn on lights by id', () => {
        const result = getCompletionsFor(`
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

    it('conditions by id', () => {
        const result = getCompletionsFor(`
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

    it('conditions by may be id', () => {
        const result = getCompletionsFor(`
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



});