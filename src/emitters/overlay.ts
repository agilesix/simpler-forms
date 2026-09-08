import type { Model, ModelProperty, Program, Type } from "@typespec/compiler";
import {
  Block,
  cardinalityAtLeastOnePathWhenPresent,
  cardinalityPositiveDecimalStringWhenPathPresent,
  cardinalityRequiredPaths,
  cardinalityRequiredPathWhenPositiveDecimalString,
  cardinalityRequiredWhen,
  modelAtLeastOneOf,
  orderedProps,
  propHelpText,
  propEncodedCheckboxGroup,
  propExclusiveValues,
  propReadOnly,
  propRequiredWhen,
  propValidationConstraints,
  propValidationConstraintsWhen,
  readBlock,
} from "../model.js";

/**
 * The parts of a block's JSON Schema that `@typespec/json-schema` cannot produce.
 *
 * Two of them. Conditional requiredness, from `@Validation.requiredWhen`. And the
 * presentation a *form* puts on a member of a question it composes, from `@UI.overrides` --
 * SF-424 calls the authorized representative's phone "AOR Telephone Number" where the
 * question calls it "Telephone Number", and that belongs to the form.
 *
 * Everything else -- types, constraints, enums, arrays, `required`, `$ref` composition,
 * `extends` as `allOf` -- comes from the stock emitter. The build merges this over it.
 */
export function emitSchemaOverlay(
  program: Program,
  block: Block,
): Record<string, unknown> | undefined {
  if (block.model.kind !== "Model") return undefined;
  const model = block.model;
  const conditionals = conditionalValidation(
    program,
    orderedProps(program, block),
  );
  const patches = overriddenPresentation(block);
  const readOnly = readOnlyAnnotations(program, model);
  const helpText = helpTextAnnotations(program, model);
  const constraints = constraintAnnotations(program, model);
  const cardinality = cardinalityAnnotations(program, model);
  const encodedCheckboxes = encodedCheckboxAnnotations(program, model);
  const exclusiveValues = exclusiveValueAnnotations(program, model);
  const alternatives = atLeastOneAnnotations(program, model);
  const parts = [
    conditionals,
    patches,
    readOnly,
    helpText,
    constraints,
    cardinality,
    encodedCheckboxes,
    exclusiveValues,
    alternatives,
  ].filter(Boolean) as Record<string, unknown>[];
  if (!parts.length) return undefined;
  return parts.reduce(merge, {});
}

/** Decorator-derived JSON Schema for an unpublished model embedded under `$defs`. */
export function emitModelOverlay(
  program: Program,
  model: Model,
): Record<string, unknown> | undefined {
  const parts = [
    conditionalValidation(program, [...model.properties.values()]),
    readOnlyAnnotations(program, model),
    helpTextAnnotations(program, model),
    constraintAnnotations(program, model),
    cardinalityAnnotations(program, model),
    encodedCheckboxAnnotations(program, model),
    exclusiveValueAnnotations(program, model),
    atLeastOneAnnotations(program, model),
  ].filter(Boolean) as Record<string, unknown>[];
  return parts.length ? parts.reduce(merge, {}) : undefined;
}

/**
 * Carry array-choice exclusivity as both portable machine metadata and ordinary JSON Schema.
 * Consumers may use the metadata for immediate interaction; every validator still rejects a
 * response where one of the named values appears beside another selection.
 */
