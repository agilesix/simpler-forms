// The JS that implements the `extern dec` declarations below. Imported here rather than
// only from `main.tsp` so that this file type-checks on its own -- an editor opens one
// file, not an entry point, and an unimplemented `extern dec` is an error.
import "../dist/src/index.js";

using TypeSpec.Reflection;

/**
 * Answers calculated from other answers, like a budget's totals. Each formula has a
 * decorator of its own, and the order formulas run in follows from what each one reads.
 */
namespace SimplerForms.Formula;

/**
 * A field, or a path of fields written as a tuple: `[Form.lines, Line.amount]`. Each field in
 * a tuple is a field of the one before it, and a list in the path means every item. The
 * first field is on the formula's own model, read from the formula's place in the form, or
 * on a model that contains it.
 */
alias Source = ModelProperty | ModelProperty[];

/**
 * Add up `sources`. One source copies it.
 *
 * When the answer is a block, add up each of its fields from the same field of every source,
 * except the fields the block calculates itself: those are worked out from the totals.
 *
 * ```typespec
 * @Formula.sum(Budget.federal, Budget.nonFederal) total?: Money;
 * @Formula.sum([Budget.lines, Line.amount]) linesTotal?: Money;
 * @Formula.sum(Budget.lines) lineTotals?: Line;
 * ```
 */
extern dec sum(target: ModelProperty, ...sources: Source[]);

/**
 * `from` minus each of `amounts`. When the answer is a block, subtract field by field, as
 * `sum` adds.
 *
 * @param from The amount to subtract from.
 * @param amounts The amounts to subtract.
 */
extern dec subtract(target: ModelProperty, from: Source, ...amounts: Source[]);

/**
 * `percent`% of `amount`.
 *
 * @param amount The amount to take a percentage of.
 * @param percent A whole-number percentage: 5 means 5%.
 */
extern dec percentOf(target: ModelProperty, amount: Source, percent: Source);
