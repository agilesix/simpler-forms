// The JS that implements the `extern dec` declarations below. Imported here rather than
// only from `main.tsp` so that this file type-checks on its own -- an editor opens one
// file, not an entry point, and an unimplemented `extern dec` is an error.
import "../dist/src/index.js";

using TypeSpec.Reflection;

/**
 * Correspondences between a form's models and the models of some other representation of
 * the same response -- an XSD mirror, a CSV layout, another JSON shape.
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
