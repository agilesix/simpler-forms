import type {
  Enum,
  EnumMember,
  Model,
  ModelProperty,
  Program,
  Scalar,
  Type,
} from "@typespec/compiler";
import {
  getDoc,
  getMaxLength,
  getMinLength,
  getMaxItems,
  getMinItems,
} from "@typespec/compiler";
import { stateKeys } from "./lib.js";

interface ConditionBase {
  sourcePath: string[];
  sourceIsArray: boolean;
}
export interface EqualsCondition extends ConditionBase {
  operator: "equals";
  value: string | number | boolean | null;
}
export interface InCondition extends ConditionBase {
  operator: "in";
  values: (string | number | boolean | null)[];
}
export interface CountAtLeastCondition extends ConditionBase {
  operator: "countAtLeast";
  minimum: number;
}
export interface PresentCondition extends ConditionBase {
  operator: "present";
}
export type AtomicCondition =
  EqualsCondition | InCondition | CountAtLeastCondition | PresentCondition;

const conditionSourceModels = new WeakMap<AtomicCondition, Model>();

/** Retain compiler identity out-of-band so declarative conditions remain JSON-serializable. */
export function rememberConditionSourceModel(
  condition: AtomicCondition,
  model: Model | undefined,
): void {
  if (model) conditionSourceModels.set(condition, model);
}

export const conditionSourceModel = (
  condition: AtomicCondition,
): Model | undefined => conditionSourceModels.get(condition);
/**
 * The only compound predicate currently authored by the library. Keeping this to a flat
 * disjunction avoids introducing a general expression language for one source-backed use case.
 */
export interface AnyCondition {
  operator: "any";
  predicates: AtomicCondition[];
}
export type Condition = AtomicCondition | AnyCondition;

/** Everything the emitters need about one block, read out of decorator state. */
export interface Block {
  /** A Model for object-valued blocks, a Scalar for single-value questions. */
  model: Model | Scalar;
  kind: "question" | "form";
  /** True when the block is a single value rather than an object. */
  scalar: boolean;
  id: string;
  meta: Record<string, unknown>;
  classification: "semanticQuestion" | "captureMechanism";
  tags: string[];
  entity?: string;
  responseRole?: ResponseRole;
  label?: string;
  doc?: string;
  sections?: Enum;
  order?: string[];
  overrides: Record<string, Record<string, unknown>>;
}

export type ResponseRole =
  | "applicantInput"
  | "calculatedOutput"
  | "systemValue"
  | "technicalField"
  | "attestation"
  | "staticContent";

const g = (p: Program, k: symbol, t: Type) => p.stateMap(k).get(t);

function enumName(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as EnumMember).name);
  }
  if (value && typeof value === "object" && "value" in value) {
    return enumName((value as { value: unknown }).value);
  }
  return undefined;
}

export function readBlock(
  program: Program,
  model: Model | Scalar,
): Block | undefined {
  const q = g(program, stateKeys.questionMeta, model) as
    Record<string, unknown> | undefined;
  const f = g(program, stateKeys.formMeta, model) as
    Record<string, unknown> | undefined;
  if (!q && !f) return undefined;
  const meta = (q ?? f)!;
  return {
    model,
    kind: q ? "question" : "form",
    scalar: model.kind === "Scalar",
    id: String(meta.id),
    meta,
    classification: (enumName(meta.classification) ??
      "semanticQuestion") as Block["classification"],
    tags: (g(program, stateKeys.tags, model) as string[]) ?? [],
    entity: g(program, stateKeys.entity, model) as string | undefined,
    responseRole: g(program, stateKeys.responseRole, model) as
      ResponseRole | undefined,
    label: g(program, stateKeys.label, model) as string | undefined,
    doc: getDoc(program, model),
    sections: g(program, stateKeys.sections, model) as Enum | undefined,
    order: g(program, stateKeys.order, model) as string[] | undefined,
    overrides:
      (g(program, stateKeys.overrides, model) as Record<
        string,
        Record<string, unknown>
      >) ?? {},
  };
}

/** All blocks in the program, in declaration order. */
export function allBlocks(program: Program): Block[] {
  const out: Block[] = [];
  const seen = new Set<Model | Scalar>();
  const walk = (ns: any): void => {
    for (const m of [...ns.models.values(), ...ns.scalars.values()]) {
      if (seen.has(m)) continue;
      seen.add(m);
      const b = readBlock(program, m);
      if (b) out.push(b);
    }
    for (const child of ns.namespaces.values()) walk(child);
  };
  walk(program.getGlobalNamespaceType());
  return out;
}

