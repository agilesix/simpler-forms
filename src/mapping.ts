import type {
  EnumMember,
  Model,
  ModelProperty,
  Program,
  Type,
} from "@typespec/compiler";
import { isArrayModelType } from "@typespec/compiler";
import {
  type MappingPathLink,
  modelMappedTo,
  modelMappingPaths,
  modelProperties,
  propMappedTo,
} from "./model.js";

/**
 * How a linked source property relates to its target:
 *
 *   leaf    a value, linked to a value
 *   object  an object, linked to an object; its children are linked within that object
 *   array   a list, linked to a list; for a list of objects, its children are linked within
 *           the target's item
 *   group   an object with no link of its own whose descendants are linked: flattened, its
 *           children landing in the parent's target
 */
export type MappingNodeKind = "leaf" | "object" | "array" | "group";

export interface MappingNode {
  /** Property names from the mapped model to this one, this one last. */
  sourcePath: string[];
  source: ModelProperty;
  /** What the source corresponds to. A group has none. */
  target?: ModelProperty;
  kind: MappingNodeKind;
  /** The linked properties below an object, a list of objects, or a group, in source order. */
  children: MappingNode[];
}

/** A model's mapping in one target, resolved through every model it composes. */
export interface ResolvedMapping {
  mapping: EnumMember;
  source: Model;
  target: Model;
  children: MappingNode[];
}

/** A link that does not hold, ready to report as a diagnostic. */
export interface MappingProblem {
  code:
    | "mapping-path-unresolved"
    | "mapping-target-out-of-context"
    | "mapping-type-mismatch"
    | "mapping-cardinality-mismatch"
    | "mapping-target-duplicate";
  target: Model | ModelProperty;
  format: Record<string, string>;
}

/**
 * `model`'s mapping in `mapping`, or undefined if `model` has no `@Mapping.to` in it.
 *
 * A property takes the first link that applies:
 *
 *   1. a `@Mapping.path` naming it, from the outermost composing model that has one
 *   2. its own `@Mapping.to`
 *
 * and an object-valued property then resolves its own properties against what it is linked
 * to, so a question linked once at the level its mapping is shared needs nothing more from
 * the forms that compose it. Links that do not hold are left out; `$onValidate` reports them.
 */
export function resolveMapping(
  program: Program,
  model: Model,
  mapping: EnumMember,
): ResolvedMapping | undefined {
  return resolveMappingWithProblems(program, model, mapping)?.resolved;
}

/** `resolveMapping`, with every link that did not hold. */
export function resolveMappingWithProblems(
  program: Program,
  model: Model,
  mapping: EnumMember,
): { resolved: ResolvedMapping; problems: MappingProblem[] } | undefined {
  const target = modelMappedTo(program, model, mapping);
  if (!target) return undefined;
  const walk: Walk = {
    program,
    mapping,
    problems: [],
    owned: [],
    consumed: new Set(),
  };
  const children = resolveModel(walk, model, target, [], [], new Map(), [
    model,
  ]);
  for (const { link, owner } of walk.owned) {
    if (walk.consumed.has(link)) continue;
    walk.problems.push({
      code: "mapping-path-unresolved",
      target: owner,
      format: {
        path: link.sourcePath,
        name: owner.name || "an anonymous model",
        reason: unresolvedReason(owner, link.sourcePath),
      },
    });
  }
  return {
    resolved: { mapping, source: model, target, children },
    problems: walk.problems,
  };
}

// ---------------------------------------------------------------------------

interface Walk {
  program: Program;
  mapping: EnumMember;
  problems: MappingProblem[];
  /** Every `@Mapping.path` met so far, with the model that declares it. */
  owned: { link: MappingPathLink; owner: Model }[];
  /** The ones that landed on a property. */
  consumed: Set<MappingPathLink>;
}

/** A `@Mapping.path` on its way down: the steps still to take from the current model. */
interface PendingPath {
  link: MappingPathLink;
  owner: Model;
  steps: string[];
}

/**
 * `model`'s linked properties, each resolved within `context`, the model `model` (or its
 * nearest linked ancestor, for a group) corresponds to.
 *
 * `claimed` is shared by everything that lands in one target object, groups included, so two
 * sources landing on one target property are caught wherever they were declared.
 */
