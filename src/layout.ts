import type {
  DecoratorApplication,
  Diagnostic,
  DiagnosticTarget,
  Model,
  ModelProperty,
  Program,
  Type,
} from "@typespec/compiler";
import { type Node, SyntaxKind } from "@typespec/compiler/ast";
import { createDiagnostic } from "./lib.js";
import { literal } from "./decorators/shared.js";
import {
  type AtomicCondition,
  entryField,
  modelProperties,
  propEnabledWhen,
  propFlatten,
  propOmit,
  propReadOnlyWhen,
  propRequiredWhen,
  propVisibleWhen,
} from "./model.js";

/** A rule JSON Forms applies to one entry: the effect, while the condition holds. */
export interface LayoutCondition {
  effect: "SHOW" | "ENABLE" | "DISABLE";
  /** Its source path is relative to the entry's scope, as a JSON Forms rule's is. */
  condition: AtomicCondition;
}

/** One field placed by a layout. */
export interface FieldNode {
  kind: "field";
  entry: ModelProperty;
  /** The field's data path from the presented model, through list entries. */
  path: string[];
  /** The field at that occurrence. */
  prop: ModelProperty;
  /** The path of the list whose entries this field sits in; scopes are relative to it. */
  scopeBase: string[];
  /** The entries `@UI.field` lists for this field's contents, laid out before the rest. */
  listed?: LayoutNode[];
  flatten: boolean;
  condition?: LayoutCondition;
}

/** A group a layout makes up, holding only what it lists. */
export interface GroupNode {
  kind: "group";
  entry: ModelProperty;
  children: LayoutNode[];
  condition?: LayoutCondition;
}

export type LayoutNode = FieldNode | GroupNode;

export interface ResolvedLayout {
  layout: Model;
  presented: Model;
  /** One node per section, in order. */
  sections: LayoutNode[];
  /** Every path placed by an entry or omitted by one, as `a.b.c`. */
  placed: Set<string>;
  omitted: Set<string>;
  diagnostics: Diagnostic[];
}

/** Where the entries of one model of entries are resolved. */
interface Context {
  /** The type of the `@UI.field` being laid out, which relative references start from. */
  model?: Model;
  /** That field's path from the presented model. */
  path: string[];
  /** The entry laying it out, for messages. */
  label: string;
  /** The path of the enclosing list, which scopes are relative to. */
  scopeBase: string[];
}

/** The display conditions an entry can carry, and what each does while it holds. */
const CONDITIONS: Record<
  string,
  {
    effect: LayoutCondition["effect"];
    negated: boolean;
    /** The field is usable only while the predicate holds, rather than only while it does not. */
    whileTrue: boolean;
    verb: string;
  }
> = {
  "@visibleWhen": {
    effect: "SHOW",
    negated: false,
    whileTrue: true,
    verb: "shown when",
  },
  "@hiddenWhen": {
    effect: "SHOW",
    negated: true,
    whileTrue: false,
    verb: "hidden when",
  },
  "@enabledWhen": {
    effect: "ENABLE",
    negated: false,
    whileTrue: true,
    verb: "enabled when",
  },
  "@disabledWhen": {
    effect: "ENABLE",
    negated: true,
    whileTrue: false,
    verb: "disabled when",
  },
  "@readOnlyWhen": {
    effect: "DISABLE",
    negated: false,
    whileTrue: false,
    verb: "read-only when",
  },
};

const key = (path: string[]) => path.join(".");

const resolved = new WeakMap<Program, Map<Model, ResolvedLayout>>();

/**
 * Resolve a `@UI.layout` model: every reference to the occurrence it means, what each
 * entry places or omits, and the conditions entries set. Resolved once per program, so
 * validation and emission share one result.
 */
export function resolveLayout(
  program: Program,
  layout: Model,
  presented: Model,
): ResolvedLayout {
  let cache = resolved.get(program);
  if (!cache) resolved.set(program, (cache = new Map()));
  let result = cache.get(layout);
  if (!result)
    cache.set(layout, (result = resolve(program, layout, presented)));
  return result;
}

