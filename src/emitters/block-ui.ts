import type { Model, ModelProperty, Program } from "@typespec/compiler";
import { getDoc } from "@typespec/compiler";
import {
  AtomicCondition,
  Block,
  Condition,
  childBlock,
  modelLabel,
  modelOrder,
  modelOverrides,
  modelProperties,
  propEnabledWhen,
  propLabel,
  propOmit,
  propReadOnly,
  propReadOnlyWhen,
  propSection,
  propVisibleWhen,
  propWidget,
  readBlock,
} from "../model.js";
import { normalizedOverrideEnabledWhen } from "./override-condition.js";

/** An answered value: not null, not blank, not an empty list. */
const answeredSchema = {
  not: {
    anyOf: [{ type: "null" }, { const: "" }, { type: "array", maxItems: 0 }],
  },
};

const conditionSchema = (
  condition: AtomicCondition,
): Record<string, unknown> =>
  condition.operator === "in"
    ? { enum: condition.values }
    : condition.operator === "countAtLeast"
      ? { type: "array", minItems: condition.minimum }
      : condition.operator === "present"
        ? answeredSchema
        : condition.operator === "notEquals"
          ? condition.requiresAnswer
            ? { allOf: [answeredSchema, { not: { const: condition.value } }] }
            : { not: { const: condition.value } }
          : { const: condition.value };

/** A condition over the block root, used only for the bounded cross-field disjunction. */
const rootConditionSchema = (
  condition: AtomicCondition,
): Record<string, unknown> => {
  let schema = conditionSchema(condition);
  for (const step of [...condition.sourcePath].reverse()) {
    schema = { properties: { [step]: schema }, required: [step] };
  }
  return schema;
};

const jsonFormsCondition = (condition: Condition): Record<string, unknown> =>
  condition.operator === "any"
    ? {
        scope: "#",
        schema: { anyOf: condition.predicates.map(rootConditionSchema) },
      }
    : {
        scope: `#/${condition.sourcePath.map((step) => `properties/${step}`).join("/")}`,
        schema: conditionSchema(condition),
        // JSON Forms passes a condition whose source is absent unless told otherwise.
        ...(condition.operator === "notEquals" && condition.requiresAnswer
          ? { failWhenUndefined: true }
          : {}),
      };

export interface UiNode {
  type: string;
  scope?: string;
  label?: string;
  text?: string;
  elements?: UiNode[];
  options?: Record<string, unknown>;
  rule?: Record<string, unknown>;
}

type Overrides = Record<string, Record<string, unknown>>;

/** Convert a canonical JSON Forms scope into the dotted path addressed by @UI.overrides. */
const dataPathFromScope = (scope: string): string | undefined => {
  if (!scope.startsWith("#/properties/")) return undefined;
  const tokens = scope.slice(2).split("/");
  const path: string[] = [];
  for (let index = 0; index < tokens.length;) {
    if (tokens[index] !== "properties" || !tokens[index + 1]) return undefined;
    path.push(tokens[index + 1]);
    index += 2;
    if (tokens[index] === "items") index += 1;
  }
  return path.join(".");
};

/** Emit the portable JSON Forms equivalent of a form-scoped enabledWhen override. */
const overrideEnabledRule = (
  override: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const condition = normalizedOverrideEnabledWhen(override);
  if (!condition) return undefined;
  const scope = `#/${condition.sourcePath.map((step) => `properties/${step}`).join("/")}`;
  const schema =
    condition.operator === "in"
      ? { enum: condition.values }
      : { const: condition.value };
  return { effect: "ENABLE", condition: { scope, schema } };
};

/** Apply occurrence-specific behavior after recursively composing canonical child UI trees. */
const applyOverrides = (node: UiNode, overrides: Overrides): UiNode => {
  const out: UiNode = { ...node };
  if (typeof node.scope === "string") {
    const path = dataPathFromScope(node.scope);
    const rule = path ? overrideEnabledRule(overrides[path] ?? {}) : undefined;
    if (rule && node.rule) {
      throw new Error(
        `@UI.overrides enabledWhen collides with intrinsic UI behavior at ${path}`,
      );
    }
    if (rule) out.rule = rule;
  }
  if (node.elements)
    out.elements = node.elements.map((child) =>
      applyOverrides(child, overrides),
    );
  return out;
};

/** Re-prefix every Control scope so a child's tree sits under `propName`. */
export function rescopeUi(node: UiNode, propName: string): UiNode {
  const out: UiNode = { ...node };
  if (typeof out.scope === "string" && out.scope.startsWith("#/")) {
    out.scope = `#/properties/${propName}/${out.scope.slice(2)}`;
  }
  const condition = out.rule?.condition as
    { scope?: unknown; schema?: unknown } | undefined;
  if (
    typeof condition?.scope === "string" &&
    condition.scope.startsWith("#/")
  ) {
    out.rule = {
      ...out.rule,
      condition: {
        ...condition,
        scope: `#/properties/${propName}/${condition.scope.slice(2)}`,
      },
    };
  } else if (condition?.scope === "#" && condition.schema !== undefined) {
    out.rule = {
      ...out.rule,
      condition: {
        ...condition,
        schema: {
          properties: { [propName]: condition.schema },
          required: [propName],
        },
      },
    };
  }
  if (out.elements)
    out.elements = out.elements.map((c) => rescopeUi(c, propName));
  return out;
}