function exclusiveValueAnnotations(
  program: Program,
  model: Model,
  seen = new Set<Model>(),
): Record<string, unknown> | undefined {
  if (seen.has(model)) return undefined;
  seen.add(model);
  const properties: Record<string, unknown> = {};
  for (const property of model.properties.values()) {
    let patch: Record<string, unknown> = {};
    const values = propExclusiveValues(program, property);
    if (values.length) {
      patch = {
        "x-exclusive-values": values,
        allOf: values.map((value) => ({
          if: { contains: { const: value } },
          then: { maxItems: 1 },
        })),
      };
    }
    const child = childModel(property.type);
    // Published questions own intrinsic exclusivity in their own schema. Do not repeat the
    // same constraint beside each form occurrence's $ref; only local unpublished capture
    // models need recursive projection.
    if (child && !readBlock(program, child.model)) {
      const nested = exclusiveValueAnnotations(
        program,
        child.model,
        new Set(seen),
      );
      if (nested)
        patch = merge(patch, child.repeated ? { items: nested } : nested);
    }
    if (Object.keys(patch).length) properties[property.name] = patch;
  }
  return Object.keys(properties).length ? { properties } : undefined;
}

/** Emit a model-level choice as ordinary, portable JSON Schema. */
function atLeastOneAnnotations(
  program: Program,
  model: Model,
): Record<string, unknown> | undefined {
  const groups = modelAtLeastOneOf(program, model);
  if (!groups.length) return undefined;
  return {
    allOf: groups.map((properties) => ({
      anyOf: properties.map((property) => ({ required: [property] })),
    })),
  };
}

/**
 * Add occurrence-specific requiredness beside a reusable block's `$ref`.
 *
 * JSON Schema composition can add constraints but cannot subtract them. Reusable object
 * blocks therefore carry their least-restrictive source-backed cardinality, and a form that
 * requires more narrows that occurrence with this overlay.
 */
function cardinalityAnnotations(
  program: Program,
  model: Model,
  seen = new Set<Model>(),
): Record<string, unknown> | undefined {
  if (seen.has(model)) return undefined;
  seen.add(model);

  let own: Record<string, unknown> = requiredPathPatch(
    cardinalityRequiredPaths(program, model),
  );
  own = merge(
    own,
    conditionalPathPatch(cardinalityRequiredWhen(program, model)),
  );
  own = merge(
    own,
    conditionalAtLeastOnePathPatch(
      cardinalityAtLeastOnePathWhenPresent(program, model),
    ),
  );
  own = merge(
    own,
    positiveDecimalStringPathPatch(
      cardinalityRequiredPathWhenPositiveDecimalString(program, model),
      cardinalityPositiveDecimalStringWhenPathPresent(program, model),
    ),
  );

  const properties: Record<string, unknown> = {};
  for (const property of model.properties.values()) {
    let patch = requiredPathPatch(cardinalityRequiredPaths(program, property));
    patch = merge(
      patch,
      conditionalPathPatch(cardinalityRequiredWhen(program, property)),
    );
    patch = merge(
      patch,
      conditionalAtLeastOnePathPatch(
        cardinalityAtLeastOnePathWhenPresent(program, property),
      ),
    );
    patch = merge(
      patch,
      positiveDecimalStringPathPatch(
        cardinalityRequiredPathWhenPositiveDecimalString(program, property),
        cardinalityPositiveDecimalStringWhenPathPresent(program, property),
      ),
    );
    const child = childModel(property.type);
    // A published question owns its intrinsic cardinality in its own schema. Crossing
    // that reference boundary would copy the same constraints beside every occurrence
    // `$ref`, causing validators to report each missing path twice. Local unpublished
    // models still need recursive projection because they have no standalone artifact.
    if (child && !readBlock(program, child.model)) {
      const nested = cardinalityAnnotations(
        program,
        child.model,
        new Set(seen),
      );
      if (nested)
        patch = merge(patch, child.repeated ? { items: nested } : nested);
    }
    if (Object.keys(patch).length) properties[property.name] = patch;
  }
  if (Object.keys(properties).length) own = merge(own, { properties });
  return Object.keys(own).length ? own : undefined;
}

// The intersected source schema owns precision, scale, and length. This portable pattern adds
// only the strict > 0 predicate: an unsigned decimal lexical form containing a non-zero digit.
const POSITIVE_DECIMAL_STRING_PATTERN = "^(?=.*[1-9])\\d+(?:\\.\\d+)?$";

