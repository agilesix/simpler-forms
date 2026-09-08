/**
 * The API a target emitter reads.
 *
 * A consuming application contributes its own decorators, state, validation and emitted
 * files through its own TypeSpec library, listed alongside this one in `tspconfig.yaml`.
 * To do that it has to read the block graph this library builds, which is what the
 * exports below are for.
 *
 * Everything here is public API and semver-governed. Nothing else in `src/` is: the
 * decorator implementations, the emitters and the validators are internal, and a target
 * that reaches past this module is depending on something that can change in a patch.
 */

// --- the block graph ------------------------------------------------------
export {
  /** Every question and form in the program, in declaration order. */
  allBlocks,
  /** Read one model as a block, or undefined if it is neither a question nor a form. */
  readBlock,
  /** The block a property's type resolves to, if that type is itself a block. */
  childBlock,
  /** A block's chain of enclosing blocks, nearest first. */
  blockAncestry,
  type Block,
} from "./model.js";

// --- conditions -----------------------------------------------------------
export {
  /** The model a `countAtLeast` condition's source property belongs to. */
  conditionSourceModel,
  type Condition,
  type AnyCondition,
  type AtomicCondition,
  type EqualsCondition,
  type InCondition,
  type CountAtLeastCondition,
  type PresentCondition,
} from "./model.js";

/** An `enabledWhen` from `@UI.overrides`, normalized to the same shape as the decorator. */
export { normalizedOverrideEnabledWhen } from "./emitters/override-condition.js";

// --- model-level state ----------------------------------------------------
export {
  modelLabel,
  modelOrder,
  modelAtLeastOneOf,
  /** Own and inherited properties in declaration order, derived declaration winning. */
  modelProperties,
  /** `modelProperties` with `@UI.order` applied. */
  orderedProps,
  typeTags,
  typeResponseRole,
  enumValues,
  scalarType,
  scalarConstraints,
} from "./model.js";

// --- property-level state -------------------------------------------------
export {
  propLabel,
  propHelpText,
  propWidget,
  propEncodedCheckboxGroup,
  propSection,
  propOmit,
  propReadOnly,
  propOverrides,
  propResponseRole,
  propVisibleWhen,
  propEnabledWhen,
  propReadOnlyWhen,
  propRequiredWhen,
  propValidationConstraints,
  propValidationConstraintsWhen,
  propExclusiveValues,
  propComputed,
  propComputedFrom,
  propCalculationMaterialization,
  propEvaluationOrder,
  propNotBefore,
  propTotals,
  type ResponseRole,
} from "./model.js";

// --- cardinality ----------------------------------------------------------
// Conditional-requiredness declarations, resolved against the type graph.
export {
  cardinalityRequiredWhen,
  cardinalityRequiredPaths,
  cardinalityAtLeastOnePathWhenPresent,
  cardinalityRequiredPathWhenPositiveDecimalString,
  cardinalityPositiveDecimalStringWhenPathPresent,
} from "./model.js";
