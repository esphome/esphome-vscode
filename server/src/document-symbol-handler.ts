import { DocumentSymbol, SymbolKind, Range } from "vscode-languageserver-types";
import { ESPHomeDocument, ESPHomeDocuments } from "./esphome-document";
import { isMap, isScalar, Node, Pair, Range as YamlRange } from "yaml";

/**
 * Handles the extraction and parsing of {@linkcode DocumentSymbol}s from {@linkcode ESPHomeDocument}s
 * such that they can be used for ***navigation***, ***outline view*** and ***symbol search***. Parses the
 * hierarchical yaml content and converts it into LSP-compliant {@linkcode DocumentSymbol}s.
 */
export class DocumentSymbolHandler {

    constructor(private documents: ESPHomeDocuments) { }

    /**
     * Retrieves {@link DocumentSymbol document symbols} for the given document URI
     * 
     * Parses and extracts all symbols (such as sections, keys, and their hierarchical relationships)
     * that can be displayed in the ***document outline*** or ***symbol navigator***.
     * 
     * @param uri - The document URI to extract symbols from
     * @returns An array of {@linkcode DocumentSymbol} objects
     *          representing the structure of the document.
     *          Returns an empty array if the document is _not found_, has _no yaml content_,
     *          or if an _error occurs during parsing_.
     */
    public getDocumentSymbols(uri: string): DocumentSymbol[] {
        try {

            const doc = this.documents.getDocument(uri);
            if (!doc || !doc.yaml || !doc.yaml.contents) {
                return [];
            }
            return this.parseNode(doc, doc.yaml.contents);

        } catch (error) {
            console.error("DocumentSymbol: " + error);
        }

        return [];
    }

    /**
     * Parses a yaml node and extracts {@link DocumentSymbol document symbols} from its key-value pairs.
     * @param doc - The {@linkcode ESPHomeDocument} being processed
     * @param node - The yaml node to parse
     * @returns An array of {@linkcode DocumentSymbol} extracted from the node
     */
    private parseNode(doc: ESPHomeDocument, node: Node): DocumentSymbol[] {
        const symbols: DocumentSymbol[] = [];

        if (isMap(node)) {
            for (const item of node.items) {
                const symbol = this.createSymbol(doc, item);
                if (symbol) {
                    symbols.push(symbol);
                }
            }
        }

        return symbols;
    }

    /**
     * Creates a document symbol from a yaml key-value pair.
     * @param doc - The {@linkcode ESPHomeDocument} to determine the {@linkcode Range}
     * @param pair - The yaml key-value {@linkcode Pair} to parse into a {@linkcode DocumentSymbol}
     * @returns A {@linkcode DocumentSymbol} object representing the pair, or `null` if the pair key is not a scalar value
     */
    private createSymbol(doc: ESPHomeDocument, pair: Pair): DocumentSymbol | null {
        if (!isScalar(pair.key)) {
            return null;
        }

        const { key } = pair;

        const name = key.value as string;
        const keyRange = this.getRange(doc, key as Node);

        let fullRange = keyRange;
        let children: DocumentSymbol[] = [];
        let kind = SymbolKind.Property;
        let detail = "";

        return {
            name,
            kind,
            detail,
            range: fullRange,
            selectionRange: keyRange,
            children,
        }

    }

    // HELPER FUNCTIONS

    /**
     * Converts a yaml node's {@linkcode YamlRange Range} to a LSP {@linkcode Range} object.
     * @param doc - The {@linkcode ESPHomeDocument} containing {@linkcode Position} information.
     * @param node - The yaml {@linkcode Node} in question
     * @returns A {@linkcode Range} object with {@linkcode Range.start start} and {@linkcode Range.end end} positions.
     *          Returns a zero-length range at the beginning of the document if the node has no range information.
     */
    private getRange(doc: ESPHomeDocument, node: Node): Range {
        if (!node.range) {
            return {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
            }
        }
        return {
            start: doc.text.getPosition(node.range[0]),
            end: doc.text.getPosition(node.range[1])
        }
    }
}
