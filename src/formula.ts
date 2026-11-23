import type {
  Model,
  ModelProperty,
  Program,
  Tuple,
  Type,
} from "@typespec/compiler";
import { reportDiagnostic, stateKeys } from "./lib.js";

export type FormulaName = "sum" | "subtract" | "percentOf";

/** What a `@Formula` decorator records: the formula, and its sources as written. */
export interface DeclaredFormula {
  name: FormulaName;
  sources: (ModelProperty | Tuple)[];
}

/**
 * One of a formula's sources. `fields` are the fields it reads, from the first to the last,
 * each as declared: a field copied by `model … is` or a spread is its original.
 *
 * When `from` is undefined, the first field is on the formula's own model: read the path
 * from the formula's place in the form, so each copy of the model reads its own answers.
 * Otherwise `from` is the model containing the formula that the path starts on: read the
 * path from the nearest place that model has.
 */
export interface FormulaSource {
  from?: Model;
  fields: ModelProperty[];
}

/** A field's formula, with its sources in the order the formula takes them. */
export interface Formula {
  name: FormulaName;
  sources: FormulaSource[];
}

/** A problem with a formula, as a diagnostic to report on its field. */
interface Problem {
  code:
    | "formula-path-invalid"
    | "formula-source-unreachable"
    | "formula-block-mismatch"
    | "formula-block-percent"
    | "formula-reads-block";
  format: Record<string, string>;
}

const declaredFormula = (p: Program, prop: ModelProperty) =>
  p.stateMap(stateKeys.formula).get(prop) as DeclaredFormula | undefined;

/**
 * A field's formula, or undefined when it has none or has a problem `$onValidate` reports. Formulas on a block answer apply field by field: see
 * `formulaBlock` and `formulaBlockFields`.
 */
export function propFormula(
  p: Program,
  prop: ModelProperty,
): Formula | undefined {
  const declared = declaredFormula(p, prop);
  if (!declared || formulaProblem(p, prop, declared)) return undefined;
  return {
    name: declared.name,
    sources: declared.sources.map(
      (s) => resolveSource(prop, s) as FormulaSource,
    ),
  };
}

/**
 * The block a formula on this type works on field by field: a model that isn't a list.
 * Undefined for anything else.
 */
export function formulaBlock(type: Type): Model | undefined {
  return type.kind === "Model" && !type.indexer ? type : undefined;
}

/**
 * The fields a formula on `block` calculates, each as the fields from the block down to it:
 * every field the block doesn't calculate itself, through nested blocks. The block's own
 * formulas then run on the results.
 */
export function formulaBlockFields(
  p: Program,
  block: Model,
  seen: Model[] = [],
): ModelProperty[][] {
  const out: ModelProperty[][] = [];
  for (const field of allProperties(block)) {
    if (declaredFormula(p, field)) continue;
    const inner = formulaBlock(field.type);
    if (!inner) out.push([field]);
    else if (!seen.includes(inner))
      out.push(
        ...formulaBlockFields(p, inner, [...seen, block]).map((path) => [
          field,
          ...path,
        ]),
      );
  }
  return out;
}

/**
 * Report formulas whose sources aren't paths a formula can read, block formulas whose
 * sources don't line up, and formulas that read each other in a loop.
 */
export function checkFormulas(p: Program): void {
  const formulas = new Map<ModelProperty, Formula>();
  for (const [target, declared] of p.stateMap(stateKeys.formula)) {
    const prop = target as ModelProperty;
    // A copy made by `model … is` or a spread repeats its original's formula, which is
    // checked once. A formula added to a copy with `@@Formula.…` is the copy's own.
    const repeated =
      prop.sourceProperty !== undefined &&
      p.stateMap(stateKeys.formula).has(origin(prop));
    const problem = repeated
      ? undefined
      : formulaProblem(p, prop, declared as DeclaredFormula);
    if (problem) {
      // Each code takes its own parameters; the problem was built with the ones it needs.
      reportDiagnostic(p, {
        code: problem.code,
        target: prop,
        format: { name: prop.name, ...problem.format },
      } as Parameters<typeof reportDiagnostic>[1]);
      continue;
    }
    const formula = propFormula(p, prop);
    if (formula) formulas.set(prop, formula);
  }
  checkCycles(p, formulas);
}

function formulaProblem(
  p: Program,
  prop: ModelProperty,
  declared: DeclaredFormula,
): Problem | undefined {
  const sources: FormulaSource[] = [];
  for (const source of declared.sources) {
    const resolved = resolveSource(prop, source);
    if ("code" in resolved) return resolved;
    sources.push(resolved);
  }
  const block = formulaBlock(prop.type);
  for (const { fields } of sources) {
    const source = fields.map((f) => f.name).join(".");
    const read = formulaBlock(valueType(fields.at(-1)!.type));
    if (block && declared.name === "percentOf")
      return { code: "formula-block-percent", format: { block: block.name } };
    if (block && (!read || !builtFrom(read, block)))
      return {
        code: "formula-block-mismatch",
        format: { block: block.name, source },
      };
    if (!block && read)
      return {
        code: "formula-reads-block",
        format: { source, block: read.name },
      };
  }
  return undefined;
}

