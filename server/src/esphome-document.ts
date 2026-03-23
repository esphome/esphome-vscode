import {
  Parser,
  Composer,
  LineCounter,
  ParseOptions,
  Document,
  DocumentOptions,
  SchemaOptions,
  Node,
  visit,
  isNode,
  isDocument,
  isPair,
  isSeq,
  isScalar,
  isMap,
  YAMLMap,
  YAMLSeq,
} from "yaml";
import { Range } from "yaml/dist/nodes/Node";
import {
  Component,
  ConfigVar,
  ConfigVarId,
  ESPHomeSchema,
  Schema,
} from "./esphome-schema";
import { isNumber, isString } from "./utils/objects";
import { TextBuffer } from "./utils/text-buffer";

class CommonTagImpl {
  tag: string;
  readonly type: string;
  default: boolean = false;
  constructor(tag: string, type: string) {
    this.tag = tag;
    this.type = type;
  }
  get collection() {
    return undefined;
  }

  identify(_value: unknown) {
    return true;
  }
  resolve(value: string | YAMLMap | YAMLSeq): string | YAMLMap | YAMLSeq {
    return value;
  }
}

/**
 * Represents a single ESPHome YAML file with its parsed content.
 * The schema is injected so it can be shared across documents.
 *
 * Scope distinction:
 * - "local" scope: only this file's YAML (e.g. for deduplicating root keys,
 *    since YAML does not allow duplicate keys in the same file)
 * - "merged" scope: this file + all included files (e.g. for ID lookups,
 *    since ESPHome merges all dicts from included files at runtime)
 */
export class ESPHomeDocument {
  public yaml: Document;
  public bufferText?: string;

  /** Documents loaded from !include / packages references */
  private includedDocuments: ESPHomeDocument[] = [];

  constructor(
    public text: TextBuffer,
    private schema: ESPHomeSchema,
    /** Absolute URI/path for resolving relative includes */
    public fileUri?: string,
  ) {
    this.bufferText = text.getText();
    this.yaml = this.parse(this.bufferText);
  }

  public update(buffer: TextBuffer) {
    this.text = buffer;
    const text = this.text.getText();
    if (this.bufferText === text) {
      return;
    }
    this.bufferText = text;
    this.yaml = this.parse(this.bufferText);
    // Invalidate includes so they get re-resolved on next access
    this.includedDocuments = [];
  }

  private parse(text: string) {
    const options: ParseOptions & DocumentOptions & SchemaOptions = {
      strict: false,
      version: "1.2",
      customTags: [
        new CommonTagImpl("!secret", "scalar"),
        new CommonTagImpl("!include", "scalar"),
        new CommonTagImpl("!lambda", "scalar"),
      ],
    };
    const composer = new Composer(options);
    const lineCounter = new LineCounter();
    let isLastLineEmpty = false;

    const parser = isLastLineEmpty
      ? new Parser()
      : new Parser(lineCounter.addNewLine);

    const tokens = parser.parse(text);
    const tokensArr = Array.from(tokens);
    const docs = composer.compose(tokensArr, true, text.length);
    return Array.from(docs)[0];
  }

  // ─── YAML Navigation ──────────────────────────────────────────────────────

  public getParent(nodeToFind: Node): Node | undefined {
    let parentNode: Node | undefined = undefined;
    visit(this.yaml, (_, node, path) => {
      if (node === nodeToFind) {
        parentNode = path[path.length - 1] as Node;
        return visit.BREAK;
      }
      return;
    });

    if (isDocument(parentNode)) {
      return;
    }

    return parentNode;
  }

  public getPath(node: Node): (number | string)[] {
    const path: (number | string)[] = [];
    let child: Node | undefined = undefined;
    let findingNode: Node | undefined = node;
    while (findingNode) {
      if (isPair(findingNode)) {
        if (isScalar(findingNode.key)) {
          path.push(findingNode.key.value as string);
        }
      }
      if (isSeq(findingNode) && child !== undefined) {
        path.push(findingNode.items.indexOf(child));
      }
      child = findingNode;
      findingNode = this.getParent(findingNode);
    }
    return path.reverse();
  }