function resolve(
  program: Program,
  layout: Model,
  presented: Model,
): ResolvedLayout {
  const diagnostics: Diagnostic[] = [];
  const report = (
    code: Parameters<typeof createDiagnostic>[0]["code"],
    target: DiagnosticTarget,
    format: Record<string, string>,
    messageId?: string,
  ) =>
    diagnostics.push(
      createDiagnostic({ code, target, format, messageId } as Parameters<
        typeof createDiagnostic
      >[0]),
    );

  const placed = new Map<string, ModelProperty>();
  const omitted = new Set<string>();
  const sourcesRead: { entry: ModelProperty; source: string[] }[] = [];

  const place = (path: string[], entry: ModelProperty) => {
    if (placed.has(key(path)))
      report("layout-placed-twice", entry, {
        path: key(path),
        layout: layout.name,
      });
    placed.set(key(path), entry);
  };

  /**
   * The occurrence a reference means. The compiler has resolved it to a property; this
   * finds which occurrence of that property: relative to the field being laid out here,
   * or absolute from the presented model.
   */
  const resolveRef = (
    node: Node | undefined,
    property: Type,
    ctx: Context,
    target: ModelProperty,
  ): { path: string[]; prop: ModelProperty } | undefined => {
    // A reference the compiler could not resolve is already an error of its own.
    if (property.kind !== "ModelProperty") return undefined;
    const ref = node && parseRef(node);
    if (!ref) return undefined;
    if (ctx.model) {
      const found = walk(ctx.model, ref.steps);
      if (found && sameProperty(found, property))
        return { path: [...ctx.path, ...ref.steps], prop: found };
    }
    const found = walk(presented, ref.steps);
    if (found && sameProperty(found, property)) {
      if (!startsWith(ref.steps, ctx.scopeBase)) {
        report(
          "layout-ref-root",
          target,
          { ref: ref.text, list: key(ctx.scopeBase) },
          "list",
        );
        return undefined;
      }
      return { path: ref.steps, prop: found };
    }
    report("layout-ref-root", target, {
      ref: ref.text,
      root: ref.root,
      here: ctx.model
        ? `${ctx.model.name || "the field's type"} (from ${ctx.label})`
        : presented.name,
      start: ctx.model?.name || presented.name,
      presented: presented.name,
    });
    return undefined;
  };

  /** A placing entry is named for its field, or for a step on the way to it. */
  const checkName = (entry: ModelProperty, path: string[]) => {
    if (path.includes(entry.name)) return;
    report("layout-entry-name", entry, {
      name: entry.name,
      path: key(path),
      field: path[path.length - 1],
    });
  };

  /** Validity belongs to the submission, which every layout of it shares. */
  const checkNoValidation = (entry: ModelProperty) => {
    for (const app of entry.decorators) {
      const definition = app.definition;
      if (definition?.namespace.name !== "Validation") continue;
      report("layout-validation", entry, {
        decorator: definition.name.slice(1),
        name: entry.name,
        presented: presented.name,
      });
    }
  };

  /** The display condition an entry sets, if any, with its source resolved like a reference. */
  const conditionOf = (
    entry: ModelProperty,
    ctx: Context,
    target?: { path: string[]; prop: ModelProperty },
  ): LayoutCondition | undefined => {
    const apps = entry.decorators.filter(
      (app) =>
        app.definition?.namespace.name === "UI" &&
        app.definition.name in CONDITIONS,
    );
    if (!apps.length) return undefined;
    if (apps.length > 1)
      report("layout-condition-count", entry, {
        name: entry.name,
        count: String(apps.length),
      });
    const app = apps[apps.length - 1];
    const kind = CONDITIONS[app.definition!.name];
    const source = resolveRef(
      sourceNode(app),
      app.args[0]?.value as Type,
      ctx,
      entry,
    );
    if (!source) return undefined;
    const value = literal(app.args[1]?.jsValue);
    const text = `${kind.verb} ${key(source.path)} = ${String(value)}`;
    sourcesRead.push({ entry, source: source.path });

    if (target) {
      const t = key(target.path);
      const s = key(source.path);
      if (s === t || s.startsWith(`${t}.`))
        report("layout-condition-self", entry, { name: entry.name, source: s });

      if (ownConditionCount(program, target.prop))
        report("layout-condition-replaces", entry, {
          name: entry.name,
          field: target.prop.name,
        });

      const required = requiredness(program, target.prop, target.path);
      const same = (r: { source: string; value: unknown }) =>
        r.source === s && r.value === value;
      if (required === "always")
        report(
          "layout-condition-hides-required",
          entry,
          { name: entry.name, condition: text },
          "always",
        );
      else if (kind.whileTrue && required.some((r) => !same(r)))
        report(
          "layout-condition-hides-required",
          entry,
          {
            name: entry.name,
            required: required
              .map((r) => `${r.source} = ${String(r.value)}`)
              .join(" or "),
            condition: `${key(source.path)} = ${String(value)}`,
          },
          "narrower",
        );
      else if (!kind.whileTrue && required.some(same))
        report(
          "layout-condition-hides-required",
          entry,
          { name: entry.name, condition: `${s} = ${String(value)}` },
          "inverted",
        );
    }

    const sourceIsArray =
      source.prop.type.kind === "Model" && !!source.prop.type.indexer;
    const sourcePath = source.path.slice(ctx.scopeBase.length);
    return {
      effect: kind.effect,
      condition: kind.negated
        ? {
            operator: "notEquals",
            sourcePath,
            sourceIsArray,
            value,
            ...(app.definition!.name === "@hiddenWhen"
              ? { requiresAnswer: true }
              : {}),
          }
        : { operator: "equals", sourcePath, sourceIsArray, value },
    };
  };

  /** One entry of a model of entries. */
  const entryNode = (
    entry: ModelProperty,
    ctx: Context,
  ): LayoutNode | undefined => {
    checkNoValidation(entry);
    const bound = entryField(program, entry);
    const type = entry.type;

    if (type.kind === "ModelProperty") {
      const r = resolveRef(refNode(entry), type, ctx, entry);
      if (!r) return undefined;
      checkName(entry, r.path);
      if (propOmit(program, entry)) {
        omitted.add(key(r.path));
        return undefined;
      }
      place(r.path, entry);
      return fieldNode(entry, r, ctx);
    }

    if (type.kind !== "Model") {
      if (type.kind !== "Intrinsic")
        report("layout-entry-invalid", entry, { name: entry.name });
      return undefined;
    }

    if (!bound) {
      const children = entries(type, ctx);
      return {
        kind: "group",
        entry,
        children,
        condition: conditionOf(entry, ctx),
      };
    }

    const r = resolveRef(bound.node, bound.field, ctx, entry);
    if (!r) return undefined;
    checkName(entry, r.path);
    if (propOmit(program, entry)) {
      omitted.add(key(r.path));
      return undefined;
    }
    place(r.path, entry);
    const inner = behind(r.prop.type);
    const listed = inner
      ? entries(type, {
          model: inner,
          path: r.path,
          label: entry.name,
          scopeBase: isList(r.prop.type) ? r.path : ctx.scopeBase,
        })
      : [];
    return { ...fieldNode(entry, r, ctx), listed };
  };

  const fieldNode = (
    entry: ModelProperty,
    r: { path: string[]; prop: ModelProperty },
    ctx: Context,
  ): FieldNode => {
    const flatten = propFlatten(program, entry);
    if (flatten && (!behind(r.prop.type) || isList(r.prop.type)))
      report("layout-flatten-leaf", entry, { name: entry.name });
    return {
      kind: "field",
      entry,
      path: r.path,
      prop: r.prop,
      scopeBase: ctx.scopeBase,
      flatten,
      condition: conditionOf(entry, ctx, r),
    };
  };

  const entries = (container: Model, ctx: Context): LayoutNode[] =>
    [...container.properties.values()]
      .map((entry) => entryNode(entry, ctx))
      .filter((node): node is LayoutNode => !!node);

  const sections: LayoutNode[] = [];
  const root: Context = { path: [], label: layout.name, scopeBase: [] };
  for (const section of layout.properties.values()) {
    // A field left out of every section is the one reference a layout may make at the top.
    const omittedField =
      section.type.kind === "ModelProperty" && propOmit(program, section);
    if (section.type.kind !== "Model" && !omittedField) {
      checkNoValidation(section);
      report("layout-section-not-group", section, {
        layout: layout.name,
        name: section.name,
      });
      continue;
    }
    const node = entryNode(section, root);
    if (node) sections.push(node);
  }

  for (const prop of modelProperties(presented)) {
    if (propOmit(program, prop)) continue;
    if (placed.has(prop.name) || omitted.has(prop.name)) continue;
    const parts = [...placed.keys()].filter((k) =>
      k.startsWith(`${prop.name}.`),
    );
    report(
      "layout-unplaced",
      layout,
      {
        presented: presented.name,
        field: prop.name,
        layout: layout.name,
        parts: parts.join(", "),
      },
      parts.length ? "partial" : undefined,
    );
  }

  for (const { entry, source } of sourcesRead) {
    const s = key(source);
    if ([...omitted].some((o) => s === o || s.startsWith(`${o}.`)))
      report("layout-condition-source-omitted", entry, {
        name: entry.name,
        source: s,
      });
  }

  return {
    layout,
    presented,
    sections,
    placed: new Set(placed.keys()),
    omitted,
    diagnostics,
  };
}

