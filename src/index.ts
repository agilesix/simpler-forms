export { $onEmit } from "./emitter.js";
import * as d from "./decorators/index.js";

export { $lib } from "./lib.js";
export { $linter } from "./linter.js";
export { $onValidate } from "./validate.js";
export * from "./decorators/index.js";

export const $decorators = {
  "SimplerForms.Meta": {
    question: d.$question,
    form: d.$form,
    tag: d.$tag,
    role: d.$role,
  },
  "SimplerForms.UI": {
    sections: d.$sections,
    section: d.$section,
    overrides: d.$overrides,
    label: d.$label,
    helpText: d.$helpText,
    widget: d.$widget,
    encodedCheckboxGroup: d.$encodedCheckboxGroup,
    order: d.$order,
    omit: d.$omit,
    readOnly: d.$readOnly,
    visibleWhen: d.$visibleWhen,
    enabledWhen: d.$enabledWhen,
    enabledWhenAny: d.$enabledWhenAny,
    enabledWhenCount: d.$enabledWhenCount,
    enabledWhenCountOrPresent: d.$enabledWhenCountOrPresent,
    readOnlyWhen: d.$readOnlyWhen,
  },
  "SimplerForms.Validation": {
    constraints: d.$validationConstraints,
    exclusiveValues: d.$exclusiveValues,
    constraintsWhen: d.$validationConstraintsWhen,
    requiredPaths: d.$requiredPaths,
    requiredPathWhen: d.$requiredPathWhen,
    atLeastOnePathWhenPresent: d.$atLeastOnePathWhenPresent,
    requiredPathWhenPositiveDecimalString:
      d.$requiredPathWhenPositiveDecimalString,
    positiveDecimalStringWhenPathPresent:
      d.$positiveDecimalStringWhenPathPresent,
    atLeastOneOf: d.$atLeastOneOf,
    requiredWhen: d.$requiredWhen,
    requiredWhenPath: d.$requiredWhenPath,
    notBefore: d.$notBefore,
    computed: d.$computed,
    computedFrom: d.$computedFrom,
    materializeWhenAnySourcePresent: d.$materializeWhenAnySourcePresent,
    evaluationOrder: d.$evaluationOrder,
    totals: d.$totals,
  },
};