  public getNodeFromOffset(offset: number): Node | undefined {
    let closestNode: Node | undefined = undefined;
    let scalarAfterOffset = false;
    visit(this.yaml, (_key, node) => {
      if (!node || !isNode(node)) {
        return;
      }
      const range = node.range;
      if (!range) {
        return;
      }

      // tagged node e.g. !secret at the beginning have tag property
      // but the range does not include this tag space
      const startPos = node.tag ? range[0] - node.tag.length - 1 : range[0];
      if (
        (startPos <= offset && range[2] >= offset) ||
        // handle edge case of null node values
        (isScalar(node) &&
          node.value === null &&
          startPos > offset &&
          range[1] > offset &&
          !isScalar(closestNode) &&
          !scalarAfterOffset)
      ) {
        closestNode = node;
      } else {
        if (isScalar(node) && startPos > offset && range[1] > offset) {
          scalarAfterOffset = true;
        }
        return visit.SKIP;
      }
      return;
    });

    return closestNode!;
  }

  // ─── Schema + Document traversal ──────────────────────────────────────────

  /**
   * Walk the path through YAML and schema simultaneously, returning the
   * ConfigVar and YAML node at the end of the path.
   */
  public async getConfigVarAndPathNode(
    path: (string | number)[],
  ): Promise<[ConfigVar, Node] | undefined> {
    let pathNode = this.yaml.contents;
    let cv: ConfigVar | undefined = undefined;
    for (let index = 0; index < path.length; index++) {
      if (isString(path[index]) && isMap(pathNode)) {
        if (cv === undefined && index <= 2 && pathNode.get("platform")) {
          const componentName = pathNode.get("platform");
          if (isString(componentName)) {
            const platformComponents = await this.schema.getPlatformList();
            if (isString(path[0]) && path[0] in platformComponents) {
              const c = await this.schema.getComponent(path[0]);
              if (c.components !== undefined && componentName in c.components) {
                cv = await this.schema.getComponentPlatformSchema(
                  componentName,
                  path[0],
                );
              }
            }
          }
        }

        pathNode = pathNode.get(path[index], true) as Node;
        if (cv === undefined) {
          const rootComponents = await this.schema.getComponentList();
          if (isString(path[0]) && path[0] in rootComponents) {
            cv = (await this.schema.getComponent(path[0])).schemas
              .CONFIG_SCHEMA;
          }
        } else {
          const pathIndex = path[index];
          if (isString(pathIndex)) {
            if (cv.type === "schema" || cv.type === "trigger") {
              if (cv.schema !== undefined) {
                const schema_cv = await this.findConfigVar(
                  cv.schema,
                  pathIndex,
                );
                if (schema_cv !== undefined) {
                  cv = schema_cv;
                  continue;
                }
              }

              if (cv.type === "trigger") {
                if (pathIndex === "then") {
                  continue;
                }
                const action = await this.schema.getActionConfigVar(pathIndex);
                if (action !== undefined) {
                  cv = action;
                  continue;
                }
              }
            }
            if (cv.type === "registry") {
              cv = await this.schema.getRegistryConfigVar(
                cv.registry,
                pathIndex,
              );
            }
          }
        }
      } else if (isNumber(path[index]) && isSeq(pathNode)) {
        pathNode = pathNode.get(path[index], true) as Node;
      }
    }
    if (!cv || !pathNode) {
      return undefined;
    }
    return [cv, pathNode];
  }

  // ─── Schema delegation (with local document context) ──────────────────────

  /**
   * Iterate config vars for a schema using this document's local YAML for
   * context-aware filtering (e.g. MQTT props hidden when mqtt not present).
   * Use this for completions that operate on the current file.
   */
  async *iterConfigVars(
    schema: Schema,
    yielded: string[] = [],
  ): AsyncGenerator<[string, ConfigVar]> {
    yield* this.schema.iterConfigVars(
      schema,
      this.yaml.contents as YAMLMap,
      yielded,
    );
  }

  /**
   * Find a config var by name within a schema, using local document context.
   */
  async findConfigVar(
    schema: Schema,
    prop: string,
  ): Promise<ConfigVar | undefined> {
    return this.schema.findConfigVar(
      schema,
      prop,
      this.yaml.contents as YAMLMap,
    );
  }

  // ─── Document-aware component iteration ───────────────────────────────────

