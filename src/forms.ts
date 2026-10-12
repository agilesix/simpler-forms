import type { Diagnostic, Model, Program } from "@typespec/compiler";
import { createDiagnostic } from "./lib.js";
import { type Block, type FormMeta, allFormMetas, readBlock } from "./model.js";

/** One form an applicant opens, published under its own id. */
export interface PublishedForm {
  id: string;
  /** The model carrying `@Meta.form`. */
  model: Model;
  meta: FormMeta & { id: string };
  /** The submission this form presents, whose schema it publishes. */
  submission: Block;
}

/**
 * Every `@Meta.form` that can be published, and the problems that stop the others.
 *
 * A form is a submission model presenting itself. Its id defaults to the submission's.
 */
export function resolveForms(program: Program): {
  forms: PublishedForm[];
  problems: Diagnostic[];
} {
  const forms: PublishedForm[] = [];
  const problems: Diagnostic[] = [];
  const byId = new Map<string, PublishedForm>();

  for (const [model, meta] of allFormMetas(program)) {
    const submission = readBlock(program, model);
    if (submission?.kind !== "submission") {
      problems.push(
        createDiagnostic({
          code: "layout-form-without-submission",
          target: model,
          format: { name: model.name },
        }),
      );
      continue;
    }
    const id = meta.id ?? submission.id;
    const form: PublishedForm = {
      id,
      model,
      meta: { ...meta, id },
      submission,
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