function resolveModel(
  walk: Walk,
  model: Model,
  context: Model,
  inherited: PendingPath[],
  prefix: string[],
  claimed: Map<ModelProperty, string>,
  stack: Model[],
): MappingNode[] {
  const own = modelMappingPaths(walk.program, model, walk.mapping).map(
    (link) => {
      walk.owned.push({ link, owner: model });
      return { link, owner: model, steps: stepsOf(link.sourcePath) };
    },
  );
  // Outermost first, so `find` below prefers the composing model furthest out.
  const pending = [...inherited, ...own];
  const nodes: MappingNode[] = [];

  for (const source of modelProperties(model)) {
    const here = pending.filter((p) => p.steps[0] === source.name);
    const exact = here.filter((p) => p.steps.length === 1);
    for (const p of exact) walk.consumed.add(p.link);
    const deeper = here
      .filter((p) => p.steps.length > 1)
      .map((p) => ({ ...p, steps: p.steps.slice(1) }));
    const path = exact[0];
    const target =
      path?.link.mappedTo ?? propMappedTo(walk.program, source, walk.mapping);
    const sourcePath = [...prefix, source.name];
    const at = path?.owner ?? source;
    const shape = shapeOf(source.type);

    if (!target) {
      // Unlinked: flattened into the parent's target if anything below it is linked.
      if (!shape.object || shape.array || stack.includes(shape.object))
        continue;
      const children = resolveModel(
        walk,
        shape.object,
        context,
        deeper,
        sourcePath,
        claimed,
        [...stack, shape.object],
      );
      if (children.length)
        nodes.push({ sourcePath, source, kind: "group", children });
      continue;
    }

    const node = resolveLink(
      walk,
      source,
      target,
      context,
      deeper,
      sourcePath,
      at,
      stack,
    );
    if (!node) continue;
    const first = claimed.get(target);
    if (first !== undefined) {
      walk.problems.push({
        code: "mapping-target-duplicate",
        target: at,
        format: {
          mapping: walk.mapping.name,
          first,
          second: sourcePath.join("."),
          target: describe(target),
        },
      });
      continue;
    }
    claimed.set(target, sourcePath.join("."));
    nodes.push(node);
  }
  return nodes;
}

function resolveLink(
  walk: Walk,
  source: ModelProperty,
  target: ModelProperty,
  context: Model,
  deeper: PendingPath[],
  sourcePath: string[],
  at: Model | ModelProperty,
  stack: Model[],
): MappingNode | undefined {
  const fail = (code: MappingProblem["code"], format: Record<string, string>) =>
    void walk.problems.push({
      code,
      target: at,
      format: {
        mapping: walk.mapping.name,
        source: sourcePath.join("."),
        target: describe(target),
        ...format,
      },
    });

  if (!isMemberOf(target, context)) {
    fail("mapping-target-out-of-context", {
      context: context.name || "an anonymous model",
    });
    return undefined;
  }
  const from = shapeOf(source.type);
  const to = shapeOf(target.type);
  if (from.array !== to.array) {
    fail("mapping-cardinality-mismatch", {
      sourceShape: from.array ? "a list" : "a single value",
      targetShape: to.array ? "a list" : "a single value",
    });
    return undefined;
  }
  const kind = from.array ? "array" : from.object ? "object" : "leaf";
  if (!from.object) {
    if (to.object) {
      fail("mapping-type-mismatch", {
        reason: "the source is a value and the target is an object",
      });
      return undefined;
    }
    return { sourcePath, source, target, kind, children: [] };
  }
  if (!to.object) {
    fail("mapping-type-mismatch", {
      reason: "the source is an object and the target is a value",
    });
    return undefined;
  }
  const linked = modelMappedTo(walk.program, from.object, walk.mapping);
  if (linked && linked !== to.object) {
    fail("mapping-type-mismatch", {
      reason: `${from.object.name} maps to ${linked.name}, not ${to.object.name}`,
    });
    return undefined;
  }
  const children = stack.includes(from.object)
    ? []
    : resolveModel(
        walk,
        from.object,
        to.object,
        deeper,
        sourcePath,
        new Map(),
        [...stack, from.object],
      );
  return { sourcePath, source, target, kind, children };
}

/** Whether a type is a list, and the object it holds (directly or as each entry), if any. */
export function shapeOf(type: Type): { array: boolean; object?: Model } {
  if (type.kind !== "Model") return { array: false };
  if (isArrayModelType(type)) {
    const item = type.indexer!.value;
    return { array: true, object: item.kind === "Model" ? item : undefined };
  }
  return { array: false, object: type };
}

/**
 * Whether `target` is one of `context`'s properties. A property `context` has by spread or
 * `is` is a copy, so the copy's source counts too.
 */
function isMemberOf(target: ModelProperty, context: Model): boolean {
  return modelProperties(context).some((candidate) => {
    for (
      let p: ModelProperty | undefined = candidate;
      p;
      p = p.sourceProperty
    ) {
      if (p === target) return true;
    }
    return false;
  });
}

/** A dotted path's property names. A list is stepped through, so `[*]` is optional. */
const stepsOf = (path: string) =>
  path.split(".").map((step) => step.replace(/\[\*\]$/, ""));

const describe = (prop: ModelProperty) =>
  prop.model?.name ? `${prop.model.name}.${prop.name}` : prop.name;

/** Why a path that never landed did not: it names nothing, or nothing above it is linked. */
function unresolvedReason(model: Model, path: string): string {
  let current: Model | undefined = model;
  const steps = stepsOf(path);
  for (const [index, step] of steps.entries()) {
    if (!current) return `${steps.slice(0, index).join(".")} is not an object`;
    const prop: ModelProperty | undefined = modelProperties(current).find(
      (p) => p.name === step,
    );
    if (!prop) {
      const known = modelProperties(current)
        .map((p) => p.name)
        .slice(0, 8)
        .join(", ");
      return `${current.name || "the model"} has no property "${step}" (has ${known})`;
    }
    current = shapeOf(prop.type).object;
  }
  return "a list or a value on the way to it has no link of its own in this mapping, so it has no target to land in";
}
