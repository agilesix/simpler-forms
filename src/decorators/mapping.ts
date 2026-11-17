import {
  getNamespaceFullName,
  type Enum,
  type EnumMember,
  type Model,
  type ModelProperty,
  type Namespace,
} from "@typespec/compiler";
import { stateKeys } from "../lib.js";
import type {
  MappingFromLink,
  MappingLink,
  MappingPathLink,
  MappingSelection,
} from "../model.js";
import { type Ctx, push, set } from "./shared.js";

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
