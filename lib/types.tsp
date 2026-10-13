namespace SimplerForms;

/** How a reusable block participates in semantic analysis. */
enum BlockClassification {
  /** A stable information requirement that forms may ask or produce. */
  semanticQuestion,

  /** Reusable machinery used to capture an answer, rather than the answer's meaning. */
  captureMechanism,
}

/** Why a value exists in a form response, independent of its semantic identity and presentation. */
enum ResponseRole {
  /** Information supplied directly by an applicant or their representative. */
  applicantInput,

  /** A value derived from other response values by portable calculation rules. */
  calculatedOutput,

  /** A value supplied by a platform, agency, state, or another external lifecycle owner. */
  systemValue,

  /** A value used to drive authoring or runtime interaction rather than submitted semantics. */
  technicalField,

  /** An explicit certification, assurance, signature, or comparable affirmation. */
  attestation,

  /** Non-response content included for instructions or presentation. */
  staticContent,
}

/** Identity, lifecycle, and analytical classification for a bank block. */
model QuestionMeta {
  /** Semantic id, `entity/attribute` — e.g. "poc/details". */
  id: string;

  /**
   * The entity this question is asked *about* — the `entity` half of the id. A member of an
   * enum declared with `@Meta.entities`, rather than inferred from the id, so it
   * autocompletes and is checked; `entity-id-mismatch` reports the two disagreeing.
   *
   * Optional for now so the fold lands without rewriting every existing question in
   * one pass. It is present on all 279 questions in practice, so a linter rule should
   * promote it to mandatory once they carry it.
   */
  entity?: unknown;

  version?: string;
  status?: "draft" | "stable" | "deprecated";
  classification?: BlockClassification;
}

/**
 * A form's identity. A platform's own identity for the form, such as its name and version
 * in a submission system, belongs to that platform's library, as a decorator of its own on
 * the same model.
 */
model FormMeta {
  /** Semantic id — e.g. "key-contacts". Also the published schema's id and directory. */
  id: string;

  formName: string;

  /** Revision of the form. */
  revision?: string;
}

/** Source-specific constraints applied where a reusable question is composed into a form. */
model ValidationConstraints {
  minLength?: int32;
  maxLength?: int32;
  minItems?: int32;
  maxItems?: int32;
  pattern?: string;
}

enum Op {
  Sum,
  Subtract,
  PercentOf,
}
