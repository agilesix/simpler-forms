import type {
  Enum,
  Model,
  ModelProperty,
  Namespace,
  Program,
  Scalar,
  Type,
} from "@typespec/compiler";
import { reportDiagnostic } from "./lib.js";
import {
  Block,
  Condition,
  allBlocks,
  cardinalityAtLeastOnePathWhenPresent,
  cardinalityPositiveDecimalStringWhenPathPresent,
  cardinalityRequiredPaths,
  cardinalityRequiredPathWhenPositiveDecimalString,
  cardinalityRequiredWhen,
  childBlock,
  conditionSourceModel,
  orderedProps,
  propCalculationMaterialization,
  propComputed,
  readBlock,
  propComputedFrom,
  propEncodedCheckboxGroup,
  modelProperties,
  propEnabledWhen,
  propNotBefore,
  propOmit,
  propReadOnlyWhen,
  propRequiredWhen,
  propSection,
  propVisibleWhen,
  propValidationConstraintsWhen,
  scalarType,
} from "./model.js";

/**
 * Whole-program checks whose failure means the emitted artifacts would be wrong.
 *
 * These are errors, so they run here rather than in the linter, which may only warn. Each
 * one exists because the defect it catches is currently invisible: a question named after a
 * form, two blocks colliding on one output path, a condition comparing against a value the
 * source enum does not have, a calculation that depends on itself, a field that is required
 * but can be hidden, and a field in no section.
 */
export function $onValidate(program: Program): void {
  const blocks = allBlocks(program);

  checkQuestionIds(program, blocks);
  checkDuplicateIds(program, blocks);

  for (const block of blocks) {
    if (block.model.kind !== "Model") continue;
    checkSections(program, block);
    checkOverridePaths(program, block);
    for (const prop of block.model.properties.values()) {
      checkConditions(program, prop);
      checkRequiredButHidden(program, prop);
      checkEncodedCheckboxGroup(program, prop);
    }
  }

  checkDateOrders(program);
  checkCardinalityPaths(program);
  checkCalculationCycles(program, blocks);
  checkCalculationMaterialization(program, blocks);
  checkComputedPaths(program, blocks);
}

function checkCardinalityPaths(program: Program): void {
  const visit = (namespace: Namespace): void => {
    for (const model of namespace.models.values()) {
      const modelPaths = cardinalityRequiredPaths(program, model);
      const modelConditions = cardinalityRequiredWhen(program, model);
      const modelAlternatives = cardinalityAtLeastOnePathWhenPresent(
        program,
        model,
      );
      const modelPositiveConditions = [
        ...cardinalityRequiredPathWhenPositiveDecimalString(program, model),
        ...cardinalityPositiveDecimalStringWhenPathPresent(program, model),
      ];
      if (
        (modelPaths.length ||
          modelConditions.length ||
          modelAlternatives.length ||
          modelPositiveConditions.length) &&
        !readBlock(program, model)
      ) {
        reportDiagnostic(program, {
          code: "cardinality-model-not-emitted",
          target: model,
          format: { model: model.name || "an anonymous model" },
        });
      } else {
        checkCardinalityTarget(program, model, model);
      }
      for (const property of model.properties.values()) {
        const root = objectBehind(program, property);
        if (!root) {
          for (const path of [
            ...cardinalityRequiredPaths(program, property),
            ...cardinalityRequiredWhen(program, property).flatMap((entry) => [
              entry.targetPath,
              entry.sourcePath,
            ]),
            ...cardinalityAtLeastOnePathWhenPresent(program, property).flatMap(
              (entry) => [entry.sourcePath, ...entry.targetPaths],
            ),
            ...cardinalityRequiredPathWhenPositiveDecimalString(
              program,
              property,
            ).flatMap((entry) => [entry.targetPath, entry.sourcePath]),
            ...cardinalityPositiveDecimalStringWhenPathPresent(
              program,
              property,
            ).flatMap((entry) => [entry.targetPath, entry.sourcePath]),
          ]) {
            reportDiagnostic(program, {
              code: "cardinality-path-unresolved",
              target: property,
              format: {
                path,
                model: property.name,
                reason: "the decorated value is not an object",
              },
            });
          }
          continue;
        }
        checkCardinalityTarget(program, property, root);
      }
    }
    for (const child of namespace.namespaces.values()) visit(child);
  };
  visit(program.getGlobalNamespaceType());
}

