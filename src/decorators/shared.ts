import type {
  DecoratorContext,
  Model,
  ModelProperty,
  Scalar,
  Type,
  Value,
} from "@typespec/compiler";
import { isArrayModelType, serializeValueAsJson } from "@typespec/compiler";
import { $id as $jsonSchemaId } from "@typespec/json-schema";
import { reportDiagnostic } from "../lib.js";
import { rememberConditionSourceModel } from "../model.js";

export type Ctx = DecoratorContext;

/**
 * `valueof <Model>` arrives as a TypeSpec ObjectValue with parent back-references,
 * so it cannot be serialized directly. Convert to plain JS at the boundary.
 */
export function plain(ctx: DecoratorContext, value: unknown): unknown {
  const v = value as Value;
  if (
    v &&
    typeof v === "object" &&
    "entityKind" in v &&
    (v as any).entityKind === "Value"
  ) {
    return serializeValueAsJson(ctx.program, v, (v as any).type);
  }
  return value;
}

export function resolvedArgumentProperty(
  ctx: Ctx,
  index: number,
): ModelProperty | undefined {
  const target = ctx.getArgumentTarget(index);
  if (!target || (target as any).entityKind) return undefined;
  const node = target as Parameters<
    typeof ctx.program.checker.getTypeForNode
  >[0];
  const resolved = ctx.program.checker.getTypeForNode(node);
  return resolved.kind === "ModelProperty" ? resolved : undefined;
}

/** Store a single value keyed by target. */
export function set(ctx: Ctx, key: symbol, target: Type, value: unknown): void {
  ctx.program.stateMap(key).set(target, value);
}

/** Append to a list keyed by target. */
export function push(
  ctx: Ctx,
  key: symbol,
  target: Type,
  value: unknown,
): void {
  const map = ctx.program.stateMap(key);
  const existing = (map.get(target) as unknown[] | undefined) ?? [];
  existing.push(value);
  map.set(target, existing);
}

// --- identity -------------------------------------------------------------

/**
 * A block's `$id`, relative to the bank's base URI. The base is declared once with
 * `@jsonSchema("<base>")` on the bank namespace, so it is a publishing decision in
 * the specs rather than a constant in this library.
 */
export const blockSchemaRef = (id: string) => `${id}/schema.json`;

/**
 * Delegate to the stock JSON Schema library, which resolves this relative id
 * against the namespace base and uses it for both `$id` and every `$ref` target.
 */
export function publishAs(ctx: Ctx, target: Model | Scalar, id: string): void {
  $jsonSchemaId(ctx as any, target as any, blockSchemaRef(id));
}

// --- value marshalling ----------------------------------------------------

/** Peel one layer of TypeSpec value wrapping. */
export function unwrap(v: unknown): unknown {
  const o = v as any;
  if (
    o &&
    typeof o === "object" &&
    "entityKind" in o &&
    o.entityKind === "Value" &&
    "value" in o
  ) {
    return o.value;
  }
  return v;
}

/** An enum member argument arrives as the member; take its name. */
export function enumName(v: unknown): string {
  const m = unwrap(v);
  if (m && typeof m === "object" && "name" in (m as any))
    return String((m as any).name);
  return String(m);
}

/**
 * Resolve a decorator argument to a plain JSON literal. Enum members yield their
 * wire value, so a comparison in an emitted schema is a string rather than a
 * compiler object with parent back-references.
 */
export function literal(v: unknown): string | number | boolean | null {
  const u = unwrap(v) as any;
  if (u === null || u === undefined) return null;
  if (typeof u !== "object") return u;
  if (u.kind === "EnumMember" || ("name" in u && "enum" in u)) {
    return (u.value ?? u.name) as string | number;
  }
  if ("value" in u) return literal(u.value);
  if ("name" in u) return String(u.name);
  return String(u);
}

// --- conditions -----------------------------------------------------------
// Shared by UI (visibleWhen, enabledWhen, readOnlyWhen) and Validation
// (requiredWhen, constraintsWhen), so neither namespace owns them.

/**
 * `source` is a ModelProperty passed as `Model.prop` at the call site. It is reduced
 * to plain data here so no emitter ever handles a compiler object.
 */
export function condition(source: ModelProperty, equals: unknown) {
  const t = source.type as any;
  return {
    operator: "equals" as const,
    sourcePath: [source.name],
    sourceIsArray: t?.kind === "Model" && !!t.indexer,
    value: literal(equals),
  };
}

export function countCondition(
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  minimum: number,
) {
  let valid = true;
  const resolvedSource = resolvedArgumentProperty(ctx, 0) ?? source;
  if (
    resolvedSource.model &&
    target.model &&
    resolvedSource.model !== target.model
  ) {
    reportDiagnostic(ctx.program, {
      code: "condition-source-not-sibling",
      target,
      format: { source: resolvedSource.name, target: target.name },
    });
    valid = false;
  }
  if (source.type.kind !== "Model" || !isArrayModelType(source.type)) {
    reportDiagnostic(ctx.program, {
      code: "condition-count-source-not-array",
      target,
      format: { source: source.name },
    });
    valid = false;
  }
  const normalizedMinimum = Number(literal(minimum));
  if (!Number.isInteger(normalizedMinimum) || normalizedMinimum <= 0) {
    reportDiagnostic(ctx.program, {
      code: "condition-count-minimum-invalid",
      target,
      format: { minimum: String(normalizedMinimum) },
    });
    valid = false;
  }
  if (!valid) return undefined;
  const result = {
    operator: "countAtLeast" as const,
    sourcePath: [source.name],
    sourceIsArray: true,
    minimum: normalizedMinimum,
  };
  rememberConditionSourceModel(result, resolvedSource.model);
  return result;
}
