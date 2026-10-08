import type {
  Model,
  ModelProperty,
  Namespace,
  Program,
  Type,
} from "@typespec/compiler";
import { resolveEncodedName } from "@typespec/compiler";
import { reportDiagnostic } from "./lib.js";
import { modelProperties } from "./model.js";
import type { FieldOccurrence } from "./emitters/field-occurrences.js";
import type { UiNode } from "./emitters/block-ui.js";

/** How a property's TypeSpec name becomes its name in every emitted artifact. */
export type PropertyCasing = "preserve" | "snake";

/**
 * `firstName` to `first_name`.
 *
 * A word starts at each capital that follows a lowercase letter or a digit, and at the last
 * capital of a run that a lowercase letter follows, so an acronym is one word: `ombNumber`
 * and `OMBNumber` both become `omb_number`, and `HTTPServer` becomes `http_server`. Digits
 * stay with the word before them, so `street1` and `sf424Version` become `street1` and
 * `sf424_version`. A name that is already snake case is unchanged.
 */
export function snakeCase(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * The name a property is emitted under.
 *
 * `@encodedName("application/json", ...)` wins over the casing, so a name the rule
 * converts badly can be stated outright.
 */
export function jsonPropertyName(
  program: Program,
  property: ModelProperty,
  casing: PropertyCasing,
): string {
  const encoded = resolveEncodedName(program, property, "application/json");
  if (encoded !== property.name) return encoded;
  return casing === "snake" ? snakeCase(property.name) : property.name;
}

type Json = Record<string, any>;

/**
 * Renames properties in a finished artifact.
 *
 * The emitters build every artifact in TypeSpec names, which is also what an author writes in
 * a string path. This walks each artifact beside the type it describes and renames each
 * property name it meets, so the casing is applied once, after everything that resolves a
 * path has already run.
 */
export class Casing {
  private readonly named: Map<string, Type>;

  constructor(
    private readonly program: Program,
    private readonly casing: PropertyCasing,
  ) {
    this.named = indexNamedTypes(program.getGlobalNamespaceType());
  }

  /** A JSON Schema whose root describes `type`. */
  schema(node: unknown, type: Type | undefined): any {
    if (!isObject(node)) return node;
    const out: Json = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = this.keyword(key, value, type);
    }
    return out;
  }

  /** A JSON Forms layout whose scopes are relative to `model`. */
  ui(node: UiNode, model: Type): UiNode {
    const out: UiNode = { ...node };
    if (typeof node.scope === "string")
      out.scope = this.scope(node.scope, model);
    const condition = node.rule?.condition as Json | undefined;
    if (condition) {
      const scope = condition.scope;
      out.rule = {
        ...node.rule,
        condition: {
          ...condition,
          ...(typeof scope === "string"
            ? { scope: this.scope(scope, model) }
            : {}),
          // A root-scoped condition names its sources inside its schema.
          ...(scope === "#" && condition.schema !== undefined
            ? { schema: this.schema(condition.schema, model) }
            : {}),
        },
      };
    }
    const detail = node.options?.detail as UiNode | undefined;
    if (detail && typeof node.scope === "string") {
      const item = itemType(this.typeAtScope(node.scope, model));
      if (item)
        out.options = { ...node.options, detail: this.ui(detail, item) };
    }
    if (node.elements)
      out.elements = node.elements.map((child) => this.ui(child, model));
    return out;
  }

  /** A form's field occurrences, whose paths are JSON Pointers into `model`. */
  occurrences(entries: FieldOccurrence[], model: Model): FieldOccurrence[] {
    return entries
      .map((entry) => ({ ...entry, path: this.pointer(entry.path, model) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /** The name `key` is emitted under, where `key` names a property of `type`. */
  name(type: Type | undefined, key: string): string {
    const property = propertyOf(this.program, type, key);
    if (property) return jsonPropertyName(this.program, property, this.casing);
    // A schema the type graph cannot follow -- a union no variant of which has this
    // property -- still gets the casing, so no name is left in the authored convention.
    return this.casing === "snake" ? snakeCase(key) : key;
  }

  private keyword(key: string, value: unknown, type: Type | undefined): any {
    switch (key) {
      case "properties":
        if (!isObject(value)) return value;
        return Object.fromEntries(
          Object.entries(value).map(([name, schema]) => [
            this.name(type, name),
            this.schema(schema, propertyOf(this.program, type, name)?.type),
          ]),
        );
      case "required":
        return Array.isArray(value)
          ? value.map((name) =>
              typeof name === "string" ? this.name(type, name) : name,
            )
          : value;
      case "items":
      case "contains":
        return this.schema(value, itemType(type));
      case "additionalProperties":
        return this.schema(value, recordValueType(type));
      case "allOf":
      case "anyOf":
      case "oneOf":
        return Array.isArray(value)
          ? value.map((branch) => this.schema(branch, type))
          : value;
      case "if":
      case "then":
      case "else":
      case "not":
        return this.schema(value, type);
      case "$defs":
        if (!isObject(value)) return value;
        return Object.fromEntries(
          Object.entries(value).map(([name, schema]) => [
            name,
            this.schema(schema, this.named.get(name)),
          ]),
        );
      case "examples":
      case "enum":
        return Array.isArray(value)
          ? value.map((instance) => this.value(instance, type))
          : value;
      case "const":
      case "default":
        return this.value(value, type);
      default:
        // `$ref` targets keep their own casing, and an `x-` extension carries data rather
        // than property names.
        return value;
    }
  }

  /** An instance of `type`, such as an `@example` value. */
  private value(value: unknown, type: Type | undefined): unknown {
    if (Array.isArray(value)) {
      const item = itemType(type);
      return value.map((entry) => this.value(entry, item));
    }
    if (!isObject(value)) return value;
    const record = recordValueType(type);
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) =>
        record
          ? [key, this.value(entry, record)]
          : [
              this.name(type, key),
              this.value(entry, propertyOf(this.program, type, key)?.type),
            ],
      ),
    );
  }

  /** `#/properties/a/items/properties/b`, renamed step by step. */
  private scope(scope: string, model: Type): string {
    if (!scope.startsWith("#/")) return scope;
    const tokens = scope.slice(2).split("/");
    let type: Type | undefined = model;
    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index] === "items") {
        type = itemType(type);
      } else if (tokens[index] === "properties" && index + 1 < tokens.length) {
        const key = tokens[++index];
        tokens[index] = this.name(type, key);
        type = propertyOf(this.program, type, key)?.type;
      }
    }
    return `#/${tokens.join("/")}`;
  }

  private typeAtScope(scope: string, model: Type): Type | undefined {
    if (!scope.startsWith("#/")) return model;
    const tokens = scope.slice(2).split("/");
    let type: Type | undefined = model;
    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index] === "items") type = itemType(type);
      else if (tokens[index] === "properties")
        type = propertyOf(this.program, type, tokens[++index])?.type;
    }
    return type;
  }

  /** `/a/[]/b`, where `[]` steps into an array's items. */
  private pointer(path: string, model: Type): string {
    let type: Type | undefined = model;
    return path
      .split("/")
      .map((token, index) => {
        if (index === 0) return token;
        if (token === "[]") {
          type = itemType(type);
          return token;
        }
        const key = unescapePointer(token);
        const name = this.name(type, key);
        type = propertyOf(this.program, type, key)?.type;
        return escapePointer(name);
      })
      .join("/");
  }
}