function checkCardinalityTarget(
  program: Program,
  target: Model | ModelProperty,
  root: Model,
): void {
  const modelName =
    root.name || (target.kind === "ModelProperty" ? target.name : "the model");
  for (const path of cardinalityRequiredPaths(program, target)) {
    reportCardinalityPath(program, target, root, modelName, path);
  }
  for (const entry of cardinalityRequiredWhen(program, target)) {
    reportCardinalityPath(program, target, root, modelName, entry.targetPath);
    const source = resolvedProperty(root, entry.sourcePath.split("."));
    if (!source) {
      reportCardinalityPath(program, target, root, modelName, entry.sourcePath);
      continue;
    }
    const enumeration = enumOf(source.type);
    if (!enumeration) continue;
    const members = [...enumeration.members.values()].map(
      (member) => member.value ?? member.name,
    );
    if (!members.includes(entry.value as string | number)) {
      reportDiagnostic(program, {
        code: "condition-value-not-in-enum",
        target,
        format: {
          value: String(entry.value),
          enumName: enumeration.name,
          members:
            members.slice(0, 6).join(", ") +
            (members.length > 6 ? ", ..." : ""),
        },
      });
    }
  }
  for (const entry of cardinalityAtLeastOnePathWhenPresent(program, target)) {
    reportCardinalityPath(program, target, root, modelName, entry.sourcePath);
    for (const path of entry.targetPaths) {
      reportCardinalityPath(program, target, root, modelName, path);
    }
  }
  for (const entry of cardinalityRequiredPathWhenPositiveDecimalString(
    program,
    target,
  )) {
    reportCardinalityPath(program, target, root, modelName, entry.targetPath);
    reportCardinalityPath(program, target, root, modelName, entry.sourcePath);
    reportPositiveDecimalStringTarget(
      program,
      target,
      root,
      modelName,
      entry.sourcePath,
    );
  }
  for (const entry of cardinalityPositiveDecimalStringWhenPathPresent(
    program,
    target,
  )) {
    reportCardinalityPath(program, target, root, modelName, entry.targetPath);
    reportCardinalityPath(program, target, root, modelName, entry.sourcePath);
    reportPositiveDecimalStringTarget(
      program,
      target,
      root,
      modelName,
      entry.targetPath,
    );
  }
}

function reportPositiveDecimalStringTarget(
  program: Program,
  target: Model | ModelProperty,
  root: Model,
  modelName: string,
  path: string,
): void {
  const property = resolvedProperty(root, path.split("."));
  if (
    !property ||
    (property.type.kind === "Scalar" && scalarType(property.type) === "string")
  ) {
    return;
  }
  reportDiagnostic(program, {
    code: "positive-decimal-string-target-invalid",
    target,
    format: { path, model: modelName, type: property.type.kind },
  });
}

function reportCardinalityPath(
  program: Program,
  target: Model | ModelProperty,
  root: Model,
  modelName: string,
  path: string,
): void {
  const reason = resolvePath(program, root, path.split("."));
  if (!reason) return;
  reportDiagnostic(program, {
    code: "cardinality-path-unresolved",
    target,
    format: { path, model: modelName, reason },
  });
}

function resolvedProperty(
  model: Model,
  steps: string[],
): ModelProperty | undefined {
  let current: Model = model;
  let property: ModelProperty | undefined;
  for (const [index, step] of steps.entries()) {
    property = allProperties(current).get(step);
    if (!property) return undefined;
    if (index === steps.length - 1) return property;
    const next = property.type;
    if (next.kind !== "Model" || next.indexer) return undefined;
    current = next;
  }
  return property;
}

function checkDateOrders(program: Program): void {
  const visit = (namespace: Namespace): void => {
    for (const model of namespace.models.values()) {
      for (const prop of model.properties.values()) {
        const source = propNotBefore(program, prop);
        if (!source || (source !== prop && source.model === prop.model))
          continue;
        reportDiagnostic(program, {
          code: "date-order-source-invalid",
          target: prop,
          format: { target: prop.name, source: source.name },
        });
      }
    }
    for (const child of namespace.namespaces.values()) visit(child);
  };
  visit(program.getGlobalNamespaceType());
}

