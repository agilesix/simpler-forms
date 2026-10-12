import type { Diagnostic, Program } from "@typespec/compiler";
import { getDoc } from "@typespec/compiler";
import { createDiagnostic } from "../lib.js";
import {
  type FieldNode,
  type LayoutNode,
  type ResolvedLayout,
  behind,
  isList,
} from "../layout.js";
import {
  modelLabel,
  propHelpText,
  propLabel,
  propWidget,
  readBlock,
} from "../model.js";
import {
  type UiNode,
  emitBlockUi,
  jsonFormsCondition,
  layoutSource,
  propertyUi,
  rescopeUi,
} from "./block-ui.js";

const key = (path: string[]) => path.join(".");

const emitted = new WeakMap<
  ResolvedLayout,
  { ui: UiNode; diagnostics: Diagnostic[] }
>();

/**
 * The JSON Forms UI for a layout. Each section is a top-level labelled Group. A field is laid
 * out as its model lays it out, less whatever the layout places elsewhere or omits, with the
 * entry's label, help text, widget and condition on top.
 */
export function emitLayoutUi(
  program: Program,
  layout: ResolvedLayout,
): { ui: UiNode; diagnostics: Diagnostic[] } {
  let result = emitted.get(layout);
  if (!result) emitted.set(layout, (result = build(program, layout)));
  return result;
}

function build(
  program: Program,
  layout: ResolvedLayout,
): { ui: UiNode; diagnostics: Diagnostic[] } {
  const excluded = [...layout.placed, ...layout.omitted];
  /** What is placed elsewhere or omitted from inside the field at `path`. */
  const excludedUnder = (path: string[]) =>
    excluded.filter((k) => k.startsWith(`${key(path)}.`));

  const help = (entry: FieldNode["entry"]) =>
    propHelpText(program, entry) ?? getDoc(program, entry);

  /** Apply what an entry says about how its field is presented. */
  const present = (
    ui: UiNode,
    node: LayoutNode,
    fallbackLabel?: string,
  ): UiNode => {
    const out: UiNode = { ...ui };
    const label = propLabel(program, node.entry) ?? fallbackLabel;
    if (label) out.label = label;
    const description = help(node.entry);
    const widget = propWidget(program, node.entry);
    if (description || widget)
      out.options = {
        ...(out.options ?? {}),
        ...(description ? { description } : {}),
        ...(widget ? { widget } : {}),
      };
    // A layout's condition replaces the field's own for this occurrence.
    if (node.condition)
      out.rule = {
        effect: node.condition.effect,
        condition: jsonFormsCondition(node.condition.condition),
      };
    return out;
  };

  /** The fields of `node`'s type that no entry lists, in their model's order. */
  const remaining = (node: FieldNode): UiNode[] => {
    const inner = behind(node.prop.type);
    if (!inner) return [];
    const list = isList(node.prop.type);
    const base = list ? node.path : node.scopeBase;
    const steps = list ? [] : node.path.slice(node.scopeBase.length);
    const own = emitBlockUi(program, layoutSource(program, inner));
    // A single-value question has no fields to lay out.
    if (!own.elements) return [];
    return own.elements
      .map((child) => rescopeAll(child, steps))
      .map((child) => prune(child, base, excludedUnder(node.path)))
      .filter((child): child is UiNode => !!child);
  };

  const fieldUi = (node: FieldNode): UiNode[] => {
    const own = rescopeAll(
      propertyUi(program, node.prop),
      node.path.slice(node.scopeBase.length, -1),
    );
    let ui: UiNode | undefined;
    if (node.listed) {
      const elements = [...node.listed.flatMap(nodeUi), ...remaining(node)];
      if (isList(node.prop.type)) {
        ui = {
          ...own,
          options: {
            ...(own.options ?? {}),
            detail: { type: "Group", elements },
          },
        };
      } else if (own.type === "Group") {
        ui = { ...own, elements };
      } else {
        // A field that lays out as one Control becomes a Group once a layout lists entries in it.
        const inner = behind(node.prop.type);
        const label =
          propLabel(program, node.prop) ??
          (inner ? modelLabel(program, inner) : undefined);
        const description = getDoc(program, node.prop);
        ui = {
          type: "Group",
          ...(label ? { label } : {}),
          elements,
          ...(description ? { options: { description } } : {}),
        };
      }
    } else {
      ui = prune(own, node.scopeBase, excludedUnder(node.path));
    }
    if (!ui) return [];
    ui = present(ui, node);
    if (node.flatten && ui.type === "Group" && !isList(node.prop.type)) {
      const rule = ui.rule;
      return (ui.elements ?? []).map((child) =>
        rule && !child.rule ? { ...child, rule } : child,
      );
    }
    return [ui];
  };

  const nodeUi = (node: LayoutNode): UiNode[] =>
    node.kind === "field"
      ? fieldUi(node)
      : [
          present(
            { type: "Group", elements: node.children.flatMap(nodeUi) },
            node,
            node.entry.name,
          ),
        ];

  /** A section is always a labelled Group, so a renderer shows it as one. */
  const sectionUi = (node: LayoutNode): UiNode[] => {
    const flat = node.kind === "field" ? { ...node, flatten: false } : node;
    return nodeUi(flat).map((ui) => {
      if (ui.type === "Group" && ui.label) return ui;
      if (ui.type === "Group") return { ...ui, label: node.entry.name };
      const { rule, ...control } = ui;
      const label =
        propLabel(program, node.entry) ??
        (node.kind === "field"
          ? (propLabel(program, node.prop) ?? node.prop.name)
          : node.entry.name);
      return {
        type: "Group",
        label,
        elements: [control],
        ...(rule ? { rule } : {}),
      };
    });
  };

  const block = readBlock(program, layout.presented);
  const label =
    modelLabel(program, layout.layout) ?? block?.label ?? block?.doc;
  const ui: UiNode = {
    type: "Group",
    elements: layout.sections.flatMap(sectionUi),
    ...(label ? { label } : {}),
  };

  return { ui, diagnostics: duplicateLabels(layout, ui) };
}

