import {
  createTester,
  expectDiagnosticEmpty,
  expectDiagnostics,
} from "@typespec/compiler/testing";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { Tester, form, formMeta } from "./tester.js";

/** The emitter composes `@typespec/json-schema`, so these fixtures load it as well. */
const EmitTester = createTester(fileURLToPath(new URL("..", import.meta.url)), {
  libraries: ["simpler-forms", "@typespec/json-schema"],
});

type Json = Record<string, any>;

const emit = async (code: string) => {
  const { outputs } = await EmitTester.emit("simpler-forms").compile(code);
  return {
    paths: Object.keys(outputs).sort(),
    json: (path: string): Json => {
      const text = outputs[path];
      if (text === undefined)
        throw new Error(
          `no ${path}; emitted ${Object.keys(outputs).join(", ")}`,
        );
      return JSON.parse(text);
    },
  };
};

const emitted = (body: string) => `
  import "simpler-forms";
  import "@typespec/json-schema";
  using SimplerForms;
  @JsonSchema.jsonSchema
  namespace Forms {
    ${body}
  }
`;

describe("@Meta.submission and @Meta.form", () => {
  it("accepts a submission that presents itself", async () => {
    expectDiagnosticEmpty(
      await Tester.diagnose(
        form(`
          ${formMeta("contact-form")}
          model ContactForm { name?: string; }
        `),
      ),
    );
  });

  it("rejects a form with no submission", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        form(`
          @Meta.form(#{ id: "contact-form", formName: "Contact" })
          model ContactForm { name?: string; }
        `),
      ),
      {
        code: "simpler-forms/layout-form-without-submission",
        message: /ContactForm has @Meta.form but no @Meta.submission/,
      },
    );
  });

  it("rejects a form restating a submission fact, as a type error", async () => {
    const diagnostics = await Tester.diagnose(
      form(`
        @Meta.submission(#{ id: "contact-form", shortFormName: "C", formVersion: "1.0" })
        @Meta.form(#{ formName: "Contact", formVersion: "1.1" })
        model ContactForm { name?: string; }
      `),
    );
    expect(diagnostics.map((d) => d.code)).toContain("invalid-argument");
  });

  it("reports two forms published under one id on both", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        form(`
          ${formMeta("contact-form")}
          model ContactForm { name?: string; }

          @Meta.submission(#{ id: "other-form", shortFormName: "O", formVersion: "1.0" })
          @Meta.form(#{ id: "contact-form", formName: "Other" })
          model OtherForm { name?: string; }
        `),
      ),
      [
        { code: "simpler-forms/layout-form-id-duplicate" },
        { code: "simpler-forms/layout-form-id-duplicate" },
      ],
    );
  });

  it("writes the form and its submission separately in the manifest", async () => {
    const { json } = await emit(
      emitted(`
        @Meta.submission(#{
          id: "contact-form",
          shortFormName: "Contact",
          formVersion: "2.0",
          ombNumber: "0000-0000",
        })
        @Meta.form(#{ formName: "CONTACT FORM", revision: "b" })
        model ContactForm { name?: string; }
      `),
    );
    expect(json("forms/contact-form/manifest.json")).toEqual({
      contract: "resolved-form-package/v1",
      form: { id: "contact-form", formName: "CONTACT FORM", revision: "b" },
      submission: {
        id: "contact-form",
        shortFormName: "Contact",
        formVersion: "2.0",
        ombNumber: "0000-0000",
      },
      artifacts: {
        "schema.json": "generated",
        "ui.json": "generated",
        "index.json": "generated",
      },
    });
    expect(json("forms/contact-form/index.json").kind).toEqual("form");
  });
});
