import 'mocha';
import { assert, expect } from 'chai';
import { CompletionHandler } from '../src/completions';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../src/parser/yaml-documents';
import { CompletionItem } from 'vscode-languageserver-types';
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

describe('complete', () => {
  it('empty file lists esphome, wifi and others', () => {
    const d = TextDocument.create('x', 'x', 0, '');
    const result = x.onCompletion(d, { line: 0, character: 0 });
    testCompletionHaveLabels(result, ["esphome", "wifi"]);

  });

  it('esphome props, empty esphome dict', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  `), { line: 1, character: 2 });
    testCompletionHaveLabels(result, ["name", "on_boot", "project"]);

  });

  it('esphome props, not empty esphome dict', () => {
    const d = Docs.esphomeDoc2;
    const result = x.onCompletion(d, { line: 2, character: 2 });
    testCompletionHaveLabels(result, ["name", "on_boot"]);
    testCompletionDoesNotHaveLabels(result, ["project"]);
  });

  it('esphome project props, not empty project dict', () => {
    const d = Docs.getTextDoc(`
esphome:
  project:
    name:
    `);
    const result = x.onCompletion(d, { line: 3, character: 4 });
    expect(result).to.be.lengthOf(1);
    testCompletionHaveLabels(result, ["version"]);
  });

  it('esphome project props, full project dict, no suggestions', () => {
    const result = x.onCompletion(Docs.esphomeDoc4, { line: 4, character: 4 });
    assert(result.length === 0, "expected 0 results");
  });

  it('trigger with optional props and empty data', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_boot:
    `), { line: 2, character: 4 });
    testCompletionHaveLabels(result, ["then", "priority"]);
  });

  it('trigger with optional props and then', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_boot:
    then:
    `), { line: 3, character: 4 });
    testCompletionHaveLabels(result, ["priority"]);
  });


  it('trigger with no props', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    `), { line: 2, character: 4 });
    testCompletionHaveLabels(result, ["delay", "if"]);
  });


  it('trigger with then', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    then:
      `), { line: 4, character: 6 });
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it('trigger with prop and then', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_boot:
    priority: 100
    then:
      `), { line: 4, character: 6 });
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it('trigger with action list', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    - delay: 3s
    `), { line: 3, character: 6 });
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it('trigger with then and action list', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    then:
      - delay: 3s
      `), { line: 4, character: 8 });
    testCompletionHaveLabels(result, ["delay", "if"]);
  });


  it('trigger with an action as prop', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    if:
    `), { line: 3, character: 4 });
    assert(result.length === 0, "expected 0 results");
  });

  it('trigger with an action as prop completes the props', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    if:
      `), { line: 3, character: 6 });
    testCompletionHaveLabels(result, ["condition", "then", "else"]);
  });

  it('trigger with an action as seq', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    - if:
        `), { line: 3, character: 8 });
    testCompletionHaveLabels(result, ["condition", "then", "else"]);
  });

  it('trigger with an action as seq dont repeat props', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  name: arduino
  on_loop:
    - delay:
        days: 1
        hours: 3
        `), { line: 6, character: 8 });
    testCompletionHaveLabels(result, ["minutes", "seconds"]);
    testCompletionDoesNotHaveLabels(result, ["days", "hours"]);
  });


  it('trigger with an action dont repeat props', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  name: arduino
  on_loop:
    delay:
      days: 1
      hours: 3
      `), { line: 6, character: 6 });
    testCompletionHaveLabels(result, ["minutes", "seconds"]);
    testCompletionDoesNotHaveLabels(result, ["days", "hours"]);
  });



  it('action registry (not a normal trigger)', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
  esphome:
    on_loop:
      if:
        then:
          `), { line: 4, character: 10 });
    testCompletionHaveLabels(result, ["delay", "if"]);
  });

  it('condition registry', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    if:
      condition:
        `), { line: 4, character: 8 });
    testCompletionHaveLabels(result, ["and", "for", "or"]);
  });

  it('sensors lists platform only', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
sensor:
  `), { line: 1, character: 2 });
    expect(result.length).to.be.equal(1);
    testCompletionHaveLabels(result, ["platform"]);
  });

  it('typed schema ask type only', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esp32:
  framework:
    `), { line: 2, character: 4 });
    expect(result.length).to.be.equal(1);
    testCompletionHaveLabels(result, ["type"]);
  });

  it('typed schema suggests types', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esp32:
  framework:
    type: `), { line: 2, character: 10 });
    expect(result.length).to.be.equal(2);
    testCompletionHaveLabels(result, ["esp-idf", "arduino"]);
  });

  it('typed schema suggests props of type', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esp32:
  framework:
    type: esp-idf
    `), { line: 3, character: 4 });
    testCompletionHaveLabels(result, ["advanced", "version", "source"]);
  });


  it('typed schema suggests props of type 2', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esp32:
  framework:
    type: arduino
    `), { line: 3, character: 4 });
    expect(result.length).to.be.equal(3);
    testCompletionHaveLabels(result, ["version"]);
  });

  it('sensor device enum', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
sensor:
  - platform: dallas
    device_class: `), { line: 2, character: 18 });
    testCompletionHaveLabels(result, ["aqi", "power"]);
  });

  it('logger action enum', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
logger:
  level: DEBUG
  on_message:
    level: `), { line: 3, character: 11 });
    testCompletionHaveLabels(result, ["DEBUG", "ERROR"]);
  });

  it('logger seq action enum', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
logger:
  level: DEBUG
  on_message:
    - level: `), { line: 3, character: 13 });
    testCompletionHaveLabels(result, ["DEBUG", "ERROR"]);
  });

  it('complete bools', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  name_add_mac_suffix: `), { line: 1, character: 23 });
    testCompletionHaveLabels(result, ["True", "False"]);
  });

  it('list sensor filters', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
sensor:
  - platform: template
    filters:
      `), { line: 3, character: 6 });
    testCompletionHaveLabels(result, ["delta", "median"]);
  });


  it('list binary sensor filters', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
binary_sensor:
  - platform: template
    filters:
      `), { line: 3, character: 6 });
    testCompletionHaveLabels(result, ["delayed_on", "invert"]);
  });


  it('list light effects', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
light:
  - platform: binary
    effects:
      `), { line: 3, character: 6 });
    testCompletionHaveLabels(result, ["strobe", "automation"]);
  });


  it('sensor filter in prop show props', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
sensor:
  - platform: template
    filters:
      median:
        send_every:
        `), { line: 5, character: 8 });
    testCompletionHaveLabels(result, ["window_size", "send_first_at"]);
    expect(result).to.be.lengthOf(2);
  });

  it('sensor filter in seq show props', () => {
    const result = x.onCompletion(Docs.getTextDoc(`
sensor:
  - platform: template
    filters:
      - median:
          send_every:
          `), { line: 5, character: 10 });
    testCompletionHaveLabels(result, ["window_size", "send_first_at"]);
    expect(result).to.be.lengthOf(2);
  });

});