function checkEncodedCheckboxGroup(
  program: Program,
  prop: ModelProperty,
): void {
  const contract = propEncodedCheckboxGroup(program, prop);
  if (!contract) return;

  const fail = (reason: string): void =>
    reportDiagnostic(program, {
      code: "encoded-checkbox-contract-invalid",
      target: prop,
      format: { name: prop.name, reason },
    });
  const enumeration = enumOf(prop.type);
  if (!enumeration) {
    fail("the field type is not an enum");
    return;
  }
  if (Object.keys(contract).sort().join(",") !== "choices,combinations") {
    fail("exactly choices and combinations must be declared");
    return;
  }
  const choices = contract.choices;
  const combinations = contract.combinations;
  if (
    !Array.isArray(choices) ||
    !Array.isArray(combinations) ||
    !choices.length
  ) {
    fail("choices and combinations must be non-empty arrays");
    return;
  }
  const typedChoices = choices as Record<string, unknown>[];
  if (
    typedChoices.some(
      (choice) =>
        !choice ||
        typeof choice !== "object" ||
        Array.isArray(choice) ||
        Object.keys(choice).sort().join(",") !== "code,label" ||
        typeof choice.code !== "string" ||
        !choice.code ||
        typeof choice.label !== "string" ||
        !choice.label,
    )
  ) {
    fail("each choice must contain one non-empty code and label");
    return;
  }
  const codes = typedChoices.map((choice) => choice.code as string);
  const labels = typedChoices.map((choice) => choice.label as string);
  if (
    new Set(codes).size !== codes.length ||
    new Set(labels).size !== labels.length
  ) {
    fail("choice codes and labels must be unique");
    return;
  }

  const values = new Set<string>();
  for (const raw of combinations as Record<string, unknown>[]) {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      Object.keys(raw).sort().join(",") !== "members,value" ||
      typeof raw.value !== "string" ||
      !raw.value ||
      !Array.isArray(raw.members) ||
      !raw.members.length ||
      raw.members.some(
        (member) => typeof member !== "string" || !codes.includes(member),
      ) ||
      new Set(raw.members).size !== raw.members.length ||
      values.has(raw.value)
    ) {
      fail(
        "every combination must have a unique value and unique known members",
      );
      return;
    }
    values.add(raw.value);
  }
  const enumValues = [...enumeration.members.values()].map((member) =>
    String(member.value ?? member.name),
  );
  if (
    enumValues.length !== values.size ||
    enumValues.some((value) => !values.has(value))
  ) {
    fail("combination values must exactly match the field enum");
  }
}

// ---------------------------------------------------------------------------
// cross-boundary calculation paths

function arrayItem(type: Type): Type | undefined {
  return type.kind === "Model" && type.indexer ? type.indexer.value : undefined;
}

function resolves(model: Model, path: string): boolean {
  let current: Type = model;
  for (const raw of path.split(".")) {
    const repeated = raw.endsWith("[*]");
    const name = repeated ? raw.slice(0, -3) : raw;
    if (current.kind !== "Model") return false;
    const property = current.properties.get(name);
    if (!property) return false;
    current = property.type;
    if (repeated) {
      const item = arrayItem(current);
      if (!item) return false;
      current = item;
    }
  }
  return true;
}

function contains(
  model: Model,
  target: Model,
  seen = new Set<Model>(),
): boolean {
  if (model === target) return true;
  if (seen.has(model)) return false;
  seen.add(model);
  for (const property of model.properties.values()) {
    let type: Type = property.type;
    const item = arrayItem(type);
    if (item) type = item;
    if (type.kind === "Model" && contains(type, target, seen)) return true;
  }
  return false;
}

/** Immediate composition parents of a model within one form's reachable type graph. */
function compositionParents(
  model: Model,
  target: Model,
  found = new Set<Model>(),
  visiting = new Set<Model>(),
): Set<Model> {
  if (visiting.has(model)) return found;
  const next = new Set(visiting).add(model);
  for (const property of model.properties.values()) {
    let type: Type = property.type;
    const item = arrayItem(type);
    if (item) type = item;
    if (type.kind !== "Model") continue;
    if (type === target) found.add(model);
    compositionParents(type, target, found, next);
  }
  return found;
}

