// The JS that implements the `extern dec` declarations below. Imported here rather than
// only from `main.tsp` so that this file type-checks on its own -- an editor opens one
// file, not an entry point, and an unimplemented `extern dec` is an error.
import "../dist/src/index.js";
import "./types.tsp";

using TypeSpec.Reflection;

namespace SimplerForms.Validation;

/** Apply source-specific limits to this use of a reusable question without changing its identity. */
extern dec constraints(
  target: ModelProperty,
  patch: valueof ValidationConstraints
);

/**
 * Declare array values that must be the only selected value when present.
 *
 * This models source-defined choices such as "None" and "Do Not Wish to Provide"
 * without assigning those presentation mechanics a new semantic identity.
 */
extern dec exclusiveValues(target: ModelProperty, ...values: valueof unknown[]);

/** Apply constraints only when a sibling field equals the declared value. */
extern dec constraintsWhen(
  target: ModelProperty,
  source: ModelProperty,
  equals: valueof unknown,
  patch: valueof ValidationConstraints
);

/**
 * Require the named descendant paths for this occurrence of a reusable object.
 *
 * Paths are relative to the decorated semantic block or property. A Model target must be an
 * emitted `@Meta.question` or `@Meta.form` block; otherwise the annotation would have no artifact
 * boundary and compilation fails. This is deliberately narrower than a schema override: it can
 * only add requiredness, which JSON Schema can compose safely beside a `$ref`.
 */
extern dec requiredPaths(
  target: Model | ModelProperty,
  ...paths: valueof string[]
);

/** Require one descendant path when another descendant path has the supplied value. */
extern dec requiredPathWhen(
  target: Model | ModelProperty,
  targetPath: valueof string,
  sourcePath: valueof string,
  equals: valueof unknown
);

/** Require at least one named descendant path when the source descendant path is present. */
extern dec atLeastOnePathWhenPresent(
  target: Model | ModelProperty,
  sourcePath: valueof string,
  ...targetPaths: valueof string[]
);

/** Require one path when another path contains a decimal string strictly greater than zero. */
extern dec requiredPathWhenPositiveDecimalString(
  target: Model | ModelProperty,
  targetPath: valueof string,
  sourcePath: valueof string
);

/** Require a positive decimal string at one path when another path is present. */
extern dec positiveDecimalStringWhenPathPresent(
  target: Model | ModelProperty,
  targetPath: valueof string,
  sourcePath: valueof string
);

/** Require a value for at least one of the named sibling properties. */
extern dec atLeastOneOf(target: Model, ...properties: ModelProperty[]);

extern dec requiredWhen(
  target: ModelProperty,
  source: ModelProperty,
  equals: valueof unknown
);

/** Require a field from a condition on a nested sibling path, relative to the containing model. */
extern dec requiredWhenPath(
  target: ModelProperty,
  sourcePath: valueof string,
  equals: valueof unknown
);

/** Require this date to be the same as or later than a sibling date. */
extern dec notBefore(target: ModelProperty, source: ModelProperty);

/** `operator` rather than `op`: `op` is a TypeSpec keyword and breaks the parser. */
extern dec computed(
  target: ModelProperty,
  operator: valueof Op,
  ...refs: ModelProperty[]
);

/**
 * Compute a value from canonical data paths that cross a repeatable boundary.
 *
 * Paths are relative to the reusable block that owns the calculation. `[*]` selects every
 * entry in a list. This is the declarative equivalent of a cross-period total such as
 * `budgetYear[*].travel.totalTravelCost`; a target adapter may translate the spelling but
 * must not reinterpret the relationship.
 */
extern dec computedFrom(
  target: ModelProperty,
  operator: valueof Op,
  ...paths: valueof string[]
);

/**
 * Leave a calculated output absent until at least one declared source value is present.
 *
 * An explicitly entered zero is present and therefore materializes the calculated value. This
 * controls output materialization only; it does not change the calculation or requiredness.
 */
extern dec materializeWhenAnySourcePresent(target: ModelProperty);

/** Preserve an authoritative calculation's evaluation position when the source defines one. */
extern dec evaluationOrder(target: ModelProperty, order: valueof int32);

/**
 * This block totals the same block found in each of `sources`, field by field.
 *
 * A source is either a repeatable list -- in which case the corresponding block is found
 * inside each entry -- or a peer property holding the same block. Either way one
 * declaration stands for a sum per field, which is what makes a twelve-row budget column
 * one statement rather than twelve.
 */
extern dec totals(target: ModelProperty, ...sources: ModelProperty[]);
