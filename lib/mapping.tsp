// The JS that implements the `extern dec` declarations below. Imported here rather than
// only from `main.tsp` so that this file type-checks on its own -- an editor opens one
// file, not an entry point, and an unimplemented `extern dec` is an error.
import "../dist/src/index.js";

using TypeSpec.Reflection;

/**
 * Correspondences between a form's models and the models of some other representation of
 * the same response -- an XSD modeled in TypeSpec, a CSV layout, another JSON shape.
 *
 * Nothing here is specific to any one representation. Each link names the mapping it
 * belongs to, so one form can carry several side by side, and the program's own emitters
 * read the mappings they produce. Wire details (element names, namespaces, column headers)
 * belong on the target models, in whatever vocabulary that representation uses.
 */
namespace SimplerForms.Mapping;

/**
 * Declare the mappings a program's emitters produce, as `@versioned` declares its versions
 * and `@UI.widgets` its widgets. Each member is one mapping -- one XSD version, one CSV
 * layout -- and an emitter is configured with the members it emits.
 */
extern dec targets(target: Namespace, targets: Enum);

/**
 * Declare the value transformations `@Mapping.transform` can name, as `@Mapping.targets`
 * declares the mappings. Each member is one transformation an emitter's runtime implements,
 * with the name it implements it under as its value.
 */
extern dec transforms(target: Namespace, transforms: Enum);

/**
 * Transform this target property's value with `transform` before it is written: a member of
 * an enum declared with `@Mapping.transforms`. `params` are passed to it by name, e.g.
 * `#{ max_length: 60 }` for a transformation that truncates.
 */
extern dec transform(
  target: ModelProperty,
  transform: EnumMember,
  params?: valueof Record<unknown>
);

/**
 * Write this target property's value as the entry `cases` gives it: a lookup spelled out in
 * the spec, so every emitter applies it the same way. A value is looked up as JSON writes it,
 * so a boolean matches `true` or `false` and a number its digits. A key that isn't an
 * identifier is written in backticks.
 *
 * A value `cases` doesn't list is written as `default`: a fixed value, or a field. Naming the
 * field this property is filled from passes the value through unchanged, to change only some
 * values. Without a default, an unlisted value is an error. A property takes
 * `@Mapping.match` or `@Mapping.transform`, not both.
 *
 * ```typespec
 * @Mapping.from(xml, Form.reviewStatus)
 * @Mapping.match(#{ `b. … the state …`: "b. … the State …" }, Form.reviewStatus)
 * stateReview: string;
 * ```
 */
extern dec match(
  target: ModelProperty,
  cases: valueof Record<string | numeric | boolean>,
  default?: ModelProperty | (valueof string | numeric | boolean)
);

/**
 * In mapping `mapping`, this model or property corresponds to `mappedTo`.
 *
 * Link a model to a model, and its properties to properties of that model. A property whose
 * type is a linked model inherits that model's links, so a shared question links once, at
 * the level its mapping is shared, and every form that composes it gets them. Repeatable,
 * once per mapping.
 */
extern dec to(
  target: Model | ModelProperty,
  mapping: EnumMember,
  mappedTo: Model | ModelProperty
);

/**
 * In mapping `mapping`, link a nested source path, dotted and relative to this model, to a
 * property of the model this one maps to (or of the model a linked ancestor of the path
 * maps to).
 *
 * For a composing model whose target differs from what the questions it composes link to:
 * it overrides their links or adds ones they lack. A source object none of whose own links
 * apply, but some of whose descendants are linked here, is flattened into its parent.
 * Repeatable.
 */
extern dec path(
  target: Model,
  mapping: EnumMember,
  sourcePath: valueof string,
  mappedTo: ModelProperty
);

/**
 * In mapping `mapping`, this target model or property takes its value from `source` -- the
 * other direction from `@Mapping.to`, declared on the target instead of the form.
 *
 * On a target model, `source` is the form it is the target of, as `@UI.layout` names the
 * form it presents. On a target property, `source` is the field it is filled from, relative
 * to the field its parent is filled from; a property with none is structure, and its own
 * properties are filled relative to its parent's field. Repeatable, so a target shared by
 * several forms names the field each one fills it from.
 *
 * To fill it from some of a list field's items, name the field with `Item` or `Slice`:
 * `@Mapping.from(xml, Form.types, …)` reads the whole list, `Item<Form.types, 0>` its first
 * item, and `Slice<Form.sites, 1>` the items after the first.
 */
extern dec from(
  target: Model | ModelProperty,
  mapping: EnumMember,
  source: Model | ModelProperty
);

/**
 * One item of the list field `Source`, as the source of a `@Mapping.from`: for a target that
 * numbers its elements (`ApplicantTypeCode1` to `3`) instead of repeating one. `Index` counts
 * from 0, and a negative one counts back from the end: `-1` is the last item.
 *
 * ```typespec
 * @Mapping.from(xml, Mapping.Item<Form.applicantTypes, 0>)
 * applicantTypeCode1: string;
 * ```
 */
model Item<Source extends ModelProperty, Index extends valueof int32> {}

/**
 * The items of the list field `Source` from `Start`, included, to `Stop`, excluded, or to the
 * end without one, as the source of a `@Mapping.from`. A negative bound counts back from the
 * end. The target is a list, filled with those items: e.g. the items after the first, when
 * `Item<…, 0>` fills an element of its own.
 *
 * ```typespec
 * @Mapping.from(xml, Mapping.Item<Form.sites, 0>) primarySite: Site;
 * @Mapping.from(xml, Mapping.Slice<Form.sites, 1>) otherSites?: Site[];
 * ```
 */
model Slice<
  Source extends ModelProperty,
  Start extends valueof int32,
  Stop extends valueof int32 | null = null
> {}