// --- references -----------------------------------------------------------

/** The syntax of a field reference used as an entry's type. */
const refNode = (entry: ModelProperty): Node | undefined => {
  const node = entry.node;
  return node?.kind === SyntaxKind.ModelProperty ? node.value : undefined;
};

/** The syntax of a condition decorator's source argument. */
const sourceNode = (app: DecoratorApplication): Node | undefined =>
  app.node && "arguments" in app.node ? app.node.arguments[0] : undefined;

interface Segment {
  selector: "" | "." | "::";
  name: string;
}

function segments(node: Node): Segment[] | undefined {
  switch (node.kind) {
    case SyntaxKind.TypeReference:
      return segments(node.target);
    case SyntaxKind.MemberExpression: {
      const base = segments(node.base);
      return base && [...base, { selector: node.selector, name: node.id.sv }];
    }
    case SyntaxKind.Identifier:
      return [{ selector: "", name: node.sv }];
    default:
      return undefined;
  }
}

/**
 * The property steps of `A.b::type.c`, and the text of what they start from. `::type`
 * navigates to a property's type; it is not a step of its own.
 */
function parseRef(
  node: Node,
): { steps: string[]; root: string; text: string } | undefined {
  const segs = segments(node);
  if (!segs) return undefined;
  const first = segs.findIndex(
    (s, i) =>
      i > 0 &&
      s.selector === "." &&
      (segs[i + 1]?.selector === "::" || i === segs.length - 1),
  );
  if (first < 0) return undefined;
  const text = (list: Segment[]) =>
    list.map((s) => s.selector + s.name).join("");
  return {
    steps: segs
      .slice(first)
      .filter((s) => s.selector === ".")
      .map((s) => s.name),
    root: text(segs.slice(0, first)),
    text: text(segs),
  };
}