function checkComputedPaths(program: Program, blocks: Block[]): void {
  const forms = blocks.filter(
    (block): block is Block & { model: Model } =>
      block.kind === "form" && block.model.kind === "Model",
  );
  const models: Model[] = [];
  const visit = (namespace: Namespace): void => {
    models.push(...namespace.models.values());
    for (const child of namespace.namespaces.values()) visit(child);
  };
  visit(program.getGlobalNamespaceType());

  for (const model of models) {
    for (const property of model.properties.values()) {
      const computed = propComputedFrom(program, property);
      if (!computed) continue;
      const owner = property.model;
      if (!owner) continue;
      for (const path of computed.paths) {
        const absolute = path.startsWith("/");
        const parentRelative = path.startsWith("../");
        const candidate = absolute
          ? path.slice(1)
          : parentRelative
            ? path.slice(3)
            : path;
        const containingForms = absolute
          ? forms.filter((form) => contains(form.model, owner))
          : [];
        const parents = parentRelative
          ? new Set(
              forms.flatMap((form) => [
                ...compositionParents(form.model, owner),
              ]),
            )
          : new Set<Model>();
        const valid = absolute
          ? // A question-bank file can compile without any form in scope. Defer its absolute
            // composition paths until a form actually composes the block; every containing
            // form must then satisfy the declared relationship.
            containingForms.length === 0 ||
            containingForms.every((form) => resolves(form.model, candidate))
          : parentRelative
            ? parents.size === 0 ||
              [...parents].every((parent) => resolves(parent, candidate))
            : resolves(owner, candidate);
        if (!valid) {
          reportDiagnostic(program, {
            code: "calculation-path-unresolved",
            target: property,
            format: {
              path,
              scope: absolute
                ? "its containing form"
                : parentRelative
                  ? "its containing block"
                  : owner.name,
            },
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// identity

/** Words that name a form rather than a meaning. */
const FORM_WORDS = [
  "sf424",
  "sf-424",
  "sf424a",
  "sf424b",
  "sf424c",
  "sf424d",
  "rr",
  "sflll",
  "cd511",
  "epa",
  "neh",
  "phs",
  "key-contacts",
  "key_contacts",
  "lobbying",
  "profile",
  "short",
];

function checkQuestionIds(program: Program, blocks: Block[]): void {
  for (const block of blocks) {
    if (block.kind !== "question") continue;
    const id = block.id.toLowerCase();
    const pathSegments = id.split("/");
    const wordSegments = id.split(/[/\-_]/);
    const offender = FORM_WORDS.find(
      (word) => pathSegments.includes(word) || wordSegments.includes(word),
    );
    if (offender) {
      reportDiagnostic(program, {
        code: "form-scoped-question-id",
        target: block.model,
        format: { id: block.id },
      });
    }
  }
}

/**
 * Two blocks claiming one id would write to one output path, and the second would win
 * silently. The usual cause is `model X is Y`, which copies the base's decorators --
 * including its identity -- where `extends` would not.
 */
function checkDuplicateIds(program: Program, blocks: Block[]): void {
  const byId = new Map<string, Block>();
  for (const block of blocks) {
    const first = byId.get(block.id);
    if (first) {
      reportDiagnostic(program, {
        code: "duplicate-block-id",
        target: block.model,
        format: {
          id: block.id,
          first: name(first.model),
          second: name(block.model),
        },
      });
      continue;
    }
    byId.set(block.id, block);
  }
}

const name = (type: Model | Scalar) => type.name || "an anonymous model";

// ---------------------------------------------------------------------------
// conditions

/** Every condition on a property, whichever effect it drives. */
function conditionsOf(program: Program, prop: ModelProperty): Condition[] {
  return [
    ...propVisibleWhen(program, prop),
    ...propEnabledWhen(program, prop),
    ...propReadOnlyWhen(program, prop),
    ...propRequiredWhen(program, prop),
    ...propValidationConstraintsWhen(program, prop).map(
      (item) => item.condition,
    ),
  ];
}

/**
 * A condition compares a source property against a literal. If the source is enumerated
 * and the literal is not one of its members, the condition can never hold -- so the field
 * it governs is permanently hidden, permanently read-only, or never required, and no test notices.
 */
function checkConditions(program: Program, prop: ModelProperty): void {
  const model = prop.model;
  if (!model) return;
  const atomic = (
    condition: Condition,
  ): Exclude<Condition, { operator: "any" }>[] =>
    condition.operator === "any" ? condition.predicates : [condition];
  for (const condition of conditionsOf(program, prop).flatMap(atomic)) {
    const declaringModel = conditionSourceModel(condition);
    if (declaringModel && declaringModel !== model) {
      reportDiagnostic(program, {
        code: "condition-source-not-sibling",
        target: prop,
        format: { source: condition.sourcePath.join("."), target: prop.name },
      });
      continue;
    }
    const source = conditionSource(model, condition.sourcePath);
    if (!source) {
      reportDiagnostic(program, {
        code: "condition-path-unresolved",
        target: prop,
        format: { path: condition.sourcePath.join("."), model: model.name },
      });
      continue;
    }
    const enumeration = enumOf(source.type);
    if (!enumeration) continue;
    const members = [...enumeration.members.values()].map(
      (m) => m.value ?? m.name,
    );
    const values =
      condition.operator === "in"
        ? condition.values
        : condition.operator === "equals"
          ? [condition.value]
          : [];
    for (const value of values) {
      if (members.includes(value as string | number)) continue;
      reportDiagnostic(program, {
        code: "condition-value-not-in-enum",
        target: prop,
        format: {
          value: String(value),
          enumName: enumeration.name,
          members:
            members.slice(0, 6).join(", ") +
            (members.length > 6 ? ", ..." : ""),
        },
      });
    }
  }
}

function conditionSource(
  model: Model,
  path: string[],
): ModelProperty | undefined {
  let current: Model = model;
  let property: ModelProperty | undefined;
  for (const [index, step] of path.entries()) {
    property = modelProperties(current).find((item) => item.name === step);
    if (!property) return undefined;
    if (index === path.length - 1) return property;
    if (property.type.kind !== "Model" || property.type.indexer)
      return undefined;
    current = property.type;
  }
  return property;
}

/** The enum behind a property's type, looking through an array. */
function enumOf(type: Type): Enum | undefined {
  if (type.kind === "Enum") return type;
  if (type.kind === "Model" && type.indexer) return enumOf(type.indexer.value);
  return undefined;
}

/**
 * A field that is always required but only sometimes visible is a dead end: the applicant
 * cannot submit and cannot see why. This is the check that is impossible in the shipping
 * architecture, where requiredness lives in the JSON Schema and visibility in the UI
 * schema, in different languages.
 */
function checkRequiredButHidden(program: Program, prop: ModelProperty): void {
  if (prop.optional) return;
  if (!propVisibleWhen(program, prop).length) return;
  reportDiagnostic(program, {
    code: "required-but-unreachable",
    target: prop,
    format: { name: prop.name },
  });
}

// ---------------------------------------------------------------------------
// sections and overrides

function checkSections(program: Program, block: Block): void {
  if (block.kind !== "form" || !block.sections) return;
  for (const prop of orderedProps(program, block)) {
    if (propOmit(program, prop)) continue;
    if (propSection(program, prop)) continue;
    if (typeof block.overrides[prop.name]?.section === "string") continue;
    reportDiagnostic(program, {
      code: "section-orphan",
      target: prop,
      format: { name: prop.name },
    });
  }
}

/**
 * An override addresses a field by the path an applicant's answer takes. A path that does
 * not resolve is a silently ignored override -- the CommonGrants bank's stringly-typed
 * override table, caught at compile time instead of at website build time.
 */
function checkOverridePaths(program: Program, block: Block): void {
  const paths = Object.keys(block.overrides);
  for (const [overridePath, override] of Object.entries(block.overrides)) {
    if (override.visibleReadOnly === true && override.readOnly !== true) {
      reportDiagnostic(program, {
        code: "visible-read-only-without-read-only",
        target: block.model,
        format: { path: overridePath },
      });
    }
    const condition = override.enabledWhen;
    const enabledWhen = condition as Record<string, unknown> | undefined;
    if (
      enabledWhen &&
      typeof enabledWhen === "object" &&
      !Array.isArray(enabledWhen) &&
      typeof enabledWhen.path === "string"
    ) {
      paths.push(enabledWhen.path);
    }
  }
  for (const path of paths) {
    const reason = resolvePath(program, block.model as Model, path.split("."));
    if (!reason) continue;
    reportDiagnostic(program, {
      code: "override-path-unresolved",
      target: block.model,
      format: { path, reason },
    });
  }
}

/** Undefined when the path resolves; otherwise why it did not. */
function resolvePath(
  program: Program,
  model: Model,
  steps: string[],
): string | undefined {
  let current: Model | undefined = model;
  for (const [index, step] of steps.entries()) {
    if (!current) return `${steps.slice(0, index).join(".")} is not an object`;
    const prop = allProperties(current).get(step);
    if (!prop) {
      const known = [...allProperties(current).keys()].slice(0, 8).join(", ");
      return `${current.name || "the model"} has no property "${step}" (has ${known})`;
    }
    if (index === steps.length - 1) return undefined;
    current = objectBehind(program, prop);
  }
  return undefined;
}

/** Own and inherited properties, the derived declaration winning. */
function allProperties(model: Model): Map<string, ModelProperty> {
  const out = new Map<string, ModelProperty>();
  const chain: Model[] = [];
  for (let m: Model | undefined = model; m; m = m.baseModel) chain.unshift(m);
  for (const m of chain)
    for (const prop of m.properties.values()) out.set(prop.name, prop);
  return out;
}

/** The object a property holds, whether directly or as the entries of a list. */
function objectBehind(
  program: Program,
  prop: ModelProperty,
): Model | undefined {
  const type = prop.type;
  if (type.kind !== "Model") return undefined;
  if (type.indexer) {
    const item = type.indexer.value;
    return item.kind === "Model" ? item : undefined;
  }
  const block = childBlock(program, prop);
  if (block && block.scalar) return undefined;
  return type;
}

/** A widget declaration naming a section the form does not have would render nothing. */
// ---------------------------------------------------------------------------
// calculations

/** A materialization policy is meaningful only on a declared calculation. */
function checkCalculationMaterialization(
  program: Program,
  blocks: Block[],
): void {
  const seen = new Set<Model>();
  for (const block of blocks) {
    if (block.model.kind !== "Model") continue;
    walkModels(program, block.model, seen, (model) => {
      for (const prop of model.properties.values()) {
        if (!propCalculationMaterialization(program, prop)) continue;
        if (propComputed(program, prop) || propComputedFrom(program, prop))
          continue;
        reportDiagnostic(program, {
          code: "calculation-materialization-without-calculation",
          target: prop,
          format: { name: prop.name },
        });
      }
    });
  }
}

/**
 * A calculated value that depends on itself has no evaluation order, so a consumer would
 * emit a rule the runtime cannot satisfy. The cycle is reported once, naming the loop.
 */
function checkCalculationCycles(program: Program, blocks: Block[]): void {
  const seen = new Set<Model>();
  for (const block of blocks) {
    if (block.model.kind !== "Model") continue;
    walkModels(program, block.model, seen, (model) => {
      const edges = new Map<string, string[]>();
      for (const prop of model.properties.values()) {
        const computed = propComputed(program, prop);
        if (computed) edges.set(prop.name, computed.refs);
      }
      for (const start of edges.keys()) {
        const cycle = findCycle(start, edges);
        if (!cycle) continue;
        reportDiagnostic(program, {
          code: "calculation-cycle",
          target: model.properties.get(start)!,
          format: { cycle: cycle.join(" -> ") },
        });
        return;
      }
    });
  }
}

function findCycle(
  start: string,
  edges: Map<string, string[]>,
): string[] | undefined {
  const path: string[] = [];
  const onPath = new Set<string>();
  const visit = (node: string): string[] | undefined => {
    if (onPath.has(node)) return [...path.slice(path.indexOf(node)), node];
    if (!edges.has(node)) return undefined;
    path.push(node);
    onPath.add(node);
    for (const next of edges.get(node)!) {
      const found = visit(next);
      if (found) return found;
    }
    path.pop();
    onPath.delete(node);
    return undefined;
  };
  return visit(start);
}

/** Every model reachable from a block, each visited once. */
function walkModels(
  program: Program,
  model: Model,
  seen: Set<Model>,
  visit: (model: Model) => void,
): void {
  if (seen.has(model)) return;
  seen.add(model);
  visit(model);
  for (const prop of model.properties.values()) {
    const next = objectBehind(program, prop);
    if (next) walkModels(program, next, seen, visit);
  }
}

/** The emitter needs the same notion of "all properties", derived declaration winning. */
export { allProperties as inheritedProperties };
