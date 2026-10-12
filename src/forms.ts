import type { Diagnostic, Model, Program } from "@typespec/compiler";
import { createDiagnostic } from "./lib.js";
import {
  type Block,
  type FormMeta,
  allFormMetas,
  allLayouts,
  readBlock,
} from "./model.js";

/** One form an applicant opens, published under its own id. */
export interface PublishedForm {
  id: string;
  /** The model carrying `@Meta.form`: a submission, or a `@UI.layout` of one. */
  model: Model;
  meta: FormMeta & { id: string };
  /** The submission this form presents, whose schema it publishes. */
  submission: Block;
  /** Set when the form is a layout of its submission rather than the submission itself. */
  layout?: Model;
}

/**
 * Every `@Meta.form` that can be published, and the problems that stop the others.
 *
 * A form is a submission presenting itself, whose id it takes unless it gives one, or a
 * `@UI.layout` of a submission, which must give its own.
 */
export function resolveForms(program: Program): {
  forms: PublishedForm[];
  problems: Diagnostic[];
} {
  const forms: PublishedForm[] = [];
  const problems: Diagnostic[] = [];
  const byId = new Map<string, PublishedForm>();
  const layouts = allLayouts(program);

  for (const [model, meta] of allFormMetas(program)) {
    const presented = layouts.get(model);
    const submission = readBlock(program, presented ?? model);
    if (submission?.kind !== "submission") {
      problems.push(
        createDiagnostic({
          code: "layout-form-without-submission",
          messageId: presented ? "layout" : "default",
          target: model,
          format: { name: model.name, presented: presented?.name ?? "" },
        }),
      );
      continue;
    }
    const id = meta.id ?? (presented ? undefined : submission.id);
    if (!id) {
      problems.push(
        createDiagnostic({
          code: "layout-form-id",
          target: model,
          format: { name: model.name, submission: submission.model.name },
        }),
      );
      continue;
    }
    const form: PublishedForm = {
      id,
      model,
      meta: { ...meta, id },
      submission,
      ...(presented ? { layout: model } : {}),
    };
    const first = byId.get(id);
    if (first) {
      for (const target of [first.model, model])
        problems.push(
          createDiagnostic({
            code: "layout-form-id-duplicate",
            target,
            format: { id, first: first.model.name, second: model.name },
          }),
        );
      continue;
    }
    byId.set(id, form);
    forms.push(form);
  }

  return { forms, problems };
}