/**
 * Report properties of one model that would be emitted under the same name.
 *
 * `firstName` and `first_name` are distinct in TypeSpec and the same key under snake case,
 * and the second would silently overwrite the first in every artifact.
 */
export function checkCasingCollisions(
  program: Program,
  casing: PropertyCasing,
): void {
  const visit = (namespace: Namespace): void => {
    for (const model of namespace.models.values()) {
      const claimed = new Map<string, ModelProperty>();
      for (const property of modelProperties(model)) {
        const name = jsonPropertyName(program, property, casing);
        const first = claimed.get(name);
        if (first) {
          reportDiagnostic(program, {
            code: "property-casing-collision",
            target: property,
            format: {
              model: model.name,
              first: first.name,
              second: property.name,
              name,
            },
          });
        } else claimed.set(name, property);
      }
    }
    for (const child of namespace.namespaces.values()) visit(child);
  };
  visit(program.getGlobalNamespaceType());
}

/** The property `key` names on `type`, by TypeSpec name or by encoded name. */
function propertyOf(
  program: Program,
  type: Type | undefined,
  key: string,
): ModelProperty | undefined {
  for (const candidate of variants(type)) {
    if (candidate.kind !== "Model" || candidate.indexer) continue;
    const properties = modelProperties(candidate);
    const found =
      properties.find((property) => property.name === key) ??
      // The stock emitter serializes an `@example` with encoded names already applied.
      properties.find(
        (property) =>
          resolveEncodedName(program, property, "application/json") === key,
      );
    if (found) return found;
  }
  return undefined;
}

function itemType(type: Type | undefined): Type | undefined {
  for (const candidate of variants(type)) {
    if (candidate.kind === "Model" && candidate.indexer?.key.name === "integer")
      return candidate.indexer.value;
  }
  return undefined;
}

function recordValueType(type: Type | undefined): Type | undefined {
  for (const candidate of variants(type)) {
    if (candidate.kind === "Model" && candidate.indexer?.key.name === "string")
      return candidate.indexer.value;
  }
  return undefined;
}

/** A union's member types, flattened; any other type on its own. */
function variants(type: Type | undefined): Type[] {
  if (!type) return [];
  if (type.kind === "ModelProperty") return variants(type.type);
  if (type.kind !== "Union") return [type];
  return [...type.variants.values()].flatMap((variant) =>
    variants(variant.type),
  );
}

/** Named declarations by name, as the emitter names the `$defs` it inlines. */
function indexNamedTypes(root: Namespace): Map<string, Type> {
  const indexed = new Map<string, Type>();
  const duplicates = new Set<string>();
  const visit = (namespace: Namespace): void => {
    for (const type of [
      ...namespace.models.values(),
      ...namespace.unions.values(),
    ]) {
      if (!type.name) continue;
      if (indexed.has(type.name)) duplicates.add(type.name);
      else indexed.set(type.name, type);
    }
    for (const child of namespace.namespaces.values()) visit(child);
  };
  visit(root);
  for (const name of duplicates) indexed.delete(name);
  return indexed;
}

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const unescapePointer = (token: string) =>
  token.replaceAll("~1", "/").replaceAll("~0", "~");

const escapePointer = (token: string) =>
  token.replaceAll("~", "~0").replaceAll("/", "~1");