export const propLabel = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.label, prop) as string | undefined;
export const propHelpText = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.helpText, prop) as string | undefined;
export const propWidget = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.widget, prop) as string | undefined;
export const propEncodedCheckboxGroup = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.encodedCheckboxGroup, prop) as
    Record<string, unknown> | undefined;
export const propSection = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.section, prop) as { name: string; label?: string } | undefined;
export const propReadOnly = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.readOnly, prop) === true;
export const propResponseRole = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.responseRole, prop) as ResponseRole | undefined;
export const typeResponseRole = (p: Program, type: Model | Scalar) =>
  g(p, stateKeys.responseRole, type) as ResponseRole | undefined;
export const typeTags = (p: Program, type: Model | Scalar) =>
  (g(p, stateKeys.tags, type) as string[]) ?? [];
export const propReadOnlyWhen = (p: Program, prop: ModelProperty) =>
  (g(p, stateKeys.readOnlyWhen, prop) as Condition[]) ?? [];
export const propOmit = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.omit, prop) === true;
export const propVisibleWhen = (p: Program, prop: ModelProperty) =>
  (g(p, stateKeys.visibleWhen, prop) as Condition[]) ?? [];
export const propEnabledWhen = (p: Program, prop: ModelProperty) =>
  (g(p, stateKeys.enabledWhen, prop) as Condition[]) ?? [];
export const propRequiredWhen = (p: Program, prop: ModelProperty) =>
  (g(p, stateKeys.requiredWhen, prop) as Condition[]) ?? [];
export const propNotBefore = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.notBefore, prop) as ModelProperty | undefined;
export const propValidationConstraints = (p: Program, prop: ModelProperty) =>
  (g(p, stateKeys.validationConstraints, prop) as
    Record<string, unknown> | undefined) ?? {};
export const propExclusiveValues = (p: Program, prop: ModelProperty) =>
  (g(p, stateKeys.exclusiveValues, prop) as
    (string | number | boolean | null)[] | undefined) ?? [];
export const propValidationConstraintsWhen = (
  p: Program,
  prop: ModelProperty,
) =>
  (g(p, stateKeys.validationConstraintsWhen, prop) as
    | {
        condition: Condition;
        patch: Record<string, unknown>;
      }[]
    | undefined) ?? [];
export const cardinalityRequiredPaths = (
  p: Program,
  target: Model | ModelProperty,
) => (g(p, stateKeys.requiredPaths, target) as string[] | undefined) ?? [];
export const cardinalityRequiredWhen = (
  p: Program,
  target: Model | ModelProperty,
) =>
  (g(p, stateKeys.requiredPathWhen, target) as
    | {
        targetPath: string;
        sourcePath: string;
        value: string | number | boolean | null;
      }[]
    | undefined) ?? [];
export const cardinalityAtLeastOnePathWhenPresent = (
  p: Program,
  target: Model | ModelProperty,
) =>
  (g(p, stateKeys.atLeastOnePathWhenPresent, target) as
    | {
        sourcePath: string;
        targetPaths: string[];
      }[]
    | undefined) ?? [];
export const cardinalityRequiredPathWhenPositiveDecimalString = (
  p: Program,
  target: Model | ModelProperty,
) =>
  (g(p, stateKeys.requiredPathWhenPositiveDecimalString, target) as
    | {
        targetPath: string;
        sourcePath: string;
      }[]
    | undefined) ?? [];
export const cardinalityPositiveDecimalStringWhenPathPresent = (
  p: Program,
  target: Model | ModelProperty,
) =>
  (g(p, stateKeys.positiveDecimalStringWhenPathPresent, target) as
    | {
        targetPath: string;
        sourcePath: string;
      }[]
    | undefined) ?? [];
export const modelAtLeastOneOf = (p: Program, model: Model) =>
  (g(p, stateKeys.atLeastOneOf, model) as string[][] | undefined) ?? [];
export const propComputed = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.computed, prop) as
    { operator: string; refs: string[] } | undefined;
export const propComputedFrom = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.computedFrom, prop) as
    { operator: string; paths: string[] } | undefined;
export const propCalculationMaterialization = (
  p: Program,
  prop: ModelProperty,
) =>
  g(p, stateKeys.calculationMaterialization, prop) as
    "when_any_source_present" | undefined;
