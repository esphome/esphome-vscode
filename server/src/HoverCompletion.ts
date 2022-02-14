import * as path from "path";
import * as fs from "fs";
// import {
//     getLanguageService,
//     LanguageService,
//     LanguageSettings,
// } from "yaml-language-server";

import { CompletionList, Connection, Hover, Position, CompletionItemKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getLanguageService, LanguageService, LanguageSettings } from "./yamlLanguageService";
import { Telemetry } from "./telemetry";

export class ESPHomeLanguageService {

    yamlLanguageService: LanguageService;
    telemetry: Telemetry;

    constructor(connection: Connection) {

        return;
        this.telemetry = new Telemetry(connection);
        this.yamlLanguageService = getLanguageService(
            async () => "", null!, connection, this.telemetry);

        const jsonPath = path.join(__dirname, "schema.json");
        const fileContents = fs.readFileSync(jsonPath, "utf-8");
        const schema = JSON.parse(fileContents);

        try {
            this.yamlLanguageService.configure(<LanguageSettings>{
                validate: false,
                completion: true,
                format: true,
                hover: true,
                schemas: [{ uri: 'http://esphome.io/esphome/schema', fileMatch: ["*.yaml"], schema: schema }],
                customTags: [
                    "!secret scalar",
                    "!lambda scalar",
                    "!include scalar"
                ],
                yamlVersion: "1.1"
            });

        } catch (e) {
            console.log(e);
        }
    }

    public onCompletion = async (
        textDocument: TextDocument,
        position: Position
    ): Promise<CompletionList> => {
        const result: CompletionList = {
            items: [],
            isIncomplete: false,
        };

        try {
            if (!textDocument) {
                return Promise.resolve(result);
            }

            return CompletionList.create(
                [
                    {
                        label: 'TypeScript',
                        kind: CompletionItemKind.Text,
                        data: 1
                    },
                    {
                        label: 'JavaScript',
                        kind: CompletionItemKind.Text,
                        data: 2
                    }
                ], false);

            const currentCompletions: CompletionList = await this.yamlLanguageService.doComplete(
                textDocument,
                position
            );


            return CompletionList.create(currentCompletions.items, false);
        }
        catch (e) {
            console.error("Error generating completion list");
            console.error(e);
            return Promise.resolve(result);
        }
    }

    public onHover = async (
        document: TextDocument,
        position: Position
    ): Promise<Hover | null> => {
        if (!document) {
            return null;
        }

        return this.yamlLanguageService.doHover(document, position);
    }
}