function positiveDecimalStringPathPatch(
  requiredTargets: { targetPath: string; sourcePath: string }[],
  positiveTargets: { targetPath: string; sourcePath: string }[],
): Record<string, unknown> {
  const conditions = [
    ...requiredTargets.map((entry) => ({
      if: constrainPath(entry.sourcePath.split(".").filter(Boolean), {
        pattern: POSITIVE_DECIMAL_STRING_PATTERN,
      }),
      then: requirePath(entry.targetPath.split(".").filter(Boolean)),
    })),
    ...positiveTargets.map((entry) => ({
      if: requirePath(entry.sourcePath.split(".").filter(Boolean)),
      then: constrainPath(entry.targetPath.split(".").filter(Boolean), {
        pattern: POSITIVE_DECIMAL_STRING_PATTERN,
      }),
    })),
  ];
  return conditions.length ? { allOf: conditions } : {};
}

function constrainPath(
  [head, ...rest]: string[],
  constraint: Record<string, unknown>,
): Record<string, unknown> {
  if (!head) return constraint;
  return {
    required: [head],
    properties: {
      [head]: rest.length ? constrainPath(rest, constraint) : constraint,
    },
  };
}

function conditionalAtLeastOnePathPatch(
  entries: { sourcePath: string; targetPaths: string[] }[],
): Record<string, unknown> {
  if (!entries.length) return {};
  return {
    allOf: entries.map((entry) => ({
      if: requirePath(entry.sourcePath.split(".").filter(Boolean)),
      then: {
        anyOf: entry.targetPaths.map((path) =>
          requirePath(path.split(".").filter(Boolean)),
        ),
      },
    })),
  };
}

function requiredPathPatch(paths: string[]): Record<string, unknown> {
  let out: Record<string, unknown> = {};
  for (const path of paths) {
    const steps = path.split(".").filter(Boolean);
    if (!steps.length) continue;
    out = merge(out, requirePath(steps));
  }
  return out;
}

function conditionalPathPatch(
  entries: {
    targetPath: string;
    sourcePath: string;
    value: string | number | boolean | null;
  }[],
): Record<string, unknown> {
  if (!entries.length) return {};
  return {
    allOf: entries.map((entry) => ({
      if: conditionSchema(
        entry.sourcePath.split(".").filter(Boolean),
        false,
        entry.value,
      ),
      then: requirePath(entry.targetPath.split(".").filter(Boolean)),
    })),
  };
}

function requirePath([head, ...rest]: string[]): Record<string, unknown> {
  if (!head) return {};
  return {
    required: [head],
    ...(rest.length ? { properties: { [head]: requirePath(rest) } } : {}),
  };
}

/** Carry the declarative choice-to-wire mapping beside the enum it governs. */
function encodedCheckboxAnnotations(
  program: Program,
  model: Model,
  seen = new Set<Model>(),
): Record<string, unknown> | undefined {
  if (seen.has(model)) return undefined;
  seen.add(model);
  const properties: Record<string, unknown> = {};
  for (const property of model.properties.values()) {
    let patch: Record<string, unknown> = {};
    const contract = propEncodedCheckboxGroup(program, property);
    if (contract) patch["x-encoded-checkbox-group"] = contract;
    const child = childModel(property.type);
    if (child) {
      const nested = encodedCheckboxAnnotations(
        program,
        child.model,
        new Set(seen),
      );
      if (nested)
        patch = merge(patch, child.repeated ? { items: nested } : nested);
    }
    if (Object.keys(patch).length) properties[property.name] = patch;
  }
  return Object.keys(properties).length ? { properties } : undefined;
}

