import type {
  Diagnostic,
  EnumMember,
  Model,
  ModelProperty,
  Program,
} from "@typespec/compiler";
import { createDiagnostic } from "./lib.js";
import { type MappingNode, type ResolvedMapping, shapeOf } from "./mapping.js";
import {
  allMappingFromLinks,
  modelProperties,
  propMappedFrom,
} from "./model.js";

/**
 * `form`'s mapping in `mapping`, read from the `@Mapping.from` links on its target, or
 * undefined if no target model names `form`.
 *
 * The result is the tree `resolveMapping` builds from `@Mapping.to`, keyed by the form's
 * properties, so an emitter can read either. Each target property is filled from the field
 * its `@Mapping.from` names, found among the fields of the one its parent is filled from; one
 * found below a field with no element of its own lands in a group. A target property with
 * no `@Mapping.from` whose own properties are filled is a wrapper element, which a tree keyed
 * by the form's properties cannot hold: it is left out, with a `mapping-from-wrapper` problem
 * for an emitter whose output cannot hold it either to report.
 */
export function resolveMappingFrom(
  program: Program,
  form: Model,
  mapping: EnumMember,
): { resolved: ResolvedMapping; problems: Diagnostic[] } | undefined {
  const target = mappedFromRoot(program, form, mapping);
  if (!target) return undefined;
  const problems: Diagnostic[] = [];

  const walk = (
    into: Model,
    from: Model,
    prefix: string[],
    stack: Model[],
  ): MappingNode[] => {
    const nodes: MappingNode[] = [];
    for (const element of modelProperties(into)) {
      const to = shapeOf(element.type);
      const sources = propMappedFrom(program, element, mapping);
      if (!sources.length) {
        if (!to.object || to.array || stack.includes(to.object)) continue;
        // Structure: its own elements are filled from the same field as its parent.
        const inner = walk(to.object, from, prefix, [...stack, to.object]);
        if (inner.length)
          problems.push(
            createDiagnostic({
              code: "mapping-from-wrapper",
              target: element,
              format: {
                mapping: mapping.name,
                target: describe(element),
                context: from.name || "an anonymous model",
              },
            }),
          );
        continue;
      }
      const path = sources
        .map((source) => pathTo(from, source))
        .find((found) => found !== undefined);
      if (!path) {
        problems.push(
          createDiagnostic({
            code: "mapping-from-unresolved",
            target: element,
            format: {
              mapping: mapping.name,
              target: describe(element),
              source: sources.map(describe).join(" or "),
              context: from.name || "an anonymous model",
            },
          }),
        );
        continue;
      }
      const source = path.at(-1)!;
      const sourcePath = [...prefix, ...path.map((p) => p.name)];
      const shape = shapeOf(source.type);
      if (shape.array !== to.array) {
        problems.push(
          createDiagnostic({
            code: "mapping-from-cardinality-mismatch",
            target: element,
            format: {
              mapping: mapping.name,
              target: describe(element),
              source: sourcePath.join("."),
              targetShape: to.array ? "a list" : "a single value",
              sourceShape: shape.array ? "a list" : "a single value",
            },
          }),
        );
        continue;
      }
      const children =
        shape.object && to.object && !stack.includes(to.object)
          ? walk(to.object, shape.object, sourcePath, [...stack, to.object])
          : [];
      insert(nodes, path, prefix, {
        sourcePath,
        source,
        target: element,
        kind: shape.array ? "array" : shape.object ? "object" : "leaf",
        children,
      });
    }
    return nodes;
  };

  const children = walk(target, form, [], [target]);
  return {
    resolved: { mapping, source: form, target, children },
    problems,
  };
}

/** The target model that names `form` with `@Mapping.from` in `mapping`. */
export function mappedFromRoot(
  program: Program,
  form: Model,
  mapping: EnumMember,
): Model | undefined {
  for (const [target, links] of allMappingFromLinks(program))
    if (
      target.kind === "Model" &&
      links.some((link) => link.mapping === mapping && link.source === form)
    )
      return target;
  return undefined;
}

/**
 * The properties from `model` to `field`, `field` last: a property of `model` itself, or one
 * below an object property of it with no element of its own. A copy made by spread or `is`
 * counts as the property it was copied from.
 */
function pathTo(
  model: Model,
  field: ModelProperty,
  seen: Model[] = [],
): ModelProperty[] | undefined {
  for (const prop of modelProperties(model))
    if (copies(prop, field)) return [prop];
  for (const prop of modelProperties(model)) {
    const shape = shapeOf(prop.type);
    if (!shape.object || shape.array || seen.includes(shape.object)) continue;
    const below = pathTo(shape.object, field, [...seen, model]);
    if (below) return [prop, ...below];
  }
  return undefined;
}

const copies = (prop: ModelProperty, field: ModelProperty) => {
  for (let p: ModelProperty | undefined = prop; p; p = p.sourceProperty)
    if (p === field) return true;
  return false;
};

/** Adds `node` under group nodes for each property `path` passes through on the way to it. */
function insert(
  nodes: MappingNode[],
  path: ModelProperty[],
  prefix: string[],
  node: MappingNode,
): void {
  let level = nodes;
  const steps = [...prefix];
  for (const prop of path.slice(0, -1)) {
    steps.push(prop.name);
    let group = level.find((n) => n.kind === "group" && n.source === prop);
    if (!group) {
      group = {
        sourcePath: [...steps],
        source: prop,
        kind: "group",
        children: [],
      };
      level.push(group);
    }
    level = group.children;
  }
  level.push(node);
}

const describe = (prop: ModelProperty) =>
  prop.model?.name ? `${prop.model.name}.${prop.name}` : prop.name;
