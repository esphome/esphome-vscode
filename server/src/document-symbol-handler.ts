import { DocumentSymbol, SymbolKind, Range } from "vscode-languageserver-types";
import { ESPHomeDocument, ESPHomeDocuments } from "./esphome-document";
import { isMap, isScalar, isSeq, Node, Pair, YAMLSeq, Range as YamlRange } from "yaml";

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
     * Delegates the parsing logic to the appropriate function based on the node's type (`Map` or `Sequence`)
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
        } else if (isSeq(node)) {
            for (let index = 0; index < node.items.length; index++) {
                const symbol = this.createSequenceSymbol(doc, node, index);
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

        const keyNode = pair.key as Node;
        const valueNode = pair.value as Node;

        const name = pair.key.value as string;
        let kind: SymbolKind = SymbolKind.Field;
        let detail = "";
        let children: DocumentSymbol[] = [];

        const keyRange = this.getRange(doc, keyNode);
        let fullRange = keyRange; // Default to keyRange, but expand to include value if possible
        if (valueNode?.range) {
            fullRange = {
                start: keyRange.start,
                end: doc.text.getPosition(valueNode.range[1])
            }
        }

        if (isScalar(valueNode)) {
            detail = String(valueNode.value);
        } else {
            if (isMap(valueNode)) {
                kind = SymbolKind.Object;
            } else if (isSeq(valueNode)) {
                kind = SymbolKind.Array;
            }
            children = this.parseNode(doc, valueNode);
        }

        return {
            name,
            kind,
            detail,
            range: fullRange,
            selectionRange: keyRange,
            children,
        }

    }

    /**
     * Creates a {@link DocumentSymbol document symbol} for an item within a {@link YAMLSeq YAML sequence}.
     * @param doc - The {@linkcode ESPHomeDocument} being processed
     * @param node - The {@link YAMLSeq YAML sequence} node containing the item
     * @param index - The index of the item within the sequence
     * @returns A {@linkcode DocumentSymbol} representing the sequence item, or `null` if the item doesn't exist
     */
    private createSequenceSymbol(doc: ESPHomeDocument, node: YAMLSeq, index: number): DocumentSymbol | null {
        const item = node.items[index] as Node;
        if (!item) {
            return null;
        }

        let name = this.getIdentifier(item) ?? `[${index}]`;
        let kind: SymbolKind = SymbolKind.Field;
        const range = this.getRange(doc, item);
        let selectionRange = range;
        const detail = "";
        const children: DocumentSymbol[] = this.parseNode(doc, item);   // Recursively parse children, if any

        return { name, kind, detail, range, selectionRange, children };
    }

    // HELPER FUNCTIONS
    // ----------------

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

    /**
     * Extracts an identifier from a YAML node
     * 
     * - For scalar nodes, returns the string value of the node as is.
     * - For map nodes, searches for a pair with key `id`, `name`, or `platform`
     *   and returns the string value of that pair if found.
     * 
     * @param node - The YAML node to extract an identifier from
     * @returns The identifier as a string, or undefined if no identifier could be extracted
     */
    private getIdentifier(node: Node): string | undefined {
        if (isScalar(node)) {
            return String(node.value);
        } else if (isMap(node)) {
            const idPair = node.items.find(item => isScalar(item.key) && ['id', 'name', 'platform'].includes(item.key.value as string))
            if (idPair && isScalar(idPair.value)) {
                return String(idPair.value.value)
            }
        }
    }
}
