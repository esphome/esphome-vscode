import { YAMLMap } from "yaml";

export interface SchemaSet {
  [name: string]: Component;
  core: CoreComponent;
}

interface ConfigVarBase {
  key: string;
  is_list?: boolean;
  docs?: string;
  maybe?: string;
  templatable?: boolean;
}

export interface ConfigVarRegistry extends ConfigVarBase {
  type: "registry";
  registry: ComponentRegistry;
  filter?: string[];
}

export interface ConfigVarTrigger extends ConfigVarBase {
  type: "trigger";
  schema: Schema | undefined;
  has_required_var: Boolean;
}

export interface ConfigVarEnum extends ConfigVarBase {
  type: "enum";
  values: { [key: string]: { docs: string } | null };
  default?: string;
}

export interface ConfigVarSchema extends ConfigVarBase {
  type: "schema";
  schema: Schema;
  maybe?: string;
}

export interface ConfigVarTyped extends ConfigVarBase {
  type: "typed";
  typed_key: string;
  types: {
    [name: string]: Schema;
  };
}
export interface ConfigVarPin extends ConfigVarBase {
  type: "pin";
  schema: Boolean;
  internal: Boolean;
  modes: ("output" | "input" | "pullup")[];
}
interface ConfigVarBoolean extends ConfigVarBase {
  type: "boolean";
  default: string;
}
interface ConfigVarString extends ConfigVarBase {
  type: "string" | "integer";
  default?: string;
}
export interface ConfigVarUseId extends ConfigVarBase {
  type: "use_id";
  use_id_type: string;
}

export interface ConfigVarId {
  id_type: {
    class: string;
    parents: string[];
  };
}

export type ConfigVar =
  | ConfigVarSchema
  | ConfigVarRegistry
  | ConfigVarEnum
  | ConfigVarTrigger
  | ConfigVarTyped
  | ConfigVarPin
  | ConfigVarBoolean
  | ConfigVarString
  | ConfigVarUseId;

interface ConfigVars {
  [name: string]: ConfigVar | undefined;
  id?: ConfigVar & ConfigVarId;
}

export interface Schema {
  config_vars: ConfigVars;
  extends: string[];
}

export interface Registry {
  [name: string]: ConfigVar;
}

export type ComponentRegistry = "action" | "condition" | "filter" | "effects";

export interface Component {
  schemas: {
    [name: string]: ConfigVar;
    CONFIG_SCHEMA: ConfigVarSchema;
  };
  // These are the components e.g. of sensor, binary_sensor
  components: { [name: string]: { docs?: string } };

  action: Registry;
  condition: Registry;
  filter: Registry;
  effects: Registry;
  pin?: ConfigVar;
  /**
   * Set when this component is loaded as a platform-specific entry
   * (e.g. template loaded as sensor platform → platform = "sensor").
   * Used to build the correct action name: sensor.template.publish.
   */
  platform?: string;
}
interface CoreComponent extends Component {
  platforms: { [name: string]: { docs?: string } };
  components: { [name: string]: { docs?: string; dependencies?: string[] } };
  pins: string[];
}

export class ESPHomeSchema {
  schema: SchemaSet | undefined;
  loaded_schemas: string[] = ["core", "esphome"];

  constructor(private schemaLoader: (schemaName: string) => Promise<any>) {}

  async getSchema(): Promise<SchemaSet> {
    if (this.schema) {
      return this.schema;
    }
    this.schema = await this.schemaLoader("esphome");
    return this.schema!;
  }

  async getPlatformList() {
    return (await this.getSchema()).core.platforms;
  }
  async getComponentList() {
    return (await this.getSchema()).core.components;
  }

  async getComponent(
    domain: string,
    platform: string | null = null,
  ): Promise<Component> {
    if (!this.loaded_schemas.includes(domain)) {
      this.schema = {
        ...this.schema,
        ...(await this.schemaLoader(domain)),
      };
      this.loaded_schemas.push(domain);
    }
    if (platform !== null) {
      return (await this.getSchema())[`${domain}.${platform}`];
    }
    return (await this.getSchema())[domain];
  }

  async getComponentSchema(domain: string): Promise<ConfigVar> {
    const component = await this.getComponent(domain);
    return component.schemas.CONFIG_SCHEMA;
  }
  async getComponentPlatformSchema(
    domain: string,
    platform: string,
  ): Promise<ConfigVar> {
    const component = await this.getComponent(domain, platform);
    return component.schemas.CONFIG_SCHEMA;
  }

  async getExtendedConfigVar(name: string): Promise<ConfigVar> {
    const parts = name.split(".");
    if (parts.length === 3) {
      const c = await this.getComponent(parts[0], parts[1]);
      return c.schemas[parts[2]];
    }
    const c = await this.getComponent(parts[0]);
    return c.schemas[parts[1]];
  }

  async isPlatform(name: string): Promise<boolean> {
    return name in (await this.getSchema()).core.platforms;
  }