  /**
   * Iterate components used in a single YAML document, contributing results
   * into the shared `yieldedComponents` / `addPollingComponent` state so that
   * callers can merge multiple documents without duplicates.
   */
  private async *iterSingleYamlComponents(
    docYaml: Document,
    yieldedComponents: string[],
    pollingRef: { value: boolean },
  ): AsyncGenerator<[string, Component, Node?]> {
    const docMap = docYaml.contents as YAMLMap;
    if (!docMap?.items) return;

    for (const k of docMap.items) {
      if (isPair(k) && isScalar(k.key)) {
        const componentName = k.key.value as string;
        const isPlatformComponent = await this.schema.isPlatform(componentName);
        if (
          !isPlatformComponent &&
          !(componentName in (await this.schema.getSchema()).core.components)
        ) {
          continue;
        }
        const component = await this.schema.getComponent(componentName);
        if (!yieldedComponents.includes(componentName)) {
          yield [componentName, component, k.value as Node];
          yieldedComponents.push(componentName);
        }

        if (isPlatformComponent) {
          const platList = docMap.get(componentName);
          if (isSeq(platList)) {
            for (const plat of platList.items) {
              if (isMap(plat)) {
                const platCompName = plat.get("platform") as string;
                if (platCompName in component.components) {
                  const platComponent = await this.schema.getComponent(
                    platCompName,
                    componentName,
                  );
                  if (!pollingRef.value) {
                    if (
                      platComponent.schemas.CONFIG_SCHEMA?.schema?.config_vars.id?.id_type?.parents?.includes(
                        "PollingComponent",
                      )
                    ) {
                      pollingRef.value = true;
                    }
                  }
                  const platKey = `${componentName}.${platCompName}`;
                  if (!yieldedComponents.includes(platKey)) {
                    // Yield the platform-specific component with platform set for
                    // correct action naming (e.g. sensor.template.publish)
                    yield [
                      platCompName,
                      { ...platComponent, platform: componentName },
                      plat,
                    ];
                    yieldedComponents.push(platKey);
                  }

                  // Also yield the base component (e.g. "pzemac" without platform)
                  // so its component-level actions are named pzemac.reset_energy
                  if (!yieldedComponents.includes(platCompName)) {
                    const baseComponent =
                      await this.schema.getComponent(platCompName);
                    if (baseComponent) {
                      yield [platCompName, baseComponent, plat];
                    }
                    yieldedComponents.push(platCompName);
                  }
                }
              }
            }
          }
        } else {
          if (
            !pollingRef.value &&
            component.schemas.CONFIG_SCHEMA?.schema?.config_vars.id?.id_type?.parents?.includes(
              "PollingComponent",
            )
          ) {
            pollingRef.value = true;
          }
          if (
            componentName === "api" &&
            !yieldedComponents.includes("homeassistant")
          ) {
            yield [
              "homeassistant",
              await this.schema.getComponent("homeassistant"),
              k.value as Node,
            ];
            yieldedComponents.push("homeassistant");
          }
        }
      }
    }
  }

  /**
   * Iterate all components actively used across this file AND all included
   * files (merged scope). Deduplicates by component name so each component is
   * yielded only once even if it appears in multiple files.
   *
   * Used for:
   *   - determining available action/condition/filter registries
   *   - detecting PollingComponent for component.update
   */
  async *getDocComponents(): AsyncGenerator<[string, Component, Node?]> {
    const yieldedComponents: string[] = [];
    const pollingRef = { value: false };

    for (const doc of this.getAllDocuments()) {
      yield* doc.iterSingleYamlComponents(
        doc.yaml,
        yieldedComponents,
        pollingRef,
      );
    }

    if (pollingRef.value) {
      yield [
        "component",
        await this.schema.getComponent("component"),
        undefined,
      ];
    }
    yield ["core", (await this.schema.getSchema()).core, undefined];
  }

  /**
   * Iterate registry entries available in this document (merged scope).
   *
   * - For domain-specific registries (e.g. "sensor.filter"): pure schema lookup.
   * - For global registries (e.g. "action", "condition"): uses getDocComponents()
   *   which already covers this file and all included files.
   */
  async *getRegistry(registry: string): AsyncGenerator<[string, ConfigVar]> {
    if (registry.includes(".")) {
      // domain.registryName format — pure schema, no doc context needed
      yield* this.schema.getDomainRegistry(registry);
    } else {
      if (this.schema.isRegistry(registry)) {
        for await (const [
          componentName,
          component,
        ] of this.getDocComponents()) {
          const componentRegistry = component
            ? (component as any)[registry]
            : undefined;
          if (componentRegistry !== undefined) {
            for (const name in componentRegistry) {
              if (componentName === "core") {
                yield [name, componentRegistry[name]];
              } else if (component.platform) {
                // Platform-specific action: e.g. sensor.template.publish
                yield [
                  `${component.platform}.${componentName}.${name}`,
                  componentRegistry[name],
                ];
              } else {
                // Base component action: e.g. pzemac.reset_energy
                yield [`${componentName}.${name}`, componentRegistry[name]];
              }
            }
          }
        }
      }
    }
  }