/**
 * Every property a model's answers carry, inherited ones included, in `@UI.order`.
 *
 * Not `orderedProps`, which keeps a question to its own properties because its JSON Schema
 * composes the base through `allOf`. A layout has no `allOf` to fall back on: a question
 * whose fields are all inherited -- `primary-org/address` extends `generics/address` and adds
 * none -- would lay out as an empty group, and a form-local extension could not interleave
 * its fields with the ones it inherits.
 */
function layoutProps(program: Program, model: Model): ModelProperty[] {
  const props = modelProperties(model).filter((p) => !propOmit(program, p));
  const order = modelOrder(program, model);
  if (!order) return props;
  const byName = new Map(props.map((p) => [p.name, p]));
  const out = order
    .map((n) => byName.get(n))
    .filter(Boolean) as ModelProperty[];
  for (const p of props) if (!out.includes(p)) out.push(p);
  return out;
}

/** What laying out a model needs, which a block has and a form-local model can supply. */
type LayoutSource = Pick<
  Block,
  "model" | "scalar" | "label" | "doc" | "sections" | "overrides"
>;

/** A model laid out as a block would be, whether or not it is one. */
const layoutSource = (program: Program, model: Model): LayoutSource =>
  readBlock(program, model) ?? {
    model,
    scalar: false,
    label: modelLabel(program, model),
    doc: getDoc(program, model),
    overrides: modelOverrides(program, model),
  };

/**
 * The layout of one entry of a repeated property, which JSON Forms reads from a list
 * control's `options.detail`. Its scopes are relative to the entry rather than the form, so
 * it is not re-scoped when the list is composed into a larger block.
 *
 * Without it a renderer has nothing to order the entry's fields by but the item schema, and
 * a composed item spreads its fields across `allOf` branches.
 */
function itemDetail(program: Program, prop: ModelProperty): UiNode | undefined {
  const type = prop.type;
  if (type.kind !== "Model" || !type.indexer) return undefined;
  const item = type.indexer.value;
  // A list of scalars has no fields of its own to lay out.
  if (item.kind !== "Model") return undefined;
  return emitBlockUi(program, layoutSource(program, item));
}

/**
 * The canonical UI artifact for one block. Scopes are relative to this block's own
 * root, so it renders standalone; children are incorporated and re-scoped.
 */
export function emitBlockUi(program: Program, block: LayoutSource): UiNode {
  // A single-value question renders as one Control at its own root.
  if (block.scalar) {
    const node: UiNode = { type: "Control", scope: "#" };
    if (block.label) node.label = block.label;
    return node;
  }

  const nodeForProperty = (prop: ModelProperty): UiNode => {
    const child = childBlock(program, prop);
    if (child && !child.scalar) {
      const group = rescopeUi(emitBlockUi(program, child), prop.name);
      const widget = propWidget(program, prop);
      return widget
        ? { ...group, options: { ...(group.options ?? {}), widget } }
        : group;
    }

    const node: UiNode = {
      type: "Control",
      scope: `#/properties/${prop.name}`,
    };
    const label = propLabel(program, prop);
    if (label) node.label = label;

    const detail = itemDetail(program, prop);
    if (detail) node.options = { ...(node.options ?? {}), detail };

    const widget = propWidget(program, prop);
    if (widget) node.options = { ...(node.options ?? {}), widget };
    if (propReadOnly(program, prop))
      node.options = { ...(node.options ?? {}), readonly: true };

    const conds = propVisibleWhen(program, prop);
    if (conds.length === 1) {
      const c = conds[0];
      node.rule = {
        effect: "SHOW",
        condition: jsonFormsCondition(c),
      };
    } else {
      const enabled = propEnabledWhen(program, prop);
      if (enabled.length === 1) {
        const c = enabled[0];
        node.rule = {
          effect: "ENABLE",
          condition: jsonFormsCondition(c),
        };
      } else {
        const readOnly = propReadOnlyWhen(program, prop);
        if (readOnly.length === 1) {
          const c = readOnly[0];
          node.rule = {
            effect: "DISABLE",
            condition: jsonFormsCondition(c),
          };
        }
      }
    }

    return node;
  };

  const props =
    block.model.kind === "Model" ? layoutProps(program, block.model) : [];
  const elements: UiNode[] = [];
  const documentedStaticSections = block.sections
    ? [...block.sections.members.values()].filter(
        (member) =>
          getDoc(program, member) &&
          !props.some(
            (prop) => propSection(program, prop)?.name === member.name,
          ),
      )
    : [];

  if (documentedStaticSections.length && block.sections) {
    const emitted = new Set<string>();
    for (const member of block.sections.members.values()) {
      const description = getDoc(program, member);
      const members = props.filter(
        (prop) => propSection(program, prop)?.name === member.name,
      );
      if (!members.length && description)
        elements.push({ type: "Label", text: description });
      for (const prop of members) {
        elements.push(nodeForProperty(prop));
        emitted.add(prop.name);
      }
    }
    for (const prop of props)
      if (!emitted.has(prop.name)) elements.push(nodeForProperty(prop));
  } else {
    elements.push(...props.map(nodeForProperty));
  }

  const group: UiNode = { type: "Group", elements };
  if (block.label) group.label = block.label;
  else if (block.doc) group.label = block.doc;
  return applyOverrides(group, block.overrides);
}
