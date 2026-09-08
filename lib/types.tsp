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
   * The entity this question is asked *about* — the `entity` half of the id.
   * Declared as an enum member rather than inferred from the id so it autocompletes
   * and is checked; `entity-id-mismatch` reports the two disagreeing.
   *
   * Optional for now so the fold lands without rewriting every existing question in
   * one pass. It is present on all 279 questions in practice, so a linter rule should
   * promote it to mandatory once they carry it.
   */
  entity?: EntityName;

  version?: string;
  status?: "draft" | "stable" | "deprecated";
  classification?: BlockClassification;
}

/** Portable identity, lifecycle, and source metadata for a form. */
model FormMeta {
  /** Semantic id — e.g. "key-contacts". */
  id: string;

  legacyFormId?: int32;
  formName: string;
  shortFormName: string;
  formVersion: string;
  agencyCode?: string;
  ombNumber?: string;
}

/** Source-specific constraints applied where a reusable question is composed into a form. */
model ValidationConstraints {
  minLength?: int32;
  maxLength?: int32;
  minItems?: int32;
  maxItems?: int32;
  pattern?: string;
}

enum TagName {
  address,
  phone,
  email,
  identifier,
  name,
  title,
  person,
  organization,
  details,
  generic,
  money,
  count,
  attachment,
  narrative,
  date,
  role,
}

enum EntityName {
  primaryOrg,
  fiscalSponsor,
  poc,
  principalInvestigator,
  authorizedRepresentative,
  project,
  opportunity,
  application,
  generic,
}

/** Mirrors the SGG frontend's WidgetTypes union. */
enum WidgetName {
  Attachment,
  AttachmentArray,
  Checkbox,
  EncodedCheckboxGroup,
  Text,
  TextArea,
  Radio,
  Select,
  MultiSelect,
  Print,
  PrintAttachment,
  FieldList,
  Table,
  Budget424aSectionA,
  Budget424aSectionB,
  Budget424aSectionC,
  Budget424aSectionD,
  Budget424aSectionE,
  Budget424aSectionF,
}

enum Op {
  Sum,
  Subtract,
  PercentOf,
}