/** Carry form-use constraints into JSON Schema without creating another semantic question. */
function constraintAnnotations(
  program: Program,
  model: Model,
  seen = new Set<Model>(),
): Record<string, unknown> | undefined {
  if (seen.has(model)) return undefined;
  seen.add(model);
  const properties: Record<string, unknown> = {};
  for (const property of model.properties.values()) {
    let patch = propValidationConstraints(program, property);
    const child = childModel(property.type);
    if (child) {
      const nested = constraintAnnotations(program, child.model, new Set(seen));
      if (nested)
        patch = merge(patch, child.repeated ? { items: nested } : nested);
    }
    if (Object.keys(patch).length) properties[property.name] = patch;
  }
  return Object.keys(properties).length ? { properties } : undefined;
}

/** Carry portable field guidance into JSON Schema at every nested depth. */
function helpTextAnnotations(
  program: Program,
  model: Model,
  seen = new Set<Model>(),
): Record<string, unknown> | undefined {
  if (seen.has(model)) return undefined;
  seen.add(model);
  const properties: Record<string, unknown> = {};
  for (const property of model.properties.values()) {
    let patch: Record<string, unknown> = {};
    const helpText = propHelpText(program, property);
    if (helpText) patch.description = helpText;
    const child = childModel(property.type);
    if (child) {
      const nested = helpTextAnnotations(program, child.model, new Set(seen));
      if (nested)
        patch = merge(patch, child.repeated ? { items: nested } : nested);
    }
    if (Object.keys(patch).length) properties[property.name] = patch;
  }
  return Object.keys(properties).length ? { properties } : undefined;
}

function childModel(
  type: Type,
): { model: Model; repeated: boolean } | undefined {
  if (type.kind !== "Model") return undefined;
  if (!type.indexer) return { model: type, repeated: false };
  return type.indexer.value.kind === "Model"
    ? { model: type.indexer.value, repeated: true }
    : undefined;
}

/** Carry declared output status into JSON Schema at every nested depth. */
function readOnlyAnnotations(
  program: Program,
  model: Model,
  seen = new Set<Model>(),
): Record<string, unknown> | undefined {
  if (seen.has(model)) return undefined;
  seen.add(model);
  const properties: Record<string, unknown> = {};
  for (const property of model.properties.values()) {
    let patch: Record<string, unknown> = {};
    if (propReadOnly(program, property)) patch.readOnly = true;
    const child = childModel(property.type);
    if (child) {
      const nested = readOnlyAnnotations(program, child.model, new Set(seen));
      if (nested)
        patch = merge(patch, child.repeated ? { items: nested } : nested);
    }
    if (Object.keys(patch).length) properties[property.name] = patch;
  }
  return Object.keys(properties).length ? { properties } : undefined;
}

function conditionalValidation(
  program: Program,
  properties: ModelProperty[],
): Record<string, unknown> | undefined {
  const conditionals: Record<string, unknown>[] = [];
  for (const prop of properties) {
    for (const c of propRequiredWhen(program, prop)) {
      if (c.operator !== "equals") continue;
      conditionals.push({
        if: conditionSchema(c.sourcePath, c.sourceIsArray, c.value),
        then: { required: [prop.name] },
      });
    }
    for (const c of propValidationConstraintsWhen(program, prop)) {
      if (c.condition.operator !== "equals") continue;
      conditionals.push({
        if: conditionSchema(
          c.condition.sourcePath,
          c.condition.sourceIsArray,
          c.condition.value,
        ),
        then: { properties: { [prop.name]: c.patch } },
      });
    }
  }
  if (!conditionals.length) return undefined;

  // Merge conditionals sharing an identical `if`, as the golden artifacts do.
  const merged: Record<string, unknown>[] = [];
  for (const c of conditionals) {
    const twin = merged.find(
      (m) => JSON.stringify(m.if) === JSON.stringify(c.if),
    );
    if (twin) {
      twin.then = merge(
        twin.then as Record<string, unknown>,
        c.then as Record<string, unknown>,
      );
    } else merged.push(c);
  }
  return { allOf: merged };
}

