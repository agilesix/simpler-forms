import {
  getNamespaceFullName,
  type Enum,
  type EnumMember,
  type Model,
  type ModelProperty,
  type Namespace,
} from "@typespec/compiler";
import { reportDiagnostic, stateKeys } from "../lib.js";
import type {
  MappingCondition,
  MappingFromLink,
  MappingLink,
  MappingMatch,
  MappingPathLink,
  MappingSelection,
} from "../model.js";
import { type Ctx, enumName, push, set } from "./shared.js";

export const $targets = (ctx: Ctx, target: Namespace, targets: Enum) =>
  set(ctx, stateKeys.mappingTargets, target, targets);

export const $transforms = (ctx: Ctx, target: Namespace, transforms: Enum) =>
  set(ctx, stateKeys.mappingTransformSets, target, transforms);

export const $transform = (
  ctx: Ctx,
  target: ModelProperty,
  transform: EnumMember,
  params?: Record<string, unknown>,
) =>
  set(ctx, stateKeys.mappingTransform, target, {
    member: transform,
    ...(params ? { params } : {}),
  });

/**
 * Accumulated rather than overwritten: one model or property carries a link per mapping.
 * Two links for the same mapping are reported by `$onValidate`, not here, so the check sees
 * every decorator before it decides which one is the duplicate.
 */
export const $to = (
  ctx: Ctx,
  target: Model | ModelProperty,
  mapping: EnumMember,
  mappedTo: Model | ModelProperty,
) =>
  push(ctx, stateKeys.mappedTo, target, {
    mapping,
    mappedTo,
  } satisfies MappingLink);

export const $path = (
  ctx: Ctx,
  target: Model,
  mapping: EnumMember,
  sourcePath: string,
  mappedTo: ModelProperty,
) =>
  push(ctx, stateKeys.mappingPaths, target, {
    mapping,
    sourcePath,
    mappedTo,
  } satisfies MappingPathLink);

export const $match = (
  ctx: Ctx,
  target: ModelProperty,
  cases: Record<string, string | number | boolean>,
  fallback?: ModelProperty | string | number | boolean,
) =>
  set(ctx, stateKeys.mappingMatch, target, {
    cases: Object.fromEntries(
      Object.entries(cases).map(([key, value]) => [key, literal(value)]),
    ),
    ...(fallback === undefined
      ? {}
      : {
          default: isField(fallback)
            ? { field: fallback }
            : { value: literal(fallback) },
        }),
  } satisfies MappingMatch);

/** A `valueof numeric` arrives as TypeSpec's arbitrary-precision `Numeric`: as a JS number. */
const literal = (value: unknown) =>
  typeof value === "object" && value !== null && "asNumber" in value
    ? ((value as { asNumber(): number | null }).asNumber() ?? Number.NaN)
    : (value as string | number | boolean);

export const $required = (ctx: Ctx, target: ModelProperty) =>
  ctx.program.stateSet(stateKeys.mappingRequired).add(target);

export const $when = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty | Model,
  operator: unknown,
  value?: unknown,
) => {
  const name = enumName(operator) as MappingCondition["operator"];
  const picked =
    source.kind === "ModelProperty" ? { source } : selection(source);
  if (!picked) {
    reportDiagnostic(ctx.program, {
      code: "mapping-when-source",
      target: ctx.getArgumentTarget(0) ?? target,
      format: { name: target.name },
    });
    return;
  }
  const given = value !== undefined;
  const fail =
    name === "exists"
      ? given && "exists"
      : name === "in"
        ? !Array.isArray(value) && "in"
        : !given && "default";
  if (fail) {
    reportDiagnostic(ctx.program, {
      code: "mapping-when-value",
      messageId: fail,
      target: ctx.getArgumentTarget(given ? 2 : 1) ?? target,
      format: { name: target.name, source: picked.source.name, operator: name },
    });
    return;
  }
  push(ctx, stateKeys.mappingWhen, target, {
    ...picked,
    operator: name,
    ...(given ? { value: plainValue(value) } : {}),
  } satisfies MappingCondition);
};

/** A condition's value as plain JSON: lists entry by entry, numbers as JS numbers, enum members as their value. */
function plainValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainValue);
  if (typeof value === "object" && value !== null) {
    const v = value as { kind?: string; value?: unknown; name?: string };
    if (v.kind === "EnumMember") return v.value ?? v.name;
    if ("asNumber" in value) return literal(value);
  }
  return value;
}

const isField = (value: unknown): value is ModelProperty =>
  typeof value === "object" &&
  value !== null &&
  (value as ModelProperty).kind === "ModelProperty";

/** A source named with `Mapping.Item` or `Mapping.Slice` is stored as its field and selection. */
export const $from = (
  ctx: Ctx,
  target: Model | ModelProperty,
  mapping: EnumMember,
  source: Model | ModelProperty,
) =>
  push(ctx, stateKeys.mappedFrom, target, {
    mapping,
    ...(selection(source) ?? { source }),
  } satisfies MappingFromLink);

/** The field and selection `Mapping.Item<…>` or `Mapping.Slice<…>` names, or undefined for any other source. */
function selection(
  source: Model | ModelProperty,
): { source: ModelProperty; select: MappingSelection } | undefined {
  if (source.kind !== "Model" || !source.templateMapper || !source.namespace)
    return undefined;
  if (getNamespaceFullName(source.namespace) !== "SimplerForms.Mapping")
    return undefined;
  const [field, ...bounds] = source.templateMapper.args;
  if (field?.entityKind !== "Type" || field.kind !== "ModelProperty")
    return undefined;
  const [first, second] = bounds.map(numberOf);
  if (source.name === "Item" && first !== undefined)
    return { source: field, select: { index: first } };
  if (source.name === "Slice" && first !== undefined)
    return {
      source: field,
      select:
        second === undefined
          ? { start: first }
          : { start: first, stop: second },
    };
  return undefined;
}

/** The number a template's `valueof int32` argument holds, or undefined (as for `null`). */
function numberOf(arg: unknown): number | undefined {
  const entity = arg as {
    entityKind?: string;
    valueKind?: string;
    value?: { asNumber(): number | null };
    type?: { kind: string; value?: number };
  };
  if (entity.entityKind === "Value" && entity.valueKind === "NumericValue")
    return entity.value?.asNumber() ?? undefined;
  if (entity.type?.kind === "Number") return entity.type.value;
  return undefined;
}