/** Re-prefix a node's scopes with each of `steps`, outermost first. */
function rescopeAll(node: UiNode, steps: string[]): UiNode {
  return [...steps].reverse().reduce(rescopeUi, node);
}

/** The data path a Control's scope addresses, relative to its root. */
function dataPath(scope: string): string[] {
  const tokens = scope.replace(/^#\/?/, "").split("/").filter(Boolean);
  const path: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "properties" && tokens[i + 1]) path.push(tokens[++i]);
  }
  return path;
}

/**
 * Drop every Control whose path is excluded, and any Group left empty by that. `base` is the
 * path the node's scopes are relative to.
 */
function prune(
  node: UiNode,
  base: string[],
  excluded: string[],
): UiNode | undefined {
  if (!excluded.length) return node;
  const out: UiNode = { ...node };
  if (node.scope) {
    const path = key([...base, ...dataPath(node.scope)]);
    if (excluded.some((e) => path === e || path.startsWith(`${e}.`)))
      return undefined;
    const detail = node.options?.detail as UiNode | undefined;
    if (detail) {
      const pruned = prune(detail, path ? path.split(".") : base, excluded);
      out.options = {
        ...node.options,
        detail: pruned ?? { ...detail, elements: [] },
      };
    }
  }
  if (node.elements) {
    out.elements = node.elements
      .map((child) => prune(child, base, excluded))
      .filter((child): child is UiNode => !!child);
    if (node.elements.length && !out.elements.length) return undefined;
  }
  return out;
}

/** Sibling entries that render under one label, which an applicant cannot tell apart. */
function duplicateLabels(layout: ResolvedLayout, ui: UiNode): Diagnostic[] {
  const out: Diagnostic[] = [];
  const name = (node: UiNode) =>
    node.label ?? (node.scope ? dataPath(node.scope).slice(-1)[0] : undefined);
  const visit = (node: UiNode, where: string) => {
    const seen = new Map<string, UiNode>();
    for (const child of node.elements ?? []) {
      const label = name(child);
      const first = label === undefined ? undefined : seen.get(label);
      if (label !== undefined && first)
        out.push(
          createDiagnostic({
            code: "layout-duplicate-label",
            target: layout.layout,
            format: {
              where,
              label,
              first: describe(first),
              second: describe(child),
            },
          }),
        );
      else if (label !== undefined) seen.set(label, child);
      visit(child, child.label ?? where);
      const detail = child.options?.detail as UiNode | undefined;
      if (detail) visit(detail, label ?? where);
    }
  };
  visit(ui, layout.layout.name);
  return out;
}

const describe = (node: UiNode) =>
  node.scope ?? (node.label ? `the group "${node.label}"` : "a group");
