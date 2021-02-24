import * as path from "path";
import * as fs from "fs";
import {
    getLanguageService,
    LanguageService,
    LanguageSettings,
} from "yaml-language-server";
import { CompletionItem, CompletionList, Hover, Position, TextDocument } from "vscode-languageserver";

export class HoverCompletion {

    yamlLanguageService: LanguageService;

    constructor() {

        this.yamlLanguageService = getLanguageService(
            // eslint-disable-next-line @typescript-eslint/require-await
            async () => "", null!);

        const jsonPath = path.join(__dirname, "schema.json");
        const filecontents = fs.readFileSync(jsonPath, "utf-8");
        const schema = JSON.parse(filecontents);

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
