import type {
  Enum,
  EnumMember,
  Model,
  ModelProperty,
  Namespace,
} from "@typespec/compiler";
import { stateKeys } from "../lib.js";
import type {
  MappingFromLink,
  MappingLink,
  MappingPathLink,
} from "../model.js";
import { type Ctx, push, set } from "./shared.js";

export const $targets = (ctx: Ctx, target: Namespace, targets: Enum) =>
  set(ctx, stateKeys.mappingTargets, target, targets);

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

export const $from = (
  ctx: Ctx,
  target: Model | ModelProperty,
  mapping: EnumMember,
  source: Model | ModelProperty,
) =>
  push(ctx, stateKeys.mappedFrom, target, {
    mapping,
    source,
  } satisfies MappingFromLink);
