import type { Enum, Model, ModelProperty, Scalar } from "@typespec/compiler";
import { $summary } from "@typespec/compiler";
import { stateKeys } from "../lib.js";
import {
  type Ctx,
  condition,
  countCondition,
  enumName,
  literal,
  plain,
  push,
  set,
} from "./shared.js";

// --- sections -------------------------------------------------------------

export const $sections = (ctx: Ctx, target: Model, sections: Enum) =>
  set(ctx, stateKeys.sections, target, sections);

/**
 * `valueof EnumMember` arrives as a value, not the member type, so resolve the
 * member's name and label here rather than in the emitters.
 */
export const $section = (ctx: Ctx, target: ModelProperty, section: unknown) =>
  set(ctx, stateKeys.section, target, sectionRef(section));

export function sectionRef(v: unknown): { name: string; label?: string } {
  const m = v as any;
  if (m && typeof m === "object") {
    if (m.name)
      return {
        name: String(m.name),
        label: m.value ? String(m.value) : undefined,
      };
    if (m.value?.name) {
      return {
        name: String(m.value.name),
        label: m.value.value ? String(m.value.value) : undefined,
      };
    }
  }
  return { name: String(v) };
}

// --- form-scoped overrides ------------------------------------------------

function overridePlain(value: unknown): unknown {
  const candidate = value as any;
  if (
    candidate &&
    typeof candidate === "object" &&
    candidate.entityKind === "Value"
  ) {
    return literal(candidate);
  }
  if (Array.isArray(value)) return value.map(overridePlain);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        overridePlain(nested),
      ]),
    );
  }
  return value;
}

export const $overrides = (
  ctx: Ctx,
  target: Model | ModelProperty,
  patch: unknown,
) => set(ctx, stateKeys.overrides, target, overridePlain(plain(ctx, patch)));

// --- presentation ---------------------------------------------------------

/**
 * A field label. Also delegated to `@summary`, which the JSON Schema emitter maps to
 * `title` -- so the canonical schema carries the label without this library emitting
 * any schema keyword itself.
 */
export const $label = (
  ctx: Ctx,
  target: Model | Scalar | ModelProperty,
  text: string,
) => {
  set(ctx, stateKeys.label, target, text);
  $summary(ctx as any, target as any, text);
};

/**
 * Secondary guidance shown with the field. Distinct from the doc comment, which is the
 * question's own description: help text is what a form says *about asking it here*.
 */
export const $helpText = (ctx: Ctx, target: ModelProperty, text: string) =>
  set(ctx, stateKeys.helpText, target, text);

export const $widget = (ctx: Ctx, target: ModelProperty, widget: unknown) =>
  set(ctx, stateKeys.widget, target, enumName(widget));

export const $encodedCheckboxGroup = (
  ctx: Ctx,
  target: ModelProperty,
  contract: unknown,
) => {
  set(ctx, stateKeys.widget, target, "EncodedCheckboxGroup");
  set(ctx, stateKeys.encodedCheckboxGroup, target, plain(ctx, contract));
};

export const $order = (ctx: Ctx, target: Model, ...props: ModelProperty[]) =>
  set(
    ctx,
    stateKeys.order,
    target,
    props.map((p) => p.name),
  );

export const $omit = (ctx: Ctx, target: ModelProperty) =>
  set(ctx, stateKeys.omit, target, true);

export const $readOnly = (ctx: Ctx, target: ModelProperty) =>
  set(ctx, stateKeys.readOnly, target, true);

// --- conditional behavior -------------------------------------------------

export const $visibleWhen = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  equals: unknown,
) => push(ctx, stateKeys.visibleWhen, target, condition(source, equals));

export const $enabledWhen = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  equals: unknown,
) => push(ctx, stateKeys.enabledWhen, target, condition(source, equals));

export const $enabledWhenAny = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  ...equals: unknown[]
) => {
  const base = condition(source, null);
  push(ctx, stateKeys.enabledWhen, target, {
    operator: "in",
    sourcePath: base.sourcePath,
    sourceIsArray: base.sourceIsArray,
    values: equals.map(literal),
  });
};

export const $enabledWhenCount = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  minimum: number,
) => {
  const count = countCondition(ctx, target, source, minimum);
  if (count) push(ctx, stateKeys.enabledWhen, target, count);
};

/**
 * Enable a field once a sibling list reaches capacity, while keeping an already-saved
 * value operable if the list later falls below that threshold. This is the narrow
 * disjunction needed by overflow attachment controls; it deliberately does not expose
 * an arbitrary expression AST.
 */
export const $enabledWhenCountOrPresent = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  minimum: number,
) => {
  const count = countCondition(ctx, target, source, minimum);
  if (!count) return;
  push(ctx, stateKeys.enabledWhen, target, {
    operator: "any",
    predicates: [
      count,
      { operator: "present", sourcePath: [target.name], sourceIsArray: false },
    ],
  });
};

export const $readOnlyWhen = (
  ctx: Ctx,
  target: ModelProperty,
  source: ModelProperty,
  equals: unknown,
) => push(ctx, stateKeys.readOnlyWhen, target, condition(source, equals));