/** The same property, or one copied from the other by a spread, `is` or `OmitProperties`. */
function sameProperty(found: ModelProperty, wanted: ModelProperty): boolean {
  for (let p: ModelProperty | undefined = found; p; p = p.sourceProperty)
    if (p === wanted) return true;
  for (let p: ModelProperty | undefined = wanted; p; p = p.sourceProperty)
    if (p === found) return true;
  return false;
}

/** Follow property names from `model`, through list entries, to where they end. */
function walk(model: Model, steps: string[]): ModelProperty | undefined {
  let current: Model | undefined = model;
  let prop: ModelProperty | undefined;
  for (const step of steps) {
    prop = current && modelProperties(current).find((p) => p.name === step);
    if (!prop) return undefined;
    current = behind(prop.type);
  }
  return prop;
}

/** The object a field holds, directly or as a list's entries. */
export function behind(type: Type): Model | undefined {
  if (type.kind !== "Model") return undefined;
  if (!type.indexer) return type;
  return type.indexer.value.kind === "Model" ? type.indexer.value : undefined;
}

export const isList = (type: Type) => type.kind === "Model" && !!type.indexer;

const startsWith = (path: string[], prefix: string[]) =>
  prefix.every((step, i) => path[i] === step);

// --- what the submission says about a field -------------------------------

const ownConditionCount = (program: Program, prop: ModelProperty) =>
  propVisibleWhen(program, prop).length +
  propEnabledWhen(program, prop).length +
  propReadOnlyWhen(program, prop).length;

/** When the submission requires a field: always, or under each of these conditions. */
function requiredness(
  program: Program,
  prop: ModelProperty,
  path: string[],
): "always" | { source: string; value: unknown }[] {
  if (!prop.optional) return "always";
  return propRequiredWhen(program, prop).flatMap((c) =>
    c.operator === "equals"
      ? [
          {
            source: key([...path.slice(0, -1), ...c.sourcePath]),
            value: c.value,
          },
        ]
      : [],
  );
}