/** Build a guarded condition at any nested data path. */
function conditionSchema(
  path: string[],
  sourceIsArray: boolean,
  value: string | number | boolean | null,
): Record<string, unknown> {
  let nested: Record<string, unknown> = sourceIsArray
    ? { contains: { const: value } }
    : { const: value };
  for (const step of [...path].reverse()) {
    nested = {
      properties: { [step]: nested },
      // Guard every level so a missing object cannot satisfy the condition vacuously.
      required: [step],
    };
  }
  return nested;
}

/**
 * A form's own label and help text for a member of a question it composes.
 *
 * The member's schema is behind a `$ref`, so the patch goes beside it: a second `allOf`
 * branch naming the member. A consumer that resolves the reference sees the question's
 * wording, then the form's on top -- which is the order that makes the form win.
 */
function overriddenPresentation(
  block: Block,
): Record<string, unknown> | undefined {
  const patches: Record<string, Record<string, unknown>> = {};
  for (const [path, override] of Object.entries(block.overrides)) {
    const presentation: Record<string, unknown> = {};
    if (typeof override.label === "string") presentation.title = override.label;
    if (typeof override.helpText === "string")
      presentation.description = override.helpText;
    if (override.readOnly === true) presentation.readOnly = true;
    if (!Object.keys(presentation).length) continue;

    const [head, ...rest] = path.split(".");
    if (!rest.length && override.readOnly !== true) {
      // A root property is declared in this block, so `@UI.label` already covers it.
      continue;
    }
    const property = modelProperty(block.model as Model, head);
    const child = property ? childModel(property.type) : undefined;
    let patch =
      rest.length && child
        ? nestPresentation(child.model, rest, presentation)
        : rest.length
          ? nest(rest, presentation)
          : presentation;
    if (rest.length && child?.repeated) patch = { items: patch };
    patches[head] = merge(patches[head] ?? {}, patch);
  }
  if (!Object.keys(patches).length) return undefined;
  return {
    properties: Object.fromEntries(
      Object.entries(patches).map(([name, patch]) => [
        name,
        { allOf: [patch] },
      ]),
    ),
  };
}

/** Find one own or inherited property, preferring the derived declaration. */
function modelProperty(model: Model, name: string): ModelProperty | undefined {
  for (
    let current: Model | undefined = model;
    current;
    current = current.baseModel
  ) {
    const property = current.properties.get(name);
    if (property) return property;
  }
  return undefined;
}

/**
 * Nest one form-scoped presentation patch through the addressed model shape.
 *
 * Arrays require an `items` boundary in JSON Schema even though the authoring
 * path deliberately omits array syntax (`reports.total`, not `reports[].total`).
 */
function nestPresentation(
  model: Model,
  steps: string[],
  leaf: Record<string, unknown>,
): Record<string, unknown> {
  const [step, ...rest] = steps;
  if (!step) return leaf;
  const property = modelProperty(model, step);
  const child = property ? childModel(property.type) : undefined;
  let nested =
    rest.length && child
      ? nestPresentation(child.model, rest, leaf)
      : rest.length
        ? nest(rest, leaf)
        : leaf;
  if (rest.length && child?.repeated) nested = { items: nested };
  return { properties: { [step]: nested } };
}

/** `["phone"], {title}` becomes `{properties: {phone: {title}}}`. */
function nest(
  steps: string[],
  leaf: Record<string, unknown>,
): Record<string, unknown> {
  return steps.reduceRight<Record<string, unknown>>(
    (inner, step) => ({ properties: { [step]: inner } }),
    leaf,
  );
}

function merge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const existing = out[key];
    if (key === "required" && Array.isArray(existing) && Array.isArray(value)) {
      out[key] = [...new Set([...existing, ...value])];
    } else if (
      key === "allOf" &&
      Array.isArray(existing) &&
      Array.isArray(value)
    ) {
      out[key] = [...existing, ...value];
    } else {
      out[key] =
        isRecord(existing) && isRecord(value) ? merge(existing, value) : value;
    }
  }
  return out;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
