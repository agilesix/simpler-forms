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

// --- forms ----------------------------------------------------------------
// Each `@Meta.form` is published as `forms/<id>/`, and a target emitter writing a form's
// artifacts beside the others writes them there.
export {
  /** Every publishable `@Meta.form`, with the layout that presents it, if any. */
  resolveForms,
  type PublishedForm,
} from "./forms.js";
export {
  type FormMeta,
  /** Every `@UI.layout` model, with the model it presents. */
  allLayouts,
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
  propOmit,
  propReadOnly,
  propResponseRole,
  propVisibleWhen,
  propEnabledWhen,
  propReadOnlyWhen,
  propRequiredWhen,
  propValidationConstraints,
  propValidationConstraintsWhen,
  propExclusiveValues,
  propNotBefore,
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

// --- formulas -------------------------------------------------------------
// An emitter that calculates answers reads each field's formula here. Sources are resolved
// to the fields they read, so it never has to look models up in the form.
export {
  /** A field's `@Formula`, with each source resolved to the fields it reads. */
  propFormula,
  /** The block a formula on a type works on field by field, if it's a block. */
  formulaBlock,
  /** The fields a formula on a block calculates: all but the block's own formulas. */
  formulaBlockFields,
  type Formula,
  type FormulaName,
  type FormulaSource,
} from "./formula.js";

// --- mapping --------------------------------------------------------------
// A mapping emitter takes the members it emits as an option, checks them against
// `mappingTargets`, and resolves each form it emits once per member.
export {
  /** Every member of every enum declared with `@Mapping.targets`. */
  mappingTargets,
  modelMappedTo,
  propMappedTo,
  modelMappingPaths,
  propMappedFrom,
  propMappedFromLinks,
  propTransform,
  propMatch,
  propMappingRequired,
  propMappingConditions,
  declaredTransformSets,
  type MappingLink,
  type MappingPathLink,
  type MappingFromLink,
  type MappingSelection,
  type MappingTransform,
  type MappingMatch,
  type MappingCondition,
} from "./model.js";
export {
  /** A model's mapping in one target, resolved through every model it composes. */
  resolveMapping,
  type ResolvedMapping,
  type MappingNode,
  type MappingNodeKind,
} from "./mapping.js";
export {
  /** A form's mapping read from the `@Mapping.from` links on its target: the same tree. */
  resolveMappingFrom,
  mappedFromRoot,
} from "./mapping-from.js";

// --- property casing ------------------------------------------------------
// A target emitter writing its own artifacts uses these to name properties as this one does.
export {
  /** The name a property is emitted under, honoring `@encodedName("application/json")`. */
  jsonPropertyName,
  snakeCase,
  type PropertyCasing,
} from "./casing.js";
