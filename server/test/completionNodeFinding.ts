import 'mocha';
import { assert, expect } from 'chai';
import { CompletionHandler } from '../src/completions';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../src/parser/yaml-documents';
import { CompletionItem } from 'vscode-languageserver-types';
import * as Docs from './sampleEsphomeYaml';

const testCompletionHasLabels = (result: CompletionItem[], testSet) => {
    let count = 0;
    for (var c of testSet) {
        if (result.find(x => x.label === c)) {
            count++;
        }
        else {
            assert.fail(`expected label '${c}' in result`);
        }
    }
    assert(count === testSet.length, "some completion labels not found");
};
const testCompletionDoesNotHasLabels = (result: CompletionItem[], testSet) => {
    let count = 0;
    for (var c of testSet) {
        if (result.find(x => x.label === c)) {
            assert.fail(`not expected label '${c}' in result`);
        }
    }
};

const x = new CompletionHandler(yamlDocumentsCache);

describe('complete', () => {
    it('empty file lists esphome, wifi and others', () => {
        const d = TextDocument.create('x', 'x', 0, '');
        const result = x.onCompletion(d, { line: 0, character: 0 });
        testCompletionHasLabels(result, ["esphome", "wifi"]);

    });

    it('esphome props, empty esphome dict', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  `), { line: 1, character: 2 });
        testCompletionHasLabels(result, ["name", "on_boot", "project"]);

    });

    it('esphome props, not empty esphome dict', () => {
        const d = Docs.esphomeDoc2;
        const result = x.onCompletion(d, { line: 2, character: 2 });
        testCompletionHasLabels(result, ["name", "on_boot"]);
        testCompletionDoesNotHasLabels(result, ["project"]);
    });

    it('esphome project props, not empty project dict', () => {
        const d = Docs.getTextDoc(`
esphome:
  project:
    name:
    `);
        const result = x.onCompletion(d, { line: 3, character: 4 });
        assert(result.length === 1, "only one result expected");
        testCompletionHasLabels(result, ["version"]);
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
        testCompletionHasLabels(result, ["then", "priority"]);
    });

    it('trigger with optional props and then', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_boot:
    then:
    `), { line: 3, character: 4 });
        testCompletionHasLabels(result, ["priority"]);
    });


    it('trigger with no props', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    `), { line: 2, character: 4 });
        testCompletionHasLabels(result, ["delay", "if"]);
    });


    it('trigger with then', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    then:
      `), { line: 4, character: 6 });
        testCompletionHasLabels(result, ["delay", "if"]);
    });

    it('trigger with prop and then', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_boot:
    priority: 100
    then:
      `), { line: 4, character: 6 });
        testCompletionHasLabels(result, ["delay", "if"]);
    });

    it('trigger with action list', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    - delay: 3s
    `), { line: 3, character: 6 });
        testCompletionHasLabels(result, ["delay", "if"]);
    });

    it('trigger with then and action list', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    then:
      - delay: 3s
      `), { line: 4, character: 8 });
        testCompletionHasLabels(result, ["delay", "if"]);
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
        testCompletionHasLabels(result, ["condition", "then", "else"]);
    });

    it('trigger with an action as seq', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    - if:
        `), { line: 3, character: 8 });
        testCompletionHasLabels(result, ["condition", "then", "else"]);
    });

    it('action registry (not a normal trigger)', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    if:
      then:
        `), { line: 4, character: 8 });
        testCompletionHasLabels(result, ["delay", "if"]);
    });

    it('condition registry', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esphome:
  on_loop:
    if:
      condition:
        `), { line: 4, character: 8 });
        testCompletionHasLabels(result, ["and", "for", "or"]);
    });

    it('sensors lists platform only', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
sensor:
  `), { line: 1, character: 2 });
        expect(result.length).to.be.equal(1);
        testCompletionHasLabels(result, ["platform"]);
    });

    it('typed schema ask type only', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esp32:
  framework:
    `), { line: 2, character: 4 });
        expect(result.length).to.be.equal(1);
        testCompletionHasLabels(result, ["type"]);
    });

    it('typed schema suggests types', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esp32:
  framework:
    type: `), { line: 2, character: 10 });
        expect(result.length).to.be.equal(2);
        testCompletionHasLabels(result, ["esp-idf", "arduino"]);
    });

    it('typed schema suggests props of type', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esp32:
  framework:
    type: esp-idf
    `), { line: 3, character: 4 });
        testCompletionHasLabels(result, ["advanced", "version", "source"]);
    });


    it('typed schema suggests props of type 2', () => {
        const result = x.onCompletion(Docs.getTextDoc(`
esp32:
  framework:
    type: arduino
    `), { line: 3, character: 4 });
        expect(result.length).to.be.equal(3);
        testCompletionHasLabels(result, ["version"]);
    });


});

