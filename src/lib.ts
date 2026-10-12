import {
  createTypeSpecLibrary,
  paramMessage,
  type JSONSchemaType,
} from "@typespec/compiler";
import type { FormSpecOptions } from "./emitter.js";

const EmitterOptionsSchema: JSONSchemaType<FormSpecOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "base-uri": { type: "string", nullable: true },
    "property-casing": {
      type: "string",
      enum: ["preserve", "snake"],
      nullable: true,
      default: "preserve",
    },
  },
  required: [],
};

/**
 * Named diagnostics for everything that makes an artifact wrong, and state keys for
 * everything the decorators record.
 *
 * The split between these and the linter rules in `linter.ts` is forced rather than
 * chosen: a TypeSpec linter rule may only be a warning. So a check whose failure means the
 * emitted artifact is broken is reported from `$onValidate` as an error, and the linter
 * carries the checks that describe a specification worth tidying.
 */
export const $lib = createTypeSpecLibrary({
  name: "simpler-forms",
  // Pins the diagnostic short name, so moving the package into an npm scope later
  // leaves every `#suppress "simpler-forms/<rule>"` in a specification working.
  alias: "simpler-forms",
  diagnostics: {
    "form-scoped-question-id": {
      severity: "error",
      messages: {
        default: paramMessage`Question id "${"id"}" names a form. Questions are named for what they mean; put form deltas in @UI.overrides.`,
      },
    },
    "duplicate-block-id": {
      severity: "error",
      messages: {
        default: paramMessage`Block id "${"id"}" is claimed by both ${"first"} and ${"second"}. Two blocks would collide on one output path; a form-local extension should use \`extends\`, which carries no identity.`,
      },
    },
    "condition-value-not-in-enum": {
      severity: "error",
      messages: {
        default: paramMessage`"${"value"}" is not a member of ${"enumName"}, so this condition is constant -- never holding, or always holding if it is negated. Members: ${"members"}.`,
      },
    },
    "mapping-target-undeclared": {
      severity: "error",
      messages: {
        default: paramMessage`${"name"} is linked in mapping ${"mapping"} from ${"enumName"}, which no namespace declares with @Mapping.targets, so no emitter is known to produce it. Declare the program's mappings once, e.g. @Mapping.targets(${"enumName"}).`,
      },
    },
    "mapping-duplicate": {
      severity: "error",
      messages: {
        default: paramMessage`${"name"} has more than one @Mapping.to for mapping ${"mapping"}. A model or property corresponds to one thing per mapping.`,
      },
    },
    "mapping-path-unresolved": {
      severity: "error",
      messages: {
        default: paramMessage`@Mapping.path "${"path"}" on ${"name"} does not resolve: ${"reason"}.`,
      },
    },
    "mapping-target-out-of-context": {
      severity: "error",
      messages: {
        default: paramMessage`In mapping ${"mapping"}, ${"source"} is linked to ${"target"}, which is not a property of ${"context"}, the model its parent maps to. Link the parent to the model that holds it, or link this path from the composing model with @Mapping.path.`,
      },
    },
    "mapping-type-mismatch": {
      severity: "error",
      messages: {
        default: paramMessage`In mapping ${"mapping"}, ${"source"} is linked to ${"target"}, but ${"reason"}.`,
      },
    },
    "mapping-cardinality-mismatch": {
      severity: "error",
      messages: {
        default: paramMessage`In mapping ${"mapping"}, ${"source"} is ${"sourceShape"} but ${"target"} is ${"targetShape"}.`,
      },
    },
    "mapping-target-duplicate": {
      severity: "error",
      messages: {
        default: paramMessage`In mapping ${"mapping"}, both ${"first"} and ${"second"} are linked to ${"target"}. Each target property takes its value from one source.`,
      },
    },
    "mapping-from-unresolved": {
      severity: "error",
      messages: {
        default: paramMessage`In mapping ${"mapping"}, ${"target"} is filled from ${"source"}, which is not a field of ${"context"}, the field its parent is filled from.`,
      },
    },
    "mapping-from-cardinality-mismatch": {
      severity: "error",
      messages: {
        default: paramMessage`In mapping ${"mapping"}, ${"target"} is ${"targetShape"} but ${"source"}, which fills it, is ${"sourceShape"}.`,
      },
    },
    "mapping-from-wrapper": {
      severity: "warning",
      messages: {
        default: paramMessage`In mapping ${"mapping"}, ${"target"} has no field of its own: it wraps fields of ${"context"}. Rules keyed by the response's properties cannot write an element with no property behind it, so its contents are left out.`,
      },
    },
    "widget-not-declared": {
      severity: "error",
      messages: {
        default: paramMessage`${"name"} uses widget ${"widget"} from ${"enumName"}, which no namespace declares with @UI.widgets, so no renderer is known to provide it. Declare the program's widgets once, e.g. @UI.widgets(${"enumName"}).`,
      },
    },
    "condition-path-unresolved": {
      severity: "error",
      messages: {
        default: paramMessage`Condition path "${"path"}" does not resolve from ${"model"}.`,
      },
    },
    "condition-count-source-not-array": {
      severity: "error",
      messages: {
        default: paramMessage`Count condition source ${"source"} must be an array property.`,
      },
    },
    "condition-count-minimum-invalid": {
      severity: "error",
      messages: {
        default: paramMessage`Count condition minimum must be a positive integer; received ${"minimum"}.`,
      },
    },
    "condition-source-not-sibling": {
      severity: "error",
      messages: {
        default: paramMessage`Condition source ${"source"} must be a sibling of target ${"target"} in the same model.`,
      },
    },
    "cardinality-path-unresolved": {
      severity: "error",
      messages: {
        default: paramMessage`Cardinality path "${"path"}" does not resolve from ${"model"}: ${"reason"}.`,
      },
    },
    "cardinality-model-not-emitted": {
      severity: "error",
      messages: {
        default: paramMessage`Cardinality annotations on model ${"model"} would not be emitted. Put them on a semantic block or on the property where that block is composed.`,
      },
    },
    "block-not-emitted": {
      severity: "error",
      messages: {
        default: paramMessage`${"name"} produced no schema under id "${"id"}", so none of its artifacts were written. The ids that were produced are: ${"available"}.`,
      },
    },
    "entity-id-mismatch": {
      severity: "error",
      messages: {
        default: paramMessage`${"name"} declares entity "${"entity"}" but its id is "${"id"}". The first segment of the id is the entity, so these must agree.`,
      },
    },
    "at-least-one-invalid": {
      severity: "error",
      messages: {
        default: paramMessage`@Validation.atLeastOneOf on ${"model"} must name at least two distinct properties owned by that model; received ${"properties"}.`,
      },
    },
    "conditional-at-least-one-path-invalid": {
      severity: "error",
      messages: {
        default: paramMessage`@Validation.atLeastOnePathWhenPresent on ${"model"} must name a source path and at least two distinct target paths; received ${"paths"}.`,
      },
    },
    "positive-decimal-string-target-invalid": {
      severity: "error",
      messages: {
        default: paramMessage`Positive decimal-string condition target "${"path"}" on ${"model"} must resolve to a string scalar; received ${"type"}.`,
      },
    },
    "encoded-checkbox-contract-invalid": {
      severity: "error",
      messages: {
        default: paramMessage`Encoded checkbox contract on ${"name"} is invalid: ${"reason"}.`,
      },
    },
    "calculation-cycle": {
      severity: "error",
      messages: {
        default: paramMessage`Calculation cycle: ${"cycle"}. A calculated value cannot depend on itself.`,
      },
    },
    "calculation-path-unresolved": {
      severity: "error",
      messages: {
        default: paramMessage`Calculation path "${"path"}" does not resolve from ${"scope"}. Cross-boundary calculations must name real canonical data paths.`,
      },
    },
    "calculation-materialization-without-calculation": {
      severity: "error",
      messages: {
        default: paramMessage`@Validation.materializeWhenAnySourcePresent on ${"name"} requires @Validation.computed or @Validation.computedFrom.`,
      },
    },
    "date-order-source-invalid": {
      severity: "error",
      messages: {
        default: paramMessage`@Validation.notBefore on ${"target"} must reference a different sibling property; received ${"source"}.`,
      },
    },
    "required-but-unreachable": {
      severity: "error",
      messages: {
        default: paramMessage`${"name"} is always required but only sometimes visible, so an applicant can be blocked by a field they cannot see. Make it optional and use @Validation.requiredWhen, or drop the visibility condition.`,
      },
    },
    "override-path-unresolved": {
      severity: "error",
      messages: {
        default: paramMessage`@UI.overrides path "${"path"}" does not resolve: ${"reason"}.`,
      },
    },
    "visible-read-only-without-read-only": {
      severity: "error",
      messages: {
        default: paramMessage`@UI.overrides path "${"path"}" requests visibleReadOnly without readOnly. A visible read-only control must also be marked readOnly so schema and UI cannot disagree.`,
      },
    },
    "property-casing-collision": {
      severity: "error",
      messages: {
        default: paramMessage`${"model"}.${"first"} and ${"model"}.${"second"} would both be emitted as "${"name"}". Rename one, or give one an @encodedName("application/json", ...).`,
      },
    },
    "property-casing-inconsistent": {
      severity: "error",
      messages: {
        default: paramMessage`${"property"} would be emitted as "${"name"}", but ${"other"} as "${"otherName"}". A property name is emitted the same way everywhere, so give both the same @encodedName.`,
      },
    },
    "section-orphan": {
      severity: "error",
      messages: {
        default: paramMessage`${"name"} is in no section, so it renders nowhere. Give it a @UI.section, or @UI.omit it if that is deliberate.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
  state: {
    questionMeta: {},
    formMeta: {},
    tags: {},
    entity: {},
    responseRole: {},
    label: {},
    helpText: {},
    widgets: {},
    widget: {},
    widgetMember: {},
    encodedCheckboxGroup: {},
    sections: {},
    section: {},
    order: {},
    overrides: {},
    readOnly: {},
    omit: {},
    visibleWhen: {},
    enabledWhen: {},
    readOnlyWhen: {},
    requiredWhen: {},
    notBefore: {},
    validationConstraints: {},
    exclusiveValues: {},
    validationConstraintsWhen: {},
    requiredPaths: {},
    requiredPathWhen: {},
    atLeastOnePathWhenPresent: {},
    requiredPathWhenPositiveDecimalString: {},
    positiveDecimalStringWhenPathPresent: {},
    atLeastOneOf: {},
    computed: {},
    computedFrom: {},
    calculationMaterialization: {},
    evaluationOrder: {},
    totals: {},
    mappingTargets: {},
    mappedTo: {},
    mappingPaths: {},
    mappedFrom: {},
  },
} as const);

export const { reportDiagnostic, createDiagnostic, stateKeys } = $lib;