/** Resolve a source to the fields it reads, or the problem with it. */
function resolveSource(
  prop: ModelProperty,
  source: ModelProperty | Tuple,
): FormulaSource | Problem {
  // The decorators' signatures accept only a field or a tuple of fields.
  const fields = (
    source.kind === "Tuple" ? source.values : [source]
  ) as ModelProperty[];
  const written = fields.map((f) => f.name).join(".");
  if (!fields.length)
    return {
      code: "formula-path-invalid",
      format: { source: "[]", reason: "a path needs at least one field" },
    };
  for (let i = 1; i < fields.length; i++) {
    const before = valueType(fields[i - 1].type);
    const field = origin(fields[i]);
    const match =
      before.kind === "Model" &&
      allProperties(before).find((f) => f.name === field.name);
    if (!match || origin(match) !== field)
      return {
        code: "formula-path-invalid",
        format: {
          source: written,
          reason: `${field.model?.name}.${field.name} isn't a field of ${fields[i - 1].name}`,
        },
      };
  }
  const owner = origin(prop).model!;
  const first = origin(fields[0]).model!;
  const declared = fields.map(origin);
  // A field the owner inherits with `extends` is on the owner too.
  if (first === owner || builtFrom(owner, first)) return { fields: declared };
  if (!contains(first, owner))
    return {
      code: "formula-source-unreachable",
      format: { model: first.name, field: fields[0].name, owner: owner.name },
    };
  return { from: first, fields: declared };
}

/**
 * Report each loop of formulas that read each other once, naming the loop. Every formula is
 * a node, copies included, so formulas added to a copy link up with each other.
 */
function checkCycles(p: Program, formulas: Map<ModelProperty, Formula>): void {
  // A formula reads every field on each source's path that has a formula of its own. A
  // first field on the formula's own model is that model's copy of it.
  const reads = (prop: ModelProperty) =>
    formulas
      .get(prop)!
      .sources.flatMap(({ from, fields }) =>
        fields
          .map((field, i) =>
            i === 0 && !from
              ? (allProperties(prop.model!).find((f) => origin(f) === field) ??
                field)
              : field,
          )
          .filter((f) => formulas.has(f)),
      );
  const reported = new Set<string>();
  const done = new Set<ModelProperty>();
  const visit = (
    prop: ModelProperty,
    path: ModelProperty[],
  ): ModelProperty[] | undefined => {
    const start = path.indexOf(prop);
    if (start >= 0) return [...path.slice(start), prop];
    if (done.has(prop)) return undefined;
    for (const next of reads(prop)) {
      const cycle = visit(next, [...path, prop]);
      if (cycle) return cycle;
    }
    done.add(prop);
    return undefined;
  };
  // Start from the formula declared first, since decorators run in the order references
  // resolve them, not the order they're written.
  const declaredFirst = [...formulas.keys()].sort(
    (a, b) => (a.node?.pos ?? 0) - (b.node?.pos ?? 0),
  );
  for (const prop of declaredFirst) {
    if (done.has(prop)) continue;
    const cycle = visit(prop, []);
    if (!cycle) continue;
    for (const member of cycle) done.add(member);
    // A copy repeats its original's loop; report it once.
    const key = cycle
      .map((f) => {
        const o = origin(f);
        return `${o.model?.name}.${o.name}`;
      })
      .sort()
      .join(" ");
    if (reported.has(key)) continue;
    reported.add(key);
    reportDiagnostic(p, {
      code: "formula-cycle",
      target: cycle[0],
      format: {
        name: cycle[0].name,
        cycle: cycle.map((f) => `${f.model?.name}.${f.name}`).join(" -> "),
      },
    });
  }
}

/** The property a copy made by `model … is` or a spread was made from. */
function origin(prop: ModelProperty): ModelProperty {
  while (prop.sourceProperty) prop = prop.sourceProperty;
  return prop;
}

/** A field's type, or its item type when it's a list. */
const valueType = (type: Type): Type =>
  type.kind === "Model" && type.indexer ? type.indexer.value : type;

/** Whether `model` is `target`, or was made from it by `is`, a spread or `extends`. */
function builtFrom(model: Model, target: Model): boolean {
  if (model === target) return true;
  if (model.baseModel && builtFrom(model.baseModel, target)) return true;
  return model.sourceModels.some((s) => builtFrom(s.model, target));
}

/** Whether `model` has a field, at any depth, holding `target` or a model made from it. */
function contains(
  model: Model,
  target: Model,
  seen = new Set<Model>(),
): boolean {
  if (seen.has(model)) return false;
  seen.add(model);
  return allProperties(model).some((prop) => {
    const type = valueType(prop.type);
    return (
      type.kind === "Model" &&
      (builtFrom(type, target) || contains(type, target, seen))
    );
  });
}

/** Own and inherited properties. */
function allProperties(model: Model): ModelProperty[] {
  const out: ModelProperty[] = [];
  for (let m: Model | undefined = model; m; m = m.baseModel)
    out.unshift(...m.properties.values());
  return out;
}
