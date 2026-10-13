import {
  createTester,
  expectDiagnosticEmpty,
  expectDiagnostics,
} from "@typespec/compiler/testing";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { Tester, bank } from "./tester.js";

/** The emitter composes `@typespec/json-schema`, so these fixtures load it as well. */
const EmitTester = createTester(fileURLToPath(new URL("..", import.meta.url)), {
  libraries: ["simpler-forms", "@typespec/json-schema"],
});

const emitIndex = async (code: string, id: string) => {
  const { outputs } = await EmitTester.emit("simpler-forms").compile(code);
  return JSON.parse(outputs[`question-bank/${id}/index.json`]!);
};

describe("tag-not-declared", () => {
  it("rejects a tag from an enum no namespace declares with @Meta.tags", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        bank(`
          enum Undeclared { contact }

          /** A name. */
          @Meta.question(#{ id: "poc/name" })
          @Meta.tag(Undeclared.contact)
          model Name { first?: string; }
        `),
      ),
      { code: "simpler-forms/tag-not-declared" },
    );
  });

  it("rejects a tag on a bare scalar from an undeclared enum", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        bank(`
          enum Undeclared { money }

          @Meta.tag(Undeclared.money)
          scalar Amount extends string;
        `),
      ),
      { code: "simpler-forms/tag-not-declared" },
    );
  });

  it("accepts a tag from the program's declared set", async () => {
    expectDiagnosticEmpty(
      await Tester.diagnose(
        bank(`
          /** A name. */
          @Meta.question(#{ id: "poc/name" })
          @Meta.tag(TagName.name)
          model Name { first?: string; }
        `),
      ),
    );
  });
});

describe("entity-not-declared", () => {
  it("rejects an entity from an enum no namespace declares with @Meta.entities", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        bank(`
          enum Undeclared { poc }

          /** A name. */
          @Meta.question(#{ id: "poc/name", entity: Undeclared.poc })
          @Meta.tag(TagName.name)
          model Name { first?: string; }
        `),
      ),
      { code: "simpler-forms/entity-not-declared" },
    );
  });

  it("accepts an entity from the program's declared set", async () => {
    expectDiagnosticEmpty(
      await Tester.diagnose(
        bank(`
          /** A name. */
          @Meta.question(#{ id: "poc/name", entity: EntityName.poc })
          @Meta.tag(TagName.name)
          model Name { first?: string; }
        `),
      ),
    );
  });
});

describe("a question's catalogue entry", () => {
  const code = `
    import "simpler-forms";
    import "@typespec/json-schema";
    using SimplerForms;

    @Meta.tags(Tag)
    @Meta.entities(Entity)
    namespace Catalogue {
      enum Tag { person, phone: "phone-number" }
      enum Entity { poc: "point-of-contact" }
    }

    @JsonSchema.jsonSchema
    namespace QuestionBank {
      /** A point of contact. */
      @Meta.question(#{ id: "poc/details", entity: Catalogue.Entity.poc })
      @Meta.tag(Catalogue.Tag.person, Catalogue.Tag.phone)
      model Contact { name?: string; }
    }
  `;

  it("lists each tag under its string value, or its name", async () => {
    const index = await emitIndex(code, "poc/details");
    expect(index.tags).toEqual(["person", "phone-number"]);
  });

  it("names the entity the question is asked about", async () => {
    const index = await emitIndex(code, "poc/details");
    expect(index.entity).toEqual("point-of-contact");
  });
});
