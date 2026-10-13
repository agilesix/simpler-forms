// The JS that implements the `extern dec` declarations below. Imported here rather than
// only from `main.tsp` so that this file type-checks on its own -- an editor opens one
// file, not an entry point, and an unimplemented `extern dec` is an error.
import "../dist/src/index.js";
import "./types.tsp";

using TypeSpec.Reflection;

namespace SimplerForms.Meta;

/**
 * A question's portable identity. The `entity` field and the first segment of `id`
 * describe the same thing and must agree.
 */
extern dec question(target: Model | Scalar, meta: valueof QuestionMeta);

/**
 * The data a form collects and submits. Publishes the model's JSON Schema, and is what
 * its XML mapping, validation and Grants.gov identity hang off.
 */
extern dec submission(target: Model, meta: valueof SubmissionMeta);

/**
 * A presentation an applicant opens. Goes on a submission model that is its own layout,
 * or on a `@UI.layout` model presenting another model's submission.
 */
extern dec form(target: Model, meta: valueof FormMeta);

/**
 * Catalogue markers. Applies to a question, and also to a bare constrained scalar that
 * carries no question identity of its own — a money-shaped string, a bounded count.
 */
extern dec tag(target: Model | Scalar, ...tags: valueof TagName[]);

/**
 * Why a block or field exists in a response. Deliberately separate from semantic
 * question identity, capture mechanism, UI behavior, and delivery targets.
 */
extern dec role(
  target: Model | Scalar | ModelProperty,
  role: valueof ResponseRole
);
