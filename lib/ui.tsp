// The JS that implements the `extern dec` declarations below. Imported here rather than
// only from `main.tsp` so that this file type-checks on its own -- an editor opens one
// file, not an entry point, and an unimplemented `extern dec` is an error.
import "../dist/src/index.js";
import "./types.tsp";

using TypeSpec.Reflection;

namespace SimplerForms.UI;

/** Declare the ordered section set for a block. */
extern dec sections(target: Model, sections: Enum);

/** Assign a property (and everything under it) to one section. */
extern dec section(target: ModelProperty, section: valueof EnumMember);

/**
 * Form-scoped override table, keyed by dotted path relative to the target.
 * Presentation keys stay local to the form. `enabledWhen` may name an exact sibling/root
 * response path and equality value when a form applies behavior to a shared question.
 * `visibleReadOnly: true` is valid only with `readOnly: true`: it renders a visible control
 * backed by a read-only JSON Schema occurrence. Plain `readOnly` retains the target's historic
 * hidden/null behavior for technical identifiers.
 */
extern dec overrides(
  target: Model | ModelProperty,
  patch: valueof Record<unknown>
);

extern dec label(target: Model | Scalar | ModelProperty, text: valueof string);
extern dec helpText(target: ModelProperty, text: valueof string);
extern dec widget(target: ModelProperty, widget: valueof WidgetName);
/** Render source-approved checkbox choices while preserving one encoded wire value. */
extern dec encodedCheckboxGroup(
  target: ModelProperty,
  contract: valueof Record<unknown>
);
extern dec order(target: Model, ...props: ModelProperty[]);
extern dec omit(target: ModelProperty);
extern dec readOnly(target: ModelProperty);

extern dec visibleWhen(
  target: ModelProperty,
  source: ModelProperty,
  equals: valueof unknown
);
/** Keep the field visible but enable it only while the predicate holds. */
extern dec enabledWhen(
  target: ModelProperty,
  source: ModelProperty,
  equals: valueof unknown
);
/** Enable the field when the source equals any one of the supplied values. */
extern dec enabledWhenAny(
  target: ModelProperty,
  source: ModelProperty,
  ...equals: valueof unknown[]
);
/** Enable the field once a sibling list reaches the declared entry count. */
extern dec enabledWhenCount(
  target: ModelProperty,
  source: ModelProperty,
  minimum: valueof int32
);
/**
 * Enable an overflow field at a list threshold or while that field already has a saved value.
 * This preserves access to an existing upload if the list later falls below the threshold.
 */
extern dec enabledWhenCountOrPresent(
  target: ModelProperty,
  source: ModelProperty,
  minimum: valueof int32
);
extern dec readOnlyWhen(
  target: ModelProperty,
  source: ModelProperty,
  equals: valueof unknown
);
