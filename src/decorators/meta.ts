import type {
  Enum,
  EnumMember,
  Model,
  ModelProperty,
  Namespace,
  Scalar,
} from "@typespec/compiler";
import { stateKeys } from "../lib.js";
import { type Ctx, enumName, plain, publishAs, set, unwrap } from "./shared.js";

/** The name a declared enum member is emitted under: its string value, or its name. */
const memberName = (member: EnumMember) =>
  typeof member.value === "string" ? member.value : member.name;

/**
 * `@Meta.question`: the question's stable identity, the entity it is asked about, and
 * its classification. Also establishes the JSON Schema `$id`, so this is what makes a
 * model a question rather than an ordinary model.
 *
 * The entity is recorded as its name now and as the member itself for `$onValidate`, which
 * checks it against the declared sets once every `@Meta.entities` has run.
 */
export const $question = (ctx: Ctx, target: Model | Scalar, meta: unknown) => {
  const m = plain(ctx, meta) as {
    id: string;
    entity?: unknown;
    classification?: unknown;
  };
  const entity = entityMember(meta);
  if (entity) {
    m.entity = memberName(entity);
    set(ctx, stateKeys.entity, target, m.entity);
    set(ctx, stateKeys.entityMember, target, entity);
  } else if (m.entity !== undefined) {
    m.entity = enumName(m.entity);
  }
  if (m.classification !== undefined)
    m.classification = enumName(m.classification);
  set(ctx, stateKeys.questionMeta, target, m);
  publishAs(ctx, target, m.id);
};

/** The enum member a question meta's `entity` names, read before it is made plain. */
function entityMember(meta: unknown): EnumMember | undefined {
  const member = unwrap((meta as { entity?: unknown })?.entity) as any;
  return member?.kind === "EnumMember" ? (member as EnumMember) : undefined;
}

/** `@Meta.tags`: the tags the program catalogues its questions by. */
export const $tags = (ctx: Ctx, target: Namespace, tags: Enum) =>
  set(ctx, stateKeys.tagSets, target, tags);

/** `@Meta.entities`: the entities the program's questions are asked about. */
export const $entities = (ctx: Ctx, target: Namespace, entities: Enum) =>
  set(ctx, stateKeys.entitySets, target, entities);

/**
 * `@Meta.submission`: what a form collects and submits. Publishes the model's JSON Schema,
 * as `@Meta.question` does, so a submission is a block.
 */
export const $submission = (ctx: Ctx, target: Model, meta: unknown) => {
  const m = plain(ctx, meta) as { id: string };
  set(ctx, stateKeys.submissionMeta, target, m);
  publishAs(ctx, target, m.id);
};

/** `@Meta.form`: one presentation's identity. Publishes no schema of its own. */
export const $form = (ctx: Ctx, target: Model, meta: unknown) =>
  set(ctx, stateKeys.presentationMeta, target, plain(ctx, meta));

/**
 * `@Meta.tag`: catalogue markers. Unlike the entity, a tag also applies to a bare
 * constrained scalar with no question identity, so it stays a decorator of its own
 * rather than a field of the question meta.
 */
export const $tag = (
  ctx: Ctx,
  target: Model | Scalar,
  ...tags: EnumMember[]
) => {
  set(ctx, stateKeys.tags, target, tags.map(memberName));
  set(ctx, stateKeys.tagMembers, target, tags);
};

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
