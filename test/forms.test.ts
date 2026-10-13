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

describe("@Meta.form", () => {
  it("accepts a form that lays itself out", async () => {
    expectDiagnosticEmpty(
      await Tester.diagnose(
        form(`
          ${formMeta("contact-form")}
          model ContactForm { name?: string; }
        `),
      ),
    );
  });

  it("rejects a platform's identity for the form, as a type error", async () => {
    const diagnostics = await Tester.diagnose(
      form(`
        @Meta.form(#{ id: "contact-form", formName: "Contact", formVersion: "1.0" })
        model ContactForm { name?: string; }
      `),
    );
    expect(diagnostics.map((d) => d.code)).toContain("invalid-argument");
  });

  it("reports two forms with one id", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        form(`
          ${formMeta("contact-form")}
          model ContactForm { name?: string; }

          @Meta.form(#{ id: "contact-form", formName: "Other" })
          model OtherForm { name?: string; }
        `),
      ),
      { code: "simpler-forms/duplicate-block-id" },
    );
  });

  it("writes the form's identity in the manifest", async () => {
    const { json } = await emit(
      emitted(`
        @Meta.form(#{ id: "contact-form", formName: "CONTACT FORM", revision: "b" })
        model ContactForm { name?: string; }
      `),
    );
    expect(json("forms/contact-form/manifest.json")).toEqual({
      contract: "resolved-form-package/v1",
      form: { id: "contact-form", formName: "CONTACT FORM", revision: "b" },
      artifacts: {
        "schema.json": "generated",
        "ui.json": "generated",
        "index.json": "generated",
      },
    });
    expect(json("forms/contact-form/index.json").kind).toEqual("form");
  });

  it("leaves the form's label out of its schema", async () => {
    const { json } = await emit(
      emitted(`
        ${formMeta("contact-form")}
        @UI.label("CONTACT FORM")
        model ContactForm { @UI.label("Name") name?: string; }
      `),
    );
    const schema = json("forms/contact-form/schema.json");
    expect(schema.title).toBeUndefined();
    expect(schema.properties.name.title).toEqual("Name");
  });
});