export const propEvaluationOrder = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.evaluationOrder, prop) as number | undefined;
export const propTotals = (p: Program, prop: ModelProperty) =>
  g(p, stateKeys.totals, prop) as ModelProperty[] | undefined;
/** `@UI.label` for any model, block or not. */
export const modelLabel = (p: Program, model: Model) =>
  g(p, stateKeys.label, model) as string | undefined;
/** `@UI.order` for any model, block or not. */
export const modelOrder = (p: Program, model: Model) =>
  g(p, stateKeys.order, model) as string[] | undefined;

export const propOverrides = (p: Program, prop: ModelProperty) =>
  (g(p, stateKeys.overrides, prop) as Record<
    string,
    Record<string, unknown>
  >) ?? {};

/** Own and inherited properties in declaration order, with the derived declaration winning. */
export function modelProperties(model: Model): ModelProperty[] {
  const chain: Model[] = [];
  for (
    let current: Model | undefined = model;
    current;
    current = current.baseModel
  ) {
    chain.unshift(current);
  }
  const byName = new Map<string, ModelProperty>();
  for (const current of chain) {
    for (const property of current.properties.values())
      byName.set(property.name, property);
  }
  return [...byName.values()];
}

/** Properties in @UI.order if given, else declaration order; omitted ones dropped. */
export function orderedProps(program: Program, block: Block): ModelProperty[] {
  if (block.model.kind !== "Model") return [];
  // A form may extend a question to preserve flat response fields with explicit semantic
  // lineage. Its inherited fields remain form members for sectioning and presentation.
  // Question artifacts themselves keep their local surface and compose their base through
  // JSON Schema `allOf`, so walking inherited properties there would duplicate that surface.
  const candidates =
    block.kind === "form"
      ? modelProperties(block.model)
      : [...block.model.properties.values()];
  const props = candidates.filter((p) => !propOmit(program, p));
  if (!block.order) return props;
  const byName = new Map(props.map((p) => [p.name, p]));
  const out = block.order
    .map((n) => byName.get(n))
    .filter(Boolean) as ModelProperty[];
  for (const p of props) if (!out.includes(p)) out.push(p);
  return out;
}

/**
 * A block's own id and those of the questions it extends, nearest first.
 *
 * An entity question is a shape given a meaning -- `aor/signature` extends
 * `generics/signature` -- so anything inferred from a shape has to look past the name at the
 * front. Without this, naming a question stops the inference that its shape implied, which is
 * exactly backwards.
 */
export function blockAncestry(
  program: Program,
  model: Model | Scalar,
): string[] {
  const out: string[] = [];
  let current: Model | Scalar | undefined = model;
  while (current) {
    const block = readBlock(program, current);
    if (block) out.push(block.id);
    current =
      current.kind === "Model"
        ? current.baseModel
        : (current as Scalar).baseScalar;
  }
  return out;
}

/** The child block a property composes, if any. */
export function childBlock(
  program: Program,
  prop: ModelProperty,
): Block | undefined {
  const t = prop.type;
  if (t.kind === "Model" || t.kind === "Scalar") return readBlock(program, t);
  return undefined;
}

export function scalarConstraints(
  program: Program,
  prop: ModelProperty,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const min = getMinLength(program, prop),
    max = getMaxLength(program, prop);
  if (min !== undefined) out.minLength = min;
  if (max !== undefined) out.maxLength = max;
  const mnI = getMinItems(program, prop),
    mxI = getMaxItems(program, prop);
  if (mnI !== undefined) out.minItems = mnI;
  if (mxI !== undefined) out.maxItems = mxI;
  return out;
}

export function enumValues(e: Enum): (string | number)[] {
  return [...e.members.values()].map(
    (m) => (m.value ?? m.name) as string | number,
  );
}

export function scalarType(s: Scalar): string {
  let cur: Scalar | undefined = s;
  while (cur) {
    if (["string", "url", "uuid"].includes(cur.name)) return "string";
    if (["boolean"].includes(cur.name)) return "boolean";
    if (
      ["int8", "int16", "int32", "int64", "integer", "safeint"].includes(
        cur.name,
      )
    )
      return "integer";
    if (
      [
        "float",
        "float32",
        "float64",
        "decimal",
        "decimal128",
        "numeric",
      ].includes(cur.name)
    )
      return "number";
    cur = cur.baseScalar;
  }
  return "string";
}