  // ─── ID declaration traversal (merged scope) ──────────────────────────────

  private async *iterDeclaringIdsInner(
    idType: string,
    map: YAMLMap,
    declaringCv: ConfigVar,
    localYaml: Document,
  ): AsyncGenerator<Node> {
    let schema: Schema;
    if (declaringCv.type === "schema") {
      schema = declaringCv.schema;
    } else if (declaringCv.type === "typed") {
      const schemaType = map.get(declaringCv.typed_key) as string;
      schema =
        schemaType in declaringCv.types
          ? declaringCv.types[schemaType]
          : declaringCv.types[Object.keys(declaringCv.types)[0]];
    } else {
      return;
    }
    for (const k of map.items) {
      if (isPair(k) && isScalar(k.key)) {
        const propName = k.key.value as string;
        const cv = await this.schema.findConfigVar(
          schema,
          propName,
          localYaml.contents as YAMLMap,
        );
        if (cv) {
          const idCv = cv as any as ConfigVarId;
          if (
            idCv.id_type &&
            (idCv.id_type.class === idType ||
              idCv.id_type.parents?.includes(idType))
          ) {
            yield k.value as Node;
          }
          if (isMap(k.value)) {
            for await (const yieldNode of this.iterDeclaringIdsInner(
              idType,
              k.value,
              cv,
              localYaml,
            )) {
              yield yieldNode;
            }
          } else if (cv.is_list && isSeq(k.value)) {
            for (const seqItem of k.value.items) {
              if (isMap(seqItem)) {
                for await (const yieldNode of this.iterDeclaringIdsInner(
                  idType,
                  seqItem,
                  cv,
                  localYaml,
                )) {
                  yield yieldNode;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Iterate all YAML nodes that declare an ID matching `idType` in a single
   * parsed YAML document.
   */
  private async *iterDeclaringIdsInDoc(
    idType: string,
    doc: Document,
  ): AsyncGenerator<Node> {
    const docMap = doc.contents as YAMLMap;
    for (const k of docMap.items) {
      if (isPair(k) && isScalar(k.key)) {
        const componentName = k.key.value as string;
        if (
          componentName in (await this.schema.getSchema()).core.components ||
          (await this.schema.isPlatform(componentName))
        ) {
          const component = await this.schema.getComponent(componentName);
          const cv = component.schemas.CONFIG_SCHEMA;
          if (isMap(k.value) && cv) {
            for await (const yieldNode of this.iterDeclaringIdsInner(
              idType,
              k.value,
              cv,
              doc,
            )) {
              yield yieldNode;
            }
          } else if (isSeq(k.value) && cv && cv.is_list) {
            const nodeList = k.value;
            for (const item of nodeList.items) {
              if (isMap(item) && isScalar(item.get("id", true)) && cv) {
                for await (const yieldNode of this.iterDeclaringIdsInner(
                  idType,
                  item,
                  cv,
                  doc,
                )) {
                  yield yieldNode;
                }
              }
            }
          }
          if (await this.schema.isPlatform(componentName)) {
            // iterate elements and lookup platform to load components
            const platNode = k.value;
            if (isSeq(platNode)) {
              for (const seqItemNode of platNode.items) {
                if (isMap(seqItemNode)) {
                  const platCompName = seqItemNode.get("platform") as string;
                  if (platCompName in component.components) {
                    const platComponent = await this.schema.getComponent(
                      platCompName,
                      componentName,
                    );
                    const platCv = platComponent.schemas.CONFIG_SCHEMA;
                    if (platCv !== undefined)
                      for await (const yieldNode of this.iterDeclaringIdsInner(
                        idType,
                        seqItemNode,
                        platCv,
                        doc,
                      )) {
                        yield yieldNode;
                      }
                  }
                }
              }
            } else if (isMap(platNode)) {
              const platCompName = platNode.get("platform") as string;
              if (platCompName in component.components) {
                const platComponent = await this.schema.getComponent(
                  platCompName,
                  componentName,
                );
                const platCv = platComponent.schemas.CONFIG_SCHEMA;
                for await (const yieldNode of this.iterDeclaringIdsInner(
                  idType,
                  platNode,
                  platCv,
                  doc,
                )) {
                  yield yieldNode;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Iterate all nodes declaring an ID of `idType` across this file AND all
   * included files (merged scope).
   */
  async *iterDeclaringIds(idType: string): AsyncGenerator<Node> {
    for (const doc of this.getAllDocuments()) {
      yield* doc.iterDeclaringIdsInDoc(idType, doc.yaml);
    }
  }

  /**
   * Get all usable IDs of a given type across this document and its includes.
   * Use this for `use_id` completions — needs merged scope.
   */
  async getUsableIds(use_id_type: string): Promise<string[]> {
    const ret: string[] = [];
    for await (const item of this.iterDeclaringIds(use_id_type)) {
      ret.push(item.toString());
    }
    return ret;
  }

  /**
   * Find the YAML range of an ID declaration across this document and its
   * includes. Use this for goto-definition.
   */
  async findComponentDefinition(
    id_type: string,
    id: string,
  ): Promise<Range | null | undefined> {
    for await (const item of this.iterDeclaringIds(id_type)) {
      if (isScalar(item) && item.value === id) {
        return item.range;
      }
    }
    return null;
  }

  // ─── Include support ───────────────────────────────────────────────────────

  /**
   * Returns all documents in the merged set: this document first, then any
   * loaded included documents.
   */
  getAllDocuments(): ESPHomeDocument[] {
    return [this, ...this.includedDocuments];
  }

  /**
   * Extract relative file paths referenced by !include tags and the packages:
   * section in this document's YAML.
   */
  getIncludeUris(): string[] {
    const seen = new Set<string>();
    const add = (path: string) => {
      if (!seen.has(path)) seen.add(path);
    };
    if (!this.yaml?.contents) return [];

    visit(this.yaml, (_key, node) => {
      // !include scalar: value is the relative path
      if (isScalar(node) && node.tag === "!include" && isString(node.value)) {
        add(node.value as string);
        return;
      }
      // !include map: { file: <path>, ... }
      if (isMap(node) && node.tag === "!include") {
        const fileVal = node.get("file");
        if (isString(fileVal)) add(fileVal);
        return;
      }
    });

    // packages: <name>: file: <path>  (dict-format packages without url)
    const docMap = this.yaml.contents as YAMLMap;
    const packagesNode = docMap?.get("packages", true);
    if (isMap(packagesNode)) {
      for (const pair of packagesNode.items) {
        if (isPair(pair) && isMap(pair.value)) {
          const fileVal = (pair.value as YAMLMap).get("file");
          if (isString(fileVal)) add(fileVal);
        }
      }
    }

    return [...seen];
  }

  /**
   * Load included files using the provided loader and attach them to this
   * document. Called by ESPHomeDocuments when a document is updated.
   *
   * Included documents share the same schema instance.
   */
  async loadIncludes(
    loader: (
      relativePath: string,
      baseUri: string,
    ) => Promise<string | undefined>,
  ): Promise<void> {
    if (!this.fileUri) return;
    const includeUris = this.getIncludeUris();
    this.includedDocuments = [];

    for (const relativePath of includeUris) {
      try {
        const content = await loader(relativePath, this.fileUri);
        if (content !== undefined) {
          const buffer = new TextBuffer({ getText: () => content } as any);
          const includedDoc = new ESPHomeDocument(buffer, this.schema);
          this.includedDocuments.push(includedDoc);
        }
      } catch {
        // Skip files that can't be loaded
      }
    }
  }
}

export class ESPHomeDocuments {
  private documents: { [uri: string]: ESPHomeDocument } = {};

  private fileLoader?: (
    relativePath: string,
    baseUri: string,
  ) => Promise<string | undefined>;

  constructor(private schema: ESPHomeSchema) {}

  setFileLoader(
    loader: (
      relativePath: string,
      baseUri: string,
    ) => Promise<string | undefined>,
  ) {
    this.fileLoader = loader;
  }

  async update(uri: string, buffer: TextBuffer): Promise<void> {
    const doc = this.documents[uri];
    if (doc === undefined) {
      this.documents[uri] = new ESPHomeDocument(buffer, this.schema, uri);
    } else {
      doc.update(buffer);
    }
    if (this.fileLoader) {
      await this.documents[uri].loadIncludes(this.fileLoader);
    }
  }

  public getDocument(uri: string): ESPHomeDocument {
    return this.documents[uri];
  }
}
