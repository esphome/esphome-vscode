import { TextDocument } from "vscode-languageserver-textdocument";

let docNumber: number = 0;

export const getTextDoc = (str: string) => {
  return TextDocument.create("x" + docNumber++, "x", 0, str.trimStart());
};

export const esphomeDoc4 = `
esphome:
  project:
    name:
    version:
    `;

export const esphomeDoc5 = `
esphome:
  on_boot:
    `;
