import type { Model, ModelProperty, Scalar } from "@typespec/compiler";
import { stateKeys } from "../lib.js";
import { type Ctx, enumName, plain, publishAs, set } from "./shared.js";

/**
 * `@Meta.question`: the question's stable identity, the entity it is asked about, and
 * its classification. Also establishes the JSON Schema `$id`, so this is what makes a
 * model a question rather than an ordinary model.
 */
export const $question = (ctx: Ctx, target: Model | Scalar, meta: unknown) => {
  const m = plain(ctx, meta) as {
    id: string;
    entity?: unknown;
    classification?: unknown;
  };
  if (m.entity !== undefined) m.entity = enumName(m.entity);
  if (m.classification !== undefined)
    m.classification = enumName(m.classification);
  set(ctx, stateKeys.questionMeta, target, m);
  publishAs(ctx, target, m.id);
};

/** `@Meta.form`: the form's identity and the provenance of the paper form it mirrors. */
export const $form = (ctx: Ctx, target: Model, meta: unknown) => {
  const m = plain(ctx, meta) as { id: string };
  set(ctx, stateKeys.formMeta, target, m);
  publishAs(ctx, target, m.id);
};

/**
 * `@Meta.tag`: catalogue markers. Unlike the entity, a tag also applies to a bare
 * constrained scalar with no question identity, so it stays a decorator of its own
 * rather than a field of the question meta.
 */
export const $tag = (ctx: Ctx, target: Model | Scalar, ...tags: unknown[]) =>
  set(
    ctx,
    stateKeys.tags,
    target,
    tags.map((t) => enumName(t)),
  );

/**
 * `@Meta.role`: why a field exists in a response -- applicant input, calculated output,
 * a value a platform supplies, a technical field, an attestation, or static content.
 * Resolved by inheritance at emission, so a form can override a shared question's role.
 */
export const $role = (
  ctx: Ctx,
  target: Model | Scalar | ModelProperty,
  role: unknown,
) => set(ctx, stateKeys.responseRole, target, enumName(role));
