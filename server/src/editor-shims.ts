import * as fs from "fs";
import path = require("path");

import {
  Hover,
  Range,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver-types";

import { ESPHomeSchema } from "./esphome-schema";

export {
  Position,
  Range,
  CompletionItem,
  CompletionItemKind,
} from "vscode-languageserver-types";

export const coreSchema = new ESPHomeSchema(async (name: string) => {
  const jsonPath = path.join(__dirname, `schema/${name}.json`);
  const fileContents = fs.readFileSync(jsonPath, "utf-8");
  return JSON.parse(fileContents);
});

export const createHover = (contents: string, range: Range): Hover => {
  const hover: Hover = {
    contents: {
      kind: "markdown",
      value: contents,
    },
    range,
  };
  return hover;
};

export const createCompletion = (
  label: string,
  insertText: string,
  kind: CompletionItemKind,
  documentation: string | undefined = undefined,
  triggerSuggest: boolean = false,
  preselect?: boolean,
  snippet?: boolean,
  sortText?: string,
  detail?: string
) => {
  const completion: CompletionItem = {
    label: label,
    insertText: insertText,
    kind,
    detail,
    sortText,
    preselect,
  };
  if (triggerSuggest) {
    completion.command = {
      title: "chain",
      command: "editor.action.triggerSuggest",
    };
  }
  if (documentation) {
    completion.documentation = {
      kind: "markdown",
      value: documentation,
    };
  }
  if (snippet) {
    completion.insertTextFormat = InsertTextFormat.Snippet;
  }

  return completion;
};

export const createCompletionSnippet = (
  label: string,
  insertText: string,
  kind: CompletionItemKind,
  documentation: string | undefined = undefined
) => {
  const completion: CompletionItem = {
    label: label,
    insertText: insertText,
    kind,
    insertTextFormat: InsertTextFormat.Snippet,
    documentation,
  };
  return completion;
};

//export const createDefinition = ()
