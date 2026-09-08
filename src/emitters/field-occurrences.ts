import type {
  Model,
  ModelProperty,
  Program,
  Scalar,
  Type,
} from "@typespec/compiler";
import {
  type Block,
  type ResponseRole,
  blockAncestry,
  modelProperties,
  propResponseRole,
  readBlock,
  typeResponseRole,
} from "../model.js";

/** Portable attribution for one field or group in a form's canonical response tree. */
export interface FieldOccurrence {
  path: string;
  leaf: boolean;
  blockIds: string[];
  responseRole?: ResponseRole;
}

interface TemplateContext {
  model: Model;
  blockIds: string[];
  responseRole?: ResponseRole;
}

/**
 * Emit the field graph from the TypeSpec type graph while that graph is still available.
 *
 * JSON Schema faithfully preserves validation and composition but deliberately does not retain
 * authoring facts such as a property arriving through `...Question`, or a form-local subtype
 * overriding one member of a canonical question. Capturing those facts in the portable index keeps
 * analyzers and other consumers off the TypeSpec AST without inventing JSON Schema keywords.
 */
export function emitFieldOccurrences(
  program: Program,
  form: Block,
): FieldOccurrence[] {
  if (form.kind !== "form" || form.model.kind !== "Model") return [];

  const found = new Map<string, FieldOccurrence>();

  const record = (occurrence: FieldOccurrence): void => {
    const existing = found.get(occurrence.path);
    if (!existing) {
      found.set(occurrence.path, occurrence);
      return;
    }
    existing.leaf = existing.leaf && occurrence.leaf;
    existing.blockIds = sortedUnique([
      ...existing.blockIds,
      ...occurrence.blockIds,
    ]);
    existing.responseRole ??= occurrence.responseRole;
  };

  const walkModel = (
    model: Model,
    parentPath: string,
    templates: TemplateContext[],
    inheritedRole: ResponseRole | undefined,
    stack: Set<Model>,
  ): void => {
    if (stack.has(model)) return;
    const nextStack = new Set(stack).add(model);

    for (const property of modelProperties(model)) {
      const path = `${parentPath}/${escapePointer(property.name)}`;
      const matches = matchingTemplates(property.name, templates);
      const sources = sourceProperties(property);
      const directIds = blockIdsForType(program, property.type);
      const sourceIds = sources.flatMap((source) =>
        blockIdsForPropertyOwner(program, source),
      );
      const blockIds = sortedUnique([
        ...directIds,
        ...sourceIds,
        ...matches.flatMap((match) => match.context.blockIds),
        ...matches.flatMap((match) => [
          ...blockIdsForPropertyOwner(program, match.property),
          ...sourceProperties(match.property).flatMap((source) =>
            blockIdsForPropertyOwner(program, source),
          ),
        ]),
      ]);
      const responseRole = firstDefined(
        propResponseRole(program, property),
        roleForType(program, property.type),
        ...sources.map((source) => propResponseRole(program, source)),
        ...matches.map((match) => propResponseRole(program, match.property)),
        ...sources.map((source) => roleForPropertyOwner(program, source)),
        ...matches.map((match) => match.context.responseRole),
        inheritedRole,
      );

      const arrayItem = arrayItemType(property.type);
      if (arrayItem) {
        record({
          path,
          leaf: false,
          blockIds,
          ...(responseRole ? { responseRole } : {}),
        });
      }
      const valuePath = arrayItem ? `${path}/[]` : path;
      const valueType = arrayItem ?? property.type;
      const childModel = objectModel(valueType);

      if (!childModel) {
        record({
          path: valuePath,
          leaf: true,
          blockIds: sortedUnique([
            ...blockIds,
            ...blockIdsForType(program, valueType),
          ]),
          ...(responseRole ? { responseRole } : {}),
        });
        continue;
      }

      const childTemplates = templateContextsForChild(
        program,
        property,
        valueType,
        matches,
        sources,
      );
      record({
        path: valuePath,
        leaf: false,
        blockIds: sortedUnique([
          ...blockIds,
          ...blockIdsForType(program, valueType),
        ]),
        ...(responseRole ? { responseRole } : {}),
      });
      walkModel(childModel, valuePath, childTemplates, responseRole, nextStack);
    }
  };

  const inheritedTemplates: TemplateContext[] = [];
  for (let base = form.model.baseModel; base; base = base.baseModel) {
    const block = readBlock(program, base);
    inheritedTemplates.push({
      model: base,
      blockIds: block?.kind === "question" ? blockAncestry(program, base) : [],
      responseRole: block?.responseRole,
    });
  }
  walkModel(form.model, "", inheritedTemplates, form.responseRole, new Set());
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function matchingTemplates(name: string, contexts: TemplateContext[]) {
  return contexts.flatMap((context) => {
    const property = modelProperties(context.model).find(
      (candidate) => candidate.name === name,
    );
    return property ? [{ context, property }] : [];
  });
}

function templateContextsForChild(
  program: Program,
  property: ModelProperty,
  valueType: Type,
  matches: ReturnType<typeof matchingTemplates>,
  sources: ModelProperty[],
): TemplateContext[] {
  const contexts: TemplateContext[] = [];

  for (const { context, property: templateProperty } of matches) {
    const templateType =
      arrayItemType(templateProperty.type) ?? templateProperty.type;
    const templateModel = objectModel(templateType);
    if (!templateModel) continue;
    contexts.push({
      model: templateModel,
      blockIds: sortedUnique([
        ...context.blockIds,
        ...blockIdsForType(program, templateProperty.type),
      ]),
      responseRole: firstDefined(
        propResponseRole(program, templateProperty),
        roleForType(program, templateProperty.type),
        context.responseRole,
      ),
    });
  }

  for (const source of sources) {
    const sourceType = arrayItemType(source.type) ?? source.type;
    const sourceModel = objectModel(sourceType);
    if (!sourceModel) continue;
    contexts.push({
      model: sourceModel,
      blockIds: sortedUnique([
        ...blockIdsForPropertyOwner(program, source),
        ...blockIdsForType(program, source.type),
      ]),
      responseRole: firstDefined(
        propResponseRole(program, source),
        roleForType(program, source.type),
      ),
    });
  }

  const currentModel = objectModel(valueType);
  if (currentModel) {
    for (
      let candidate: Model | undefined = currentModel;
      candidate;
      candidate = candidate.baseModel
    ) {
      const block = readBlock(program, candidate);
      if (!block) continue;
      contexts.push({
        model: candidate,
        blockIds: blockAncestry(program, candidate),
        responseRole: block.responseRole,
      });
    }
  }

  return deduplicateContexts(contexts);
}

function sourceProperties(property: ModelProperty): ModelProperty[] {
  const found: ModelProperty[] = [];
  const seen = new Set<ModelProperty>();
  const addChain = (candidate: ModelProperty | undefined): void => {
    for (
      let current = candidate;
      current && !seen.has(current);
      current = current.sourceProperty
    ) {
      found.push(current);
      seen.add(current);
    }
  };
  addChain(property.sourceProperty);
  // A derived model may deliberately narrow or decorate an inherited member by
  // redeclaring it. TypeSpec does not retain that base member in sourceProperty, so
  // recover the same-named declaration through the base chain to preserve its semantic
  // question lineage in portable occurrence analysis.
  for (let base = property.model?.baseModel; base; base = base.baseModel) {
    addChain(base.properties.get(property.name));
  }
  return found;
}

function blockIdsForPropertyOwner(
  program: Program,
  property: ModelProperty,
): string[] {
  const owner = property.model;
  return owner ? blockAncestry(program, owner) : [];
}

function roleForPropertyOwner(
  program: Program,
  property: ModelProperty,
): ResponseRole | undefined {
  const owner = property.model;
  if (!owner) return undefined;
  for (
    let current: Model | undefined = owner;
    current;
    current = current.baseModel
  ) {
    const block = readBlock(program, current);
    if (block?.responseRole) return block.responseRole;
  }
  return undefined;
}

function blockIdsForType(program: Program, type: Type): string[] {
  const ids: string[] = [];
  const visit = (candidate: Type): void => {
    if (candidate.kind === "Model" || candidate.kind === "Scalar") {
      ids.push(...blockAncestry(program, candidate));
    }
    const item = arrayItemType(candidate);
    if (item && item !== candidate) visit(item);
  };
  visit(type);
  return sortedUnique(ids);
}

function roleForType(program: Program, type: Type): ResponseRole | undefined {
  const visit = (candidate: Type): ResponseRole | undefined => {
    if (candidate.kind === "Model" || candidate.kind === "Scalar") {
      for (let current: Model | Scalar | undefined = candidate; current;) {
        const role = typeResponseRole(program, current);
        if (role) return role;
        current =
          current.kind === "Model" ? current.baseModel : current.baseScalar;
      }
    }
    const item = arrayItemType(candidate);
    return item && item !== candidate ? visit(item) : undefined;
  };
  return visit(type);
}

function arrayItemType(type: Type): Type | undefined {
  return type.kind === "Model" && type.indexer ? type.indexer.value : undefined;
}

function objectModel(type: Type): Model | undefined {
  return type.kind === "Model" && !type.indexer ? type : undefined;
}

function deduplicateContexts(contexts: TemplateContext[]): TemplateContext[] {
  const found: TemplateContext[] = [];
  for (const context of contexts) {
    const duplicate = found.some(
      (candidate) =>
        candidate.model === context.model &&
        candidate.responseRole === context.responseRole &&
        candidate.blockIds.length === context.blockIds.length &&
        candidate.blockIds.every((id, index) => id === context.blockIds[index]),
    );
    if (!duplicate) found.push(context);
  }
  return found;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value): value is T => value !== undefined);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
