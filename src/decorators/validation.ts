import type { Model, ModelProperty } from "@typespec/compiler";
import { reportDiagnostic, stateKeys } from "../lib.js";
import {
  type Ctx,
  condition,
  enumName,
  literal,
  plain,
  push,
  set,
} from "./shared.js";

// --- constraints ----------------------------------------------------------

export const $validationConstraints = (
  ctx: Ctx,
  target: ModelProperty,
  patch: unknown,
) => set(ctx, stateKeys.validationConstraints, target, plain(ctx, patch));

export const $exclusiveValues = (
  ctx: Ctx,
  target: ModelProperty,
  ...values: unknown[]
) =>
  set(ctx, stateKeys.exclusiveValues, target, [
    ...new Set(values.map(literal)),
  ]);

export const $validationConstraintsWhen = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  equals: unknown,
  patch: unknown,
) =>
  push(ctx, stateKeys.validationConstraintsWhen, target, {
    condition: condition(source, equals),
    patch: plain(ctx, patch),
  });

// --- conditional requiredness ---------------------------------------------

export const $requiredWhen = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  equals: unknown,
) => push(ctx, stateKeys.requiredWhen, target, condition(source, equals));

export const $requiredWhenPath = (
  ctx: Ctx,
  target: ModelProperty,
  sourcePath: unknown,
  equals: unknown,
) =>
  push(ctx, stateKeys.requiredWhen, target, {
    operator: "equals",
    sourcePath: String(literal(sourcePath)).split("."),
    sourceIsArray: false,
    value: literal(equals),
  });

export const $requiredPaths = (
  ctx: Ctx,
  target: Model | ModelProperty,
  ...paths: unknown[]
) =>
  set(
    ctx,
    stateKeys.requiredPaths,
    target,
    paths.map((path) => String(literal(path))),
  );

export const $requiredPathWhen = (
  ctx: Ctx,
  target: Model | ModelProperty,
  targetPath: unknown,
  sourcePath: unknown,
  equals: unknown,
) =>
  push(ctx, stateKeys.requiredPathWhen, target, {
    targetPath: String(literal(targetPath)),
    sourcePath: String(literal(sourcePath)),
    value: literal(equals),
  });

/** Record a bounded conditional choice over descendant paths. */
export const $atLeastOnePathWhenPresent = (
  ctx: Ctx,
  target: Model | ModelProperty,
  sourcePath: unknown,
  ...targetPaths: unknown[]
) => {
  const source = String(literal(sourcePath));
  const paths = [...new Set(targetPaths.map((path) => String(literal(path))))];
  if (!source || paths.length < 2 || paths.some((path) => !path)) {
    reportDiagnostic(ctx.program, {
      code: "conditional-at-least-one-path-invalid",
      target,
      format: {
        model: target.name || "an anonymous model",
        paths: paths.join(", ") || "none",
      },
    });
    return;
  }
  push(ctx, stateKeys.atLeastOnePathWhenPresent, target, {
    sourcePath: source,
    targetPaths: paths,
  });
};

/** Record a portable JSON Schema any-of-required constraint on sibling properties. */
export const $atLeastOneOf = (
  ctx: Ctx,
  target: Model,
  ...properties: ModelProperty[]
) => {
  const names = [...new Set(properties.map((property) => property.name))];
  if (
    names.length < 2 ||
    properties.some((property) => property.model !== target)
  ) {
    reportDiagnostic(ctx.program, {
      code: "at-least-one-invalid",
      target,
      format: {
        model: target.name || "an anonymous model",
        properties: names.join(", ") || "none",
      },
    });
    return;
  }
  push(ctx, stateKeys.atLeastOneOf, target, names);
};

export const $notBefore = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
) => set(ctx, stateKeys.notBefore, target, source);

// --- the positive-decimal-string pair -------------------------------------
// A Grants.gov budget convention: an amount is carried as a string, and presence of
// one path makes another required (or requires it to be a positive decimal).

export const $requiredPathWhenPositiveDecimalString = (
  ctx: Ctx,
  target: Model | ModelProperty,
  targetPath: unknown,
  sourcePath: unknown,
) =>
  push(ctx, stateKeys.requiredPathWhenPositiveDecimalString, target, {
    targetPath: String(literal(targetPath)),
    sourcePath: String(literal(sourcePath)),
  });

export const $positiveDecimalStringWhenPathPresent = (
  ctx: Ctx,
  target: Model | ModelProperty,
  targetPath: unknown,
  sourcePath: unknown,
) =>
  push(ctx, stateKeys.positiveDecimalStringWhenPathPresent, target, {
    targetPath: String(literal(targetPath)),
    sourcePath: String(literal(sourcePath)),
  });

// --- calculation ----------------------------------------------------------

export const $computed = (
  ctx: Ctx,
  target: ModelProperty,
  operator: unknown,
  ...refs: ModelProperty[]
) =>
  set(ctx, stateKeys.computed, target, {
    operator: enumName(operator),
    refs: refs.map((r) => r.name),
  });

export const $computedFrom = (
  ctx: Ctx,
  target: ModelProperty,
  operator: unknown,
  ...paths: unknown[]
) =>
  set(ctx, stateKeys.computedFrom, target, {
    operator: enumName(operator),
    paths: paths.map((path) => String(literal(path))),
  });

export const $materializeWhenAnySourcePresent = (
  ctx: Ctx,
  target: ModelProperty,
) =>
  set(
    ctx,
    stateKeys.calculationMaterialization,
    target,
    "when_any_source_present",
  );

export const $evaluationOrder = (
  ctx: Ctx,
  target: ModelProperty,
  order: number,
) => set(ctx, stateKeys.evaluationOrder, target, order);

/**
 * Field-by-field totalling. Only the source properties are recorded; which field of the
 * block pairs with which is worked out at emission, where the type graph is in view.
 */
export const $totals = (
  ctx: Ctx,
  target: ModelProperty,
  ...sources: ModelProperty[]
) => set(ctx, stateKeys.totals, target, sources);
