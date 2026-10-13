import type { Diagnostic, Model, Program } from "@typespec/compiler";
import { createDiagnostic } from "./lib.js";
import {
  type Block,
  type FormMeta,
  allFormMetas,
  allLayouts,
  modelFormMeta,
  readBlock,
} from "./model.js";

/** One form an applicant opens, published under its id. */
export interface PublishedForm {
  id: string;
  /** The model carrying `@Meta.form`, whose schema the form publishes. */
  model: Model;
  meta: FormMeta;
  block: Block;
  /** The `@UI.layout` presenting the form, when its own fields do not lay it out. */
  layout?: Model;
}

/**
 * Every `@Meta.form` that can be published, and the problems that stop the others.
 *
 * A form's fields lay it out, unless one `@UI.layout` model presents it. A layout of a
 * model with no `@Meta.form` is reported, and so is a form with two layouts, which is not
 * published. Two forms with one id are reported as `duplicate-block-id`.
 */
export function resolveForms(program: Program): {
  forms: PublishedForm[];
  problems: Diagnostic[];
} {
  const forms: PublishedForm[] = [];
  const problems: Diagnostic[] = [];

  const layoutsOf = new Map<Model, Model[]>();
  for (const [layout, presented] of allLayouts(program)) {
    if (!modelFormMeta(program, presented)) {
      problems.push(
        createDiagnostic({
          code: "layout-not-form",
          target: layout,
          format: { name: layout.name, presented: presented.name },
        }),
      );
      continue;
    }
    layoutsOf.set(presented, [...(layoutsOf.get(presented) ?? []), layout]);
  }

  const ids = new Set<string>();
  for (const [model, meta] of allFormMetas(program)) {
    const layouts = layoutsOf.get(model) ?? [];
    if (layouts.length > 1) {
      for (const target of layouts)
        problems.push(
          createDiagnostic({
            code: "layout-duplicate",
            target,
            format: {
              form: model.name,
              first: layouts[0].name,
              second: layouts[1].name,
            },
          }),
        );
      continue;
    }
    if (ids.has(meta.id)) continue;
    ids.add(meta.id);
    forms.push({
      id: meta.id,
      model,
      meta,
      block: readBlock(program, model)!,
      ...(layouts.length ? { layout: layouts[0] } : {}),
    });
  }

  return { forms, problems };
}
