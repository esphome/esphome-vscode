import * as path from "path";
import * as fs from "fs";
import {
    getLanguageService,
    LanguageService,
    LanguageSettings,
} from "yaml-language-server";
import { CompletionList, Connection, Hover, Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export class HoverCompletion {

    yamlLanguageService: LanguageService;

    constructor(connection: Connection) {
        this.yamlLanguageService = getLanguageService(
            // eslint-disable-next-line @typescript-eslint/require-await
            async () => "", null!, connection);

        const jsonPath = path.join(__dirname, "schema.json");
        const fileContents = fs.readFileSync(jsonPath, "utf-8");
        const schema = JSON.parse(fileContents);

        try {
            this.yamlLanguageService.configure(<LanguageSettings>{
                validate: false,
                isKubernetes: false,
                completion: true,
                format: true,
                hover: true,
                schemas: [{ uri: 'http://esphome.io/esphome/schema', fileMatch: ["*.yaml"], schema: schema }],
                customTags: [
                    "!secret scalar",
                    "!lambda scalar",
                    "!include scalar"
                ]
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

            const currentCompletions: CompletionList = await this.yamlLanguageService.doComplete(
                textDocument,
                position,
                false
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
