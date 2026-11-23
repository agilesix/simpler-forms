import type { ModelProperty, Tuple } from "@typespec/compiler";
import type { DeclaredFormula, FormulaName } from "../formula.js";
import { reportDiagnostic, stateKeys } from "../lib.js";
import type { Ctx } from "./shared.js";

type Source = ModelProperty | Tuple;

/** Record a field's formula. A field takes one, since each formula writes the whole answer. */
function setFormula(
  ctx: Ctx,
  target: ModelProperty,
  name: FormulaName,
  sources: Source[],
): void {
  const formulas = ctx.program.stateMap(stateKeys.formula);
  if (formulas.has(target)) {
    reportDiagnostic(ctx.program, {
      code: "duplicate-formula",
      target: ctx.decoratorTarget,
      format: { name: target.name },
    });
    return;
  }
  formulas.set(target, { name, sources } satisfies DeclaredFormula);
}

export const $sum = (ctx: Ctx, target: ModelProperty, ...sources: Source[]) =>
  setFormula(ctx, target, "sum", sources);

export const $subtract = (
  ctx: Ctx,
  target: ModelProperty,
  from: Source,
  ...amounts: Source[]
) => setFormula(ctx, target, "subtract", [from, ...amounts]);

export const $percentOf = (
  ctx: Ctx,
  target: ModelProperty,
  amount: Source,
  percent: Source,
) => setFormula(ctx, target, "percentOf", [amount, percent]);
