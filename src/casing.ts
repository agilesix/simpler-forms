import type { ModelProperty, Namespace, Program } from "@typespec/compiler";
import { resolveEncodedName } from "@typespec/compiler";
import { reportDiagnostic } from "./lib.js";
import { modelProperties } from "./model.js";

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

/**
 * Renames properties in a finished artifact.
 *
 * The emitters build every artifact in TypeSpec names, which is also what an author writes in
 * a string path, so the casing is applied once, after everything that resolves a path has run.
 * One table maps each TypeSpec name to its emitted name across the whole program. That keeps
 * renaming independent of where in an artifact a name appears, at the cost of requiring a name
 * to be emitted the same way everywhere it is declared.
 */
export class Casing {
  private readonly names = new Map<string, string>();

  constructor(
    program: Program,
    private readonly casing: PropertyCasing,
  ) {
    const declared = new Map<string, ModelProperty>();
    const visit = (namespace: Namespace): void => {
      for (const model of namespace.models.values()) {
        const claimed = new Map<string, ModelProperty>();
        for (const property of modelProperties(model)) {
          const name = jsonPropertyName(program, property, casing);
          const sibling = claimed.get(name);
          if (sibling) {
            reportDiagnostic(program, {
              code: "property-casing-collision",
              target: property,
              format: {
                model: model.name,
                first: sibling.name,
                second: property.name,
                name,
              },
            });
          } else claimed.set(name, property);

          const elsewhere = declared.get(property.name);
          const previous = this.names.get(property.name);
          if (elsewhere && previous !== name) {
            reportDiagnostic(program, {
              code: "property-casing-inconsistent",
              target: property,
              format: {
                property: property.name,
                name,
                other: `${elsewhere.model?.name}.${elsewhere.name}`,
                otherName: previous!,
              },
            });
          } else if (!elsewhere) {
            declared.set(property.name, property);
            this.names.set(property.name, name);
          }
        }
      }
      for (const child of namespace.namespaces.values()) visit(child);
    };
    visit(program.getGlobalNamespaceType());
    // The stock emitter serializes an `@example` with encoded names already applied.
    for (const name of [...this.names.values()]) this.names.set(name, name);
  }

  /** The name a property named `key` in TypeSpec is emitted under. */
  name(key: string): string {
    return (
      this.names.get(key) ?? (this.casing === "snake" ? snakeCase(key) : key)
    );
  }

  /** A JSON Schema or JSON Forms layout. */
  json<T>(node: T): T {
    if (Array.isArray(node)) return node.map((entry) => this.json(entry)) as T;
    if (!isObject(node)) return node;
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => {
        if (key === "properties" && isObject(value))
          return [key, this.keys(value, (entry) => this.json(entry))];
        if (key === "required" && Array.isArray(value))
          return [key, value.map((name) => this.name(name))];
        if (key === "scope" && typeof value === "string")
          return [
            key,
            value.replace(/(?<=properties\/)[^/]+/g, (name) => this.name(name)),
          ];
        if (key === "examples" || key === "default" || key === "const")
          return [key, this.instance(value)];
        return [key, this.json(value)];
      }),
    ) as T;
  }

  /** A JSON Pointer such as `/keyContacts/[]/name`. */
  pointer(path: string): string {
    return path
      .split("/")
      .map((token, index) =>
        index === 0 || token === "[]"
          ? token
          : escapePointer(this.name(unescapePointer(token))),
      )
      .join("/");
  }

  /** Data shaped like the schema, such as an `@example` value. */
  private instance(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((entry) => this.instance(entry));
    return isObject(value)
      ? this.keys(value, (entry) => this.instance(entry))
      : value;
  }

  private keys(
    value: Record<string, unknown>,
    inner: (entry: unknown) => unknown,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [
        this.name(name),
        inner(entry),
      ]),
    );
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const unescapePointer = (token: string) =>
  token.replaceAll("~1", "/").replaceAll("~0", "~");

const escapePointer = (token: string) =>
  token.replaceAll("~", "~0").replaceAll("/", "~1");