  /**
   * Iterate config vars for a schema. Accepts an optional YAMLMap from the
   * current document to enable context-aware filtering (e.g. MQTT props).
   */
  async *iterConfigVars(
    schema: Schema,
    docMap?: YAMLMap,
    yielded: string[] = [],
  ): AsyncGenerator<[string, ConfigVar]> {
    for (var prop in schema.config_vars) {
      if (
        schema.extends?.includes("core.MQTT_COMPONENT_SCHEMA") &&
        (prop === "mqtt_id" || prop === "expire_after") &&
        docMap?.get("mqtt") === undefined
      ) {
        // filter mqtt props if mqtt is not used
        continue;
      }
      if (yielded.includes(prop)) {
        continue;
      }
      yielded.push(prop);
      yield [prop, await this.getConfigVarComplete(schema, prop)];
    }
    if (schema.extends !== undefined) {
      for (var extended of schema.extends) {
        if (
          extended.startsWith("core.MQTT") &&
          docMap?.get("mqtt") === undefined
        ) {
          continue;
        }
        const s = await this.getExtendedConfigVar(extended);
        if (s.type === "schema") {
          for await (const pair of this.iterConfigVars(
            s.schema,
            docMap,
            yielded,
          )) {
            yield pair;
          }
        } else if (s.type === "typed") {
          yield [s.typed_key, s];
        }
      }
    }
  }

  async findConfigVar(
    schema: Schema,
    prop: string,
    docMap?: YAMLMap,
  ): Promise<ConfigVar | undefined> {
    for await (const [p, config] of this.iterConfigVars(schema, docMap)) {
      if (p === prop) {
        return config;
      }
    }
    return undefined;
  }

  async getConfigVarComplete(schema: Schema, key: string): Promise<ConfigVar> {
    var cv = { ...schema.config_vars[key] } as ConfigVar;

    const appendCvs = async (s: Schema, c: ConfigVar) => {
      if (s.extends !== undefined) {
        for (const extended of s.extends) {
          const s_cv = await this.getExtendedConfigVar(extended);
          if (s_cv.type === "schema") {
            if (
              s_cv.schema.config_vars !== undefined &&
              key in s_cv.schema.config_vars
            ) {
              c = {
                ...s_cv.schema.config_vars[key],
                ...c,
              };
            }
            c = await appendCvs(s_cv.schema, c);
          }
        }
      }
      return c;
    };
    cv = await appendCvs(schema, cv);
    return await this.getConfigVarComplete2(cv);
  }

  async getConfigVarComplete2(cv: ConfigVar): Promise<ConfigVar> {
    if (cv.type !== "schema" || cv.schema.extends === undefined) {
      return cv;
    }

    let mergedConfigVars = { ...cv.schema.config_vars };
    let maybe = cv.maybe;

    for (const extended of cv.schema.extends) {
      const s_cv = await this.getExtendedConfigVar(extended);
      if (s_cv.type === "schema") {
        const completedExtended = await this.getConfigVarComplete2(s_cv);
        if (completedExtended.type === "schema") {
          mergedConfigVars = {
            ...completedExtended.schema.config_vars,
            ...mergedConfigVars,
          };
          if (maybe === undefined) {
            maybe = completedExtended.maybe;
          }
        }
      }
    }

    return {
      ...cv,
      maybe,
      schema: {
        config_vars: mergedConfigVars,
        extends: [],
      },
    };
  }

  /**
   * Iterate a domain-specific registry (registry must contain ".").
   * E.g. "sensor.filter" yields all sensor filters.
   */
  async *getDomainRegistry(
    domainRegistry: string,
  ): AsyncGenerator<[string, ConfigVar]> {
    const [domain, registryName] = domainRegistry.split(".");
    if (this.isRegistry(registryName)) {
      const schemaSet = await this.getSchema();
      const domainData = schemaSet[domain];
      if (domainData && domainData[registryName]) {
        for (const name in domainData[registryName]) {
          yield [name, domainData[registryName][name]];
        }
      }
    }
  }

  async getRegistryConfigVar(
    registry: string,
    entry: string,
  ): Promise<ConfigVar | undefined> {
    if (registry.includes(".")) {
      const [domain, registryName] = registry.split(".");
      if (this.isRegistry(registryName))
        return (await this.getComponent(domain))[registryName][entry];
    } else {
      if (this.isRegistry(registry)) {
        if (entry.includes(".")) {
          const parts = entry.split(".");
          if (parts.length === 3) {
            const [domain, platform, actionName] = parts;
            return (await this.getComponent(platform, domain))[registry][
              actionName
            ];
          } else {
            const [domain, actionName] = parts;
            return (await this.getComponent(domain))[registry][actionName];
          }
        }
        if (
          this.schema?.core[registry] !== undefined &&
          this.schema?.core[registry][entry] !== undefined
        ) {
          return this.schema?.core[registry][entry];
        }
      }
    }
    return undefined;
  }

  isRegistry(name: string): name is ComponentRegistry {
    return (
      name === "filter" ||
      name === "effects" ||
      name === "condition" ||
      name === "action"
    );
  }

  async getActionConfigVar(entry: string): Promise<ConfigVarTrigger> {
    return (await this.getRegistryConfigVar(
      "action",
      entry,
    )) as ConfigVarTrigger;
  }

  async getPinConfigVar(component: string): Promise<ConfigVar> {
    var c = await this.getComponent(component);
    if (!c.pin) throw new Error("Attempt to get pin from not pin component.");
    return c.pin;
  }

  async getPins(): Promise<string[]> {
    return (await this.getSchema()).core.pins;
  }
}
