import { DocumentSymbol } from "vscode-languageserver-types";
import { ESPHomeDocuments } from "./esphome-document";

export class DocumentSymbolHandler {

    constructor(private documents: ESPHomeDocuments) { }

    public getDocumentSymbols(uri: string): DocumentSymbol[] {
        return []
    }
}
