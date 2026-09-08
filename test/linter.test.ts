import {
  createLinterRuleTester,
  type LinterRuleTester,
} from "@typespec/compiler/testing";
import { beforeEach, describe, it } from "vitest";
import { $linter } from "../src/linter.js";
import { Tester, bank, form, formMeta } from "./tester.js";

const rule = (name: string) => {
  const found = $linter.rules.find((r) => r.name === name);
  if (!found) throw new Error(`no rule named ${name}`);
  return found;
};

async function tester(name: string): Promise<LinterRuleTester> {
  const instance = await Tester.createInstance();
  return createLinterRuleTester(instance, rule(name), "simpler-forms");
}

describe("no-orphan-question", () => {
  let lint: LinterRuleTester;
  beforeEach(async () => {
    lint = await tester("no-orphan-question");
  });

  it("reports a question nothing composes", async () => {
    await lint
      .expect(
        bank(`
          /** Unasked. */
          @Meta.question(#{ id: "generics/unasked" })
          @Meta.tag(TagName.name)
          scalar Unasked extends string;
        `),
      )
      .toEmitDiagnostics({
        code: "simpler-forms/no-orphan-question",
      });
  });

  it("counts composition through a property", async () => {
    await lint
      .expect(
        form(`
          /** Asked. */
          @Meta.question(#{ id: "generics/asked" })
          @Meta.tag(TagName.name)
          scalar Asked extends string;

          enum Section { only: "Only" }

          /** A form. */
          ${formMeta("asks")}
          @UI.sections(Section)
          model Asks {
            @UI.section(Section.only)
            field?: Asked;
          }
        `),
      )
      .toBeValid();
  });

  it("counts composition through `extends`", async () => {
    await lint
      .expect(
        bank(`
          /** A point of contact. */
          @Meta.question(#{ id: "poc/details" })
          @Meta.tag(TagName.person)
          model Poc {
            name: string;
          }

          /** A form-local extension. */
          @Meta.question(#{ id: "poc/extended" })
          @Meta.tag(TagName.person)
          model Extended extends Poc {
            role: string;
          }
        `),
      )
      .toEmitDiagnostics({
        // `poc/extended` is itself unasked; `poc/details` is not reported, because
        // extending it composes it.
        code: "simpler-forms/no-orphan-question",
        message: /poc\/extended/,
      });
  });

  it("counts composition reached through a model that is not a question", async () => {
    await lint
      .expect(
        form(`
          /** Quarters. */
          @Meta.question(#{ id: "budget/quarters" })
          @Meta.tag(TagName.money)
          model Quarters {
            q1?: string;
          }

          model Wrapper {
            federal?: Quarters;
          }

          enum Section { only: "Only" }

          /** A form. */
          ${formMeta("wraps")}
          @UI.sections(Section)
          model Wraps {
            @UI.section(Section.only)
            cash?: Wrapper;
          }
        `),
      )
      .toBeValid();
  });

  it("counts composition through a list", async () => {
    await lint
      .expect(
        form(`
          /** An attachment. */
          @Meta.question(#{ id: "generics/attachment" })
          @Meta.tag(TagName.attachment)
          scalar AttachmentRef extends string;

          enum Section { only: "Only" }

          /** A form. */
          ${formMeta("lists")}
          @UI.sections(Section)
          model Lists {
            @UI.section(Section.only)
            files?: AttachmentRef[];
          }
        `),
      )
      .toBeValid();
  });
});

describe("require-question-docs", () => {
  it("reports a question with no doc comment", async () => {
    const lint = await tester("require-question-docs");
    await lint
      .expect(
        bank(`
          @Meta.question(#{ id: "generics/undocumented" })
          @Meta.tag(TagName.name)
          scalar Undocumented extends string;
        `),
      )
      .toEmitDiagnostics({
        code: "simpler-forms/require-question-docs",
      });
  });

  it("accepts one with a doc comment", async () => {
    const lint = await tester("require-question-docs");
    await lint
      .expect(
        bank(`
          /** Documented. */
          @Meta.question(#{ id: "generics/documented" })
          @Meta.tag(TagName.name)
          scalar Documented extends string;
        `),
      )
      .toBeValid();
  });
});

describe("require-question-tags", () => {
  it("reports an untagged question", async () => {
    const lint = await tester("require-question-tags");
    await lint
      .expect(
        bank(`
          /** Untagged. */
          @Meta.question(#{ id: "generics/untagged" })
          scalar Untagged extends string;
        `),
      )
      .toEmitDiagnostics({
        code: "simpler-forms/require-question-tags",
      });
  });
});

describe("section-unused", () => {
  it("reports a section no field is placed in", async () => {
    const lint = await tester("section-unused");
    await lint
      .expect(
        form(`
          enum Section { used: "Used", empty: "Empty" }

          /** A form. */
          ${formMeta("half-empty")}
          @UI.sections(Section)
          model HalfEmpty {
            @UI.section(Section.used)
            field?: string;
          }
        `),
      )
      .toEmitDiagnostics({
        code: "simpler-forms/section-unused",
        message: /empty/,
      });
  });

  it("accepts a form whose sections are all used", async () => {
    const lint = await tester("section-unused");
    await lint
      .expect(
        form(`
          enum Section { used: "Used" }

          /** A form. */
          ${formMeta("full")}
          @UI.sections(Section)
          model Full {
            @UI.section(Section.used)
            field?: string;
          }
        `),
      )
      .toBeValid();
  });

  it("accepts a documented empty section as static presentation content", async () => {
    const lint = await tester("section-unused");
    await lint
      .expect(
        form(`
          enum Section {
            /** Read these instructions before continuing. */
            instructions: "Instructions",
            used: "Used",
          }

          /** A form. */
          ${formMeta("with-instructions")}
          @UI.sections(Section)
          model WithInstructions {
            @UI.section(Section.used)
            field?: string;
          }
        `),
      )
      .toBeValid();
  });
});

describe("order-incomplete", () => {
  it("reports an order that omits a property", async () => {
    const lint = await tester("order-incomplete");
    await lint
      .expect(
        bank(`
          /** Partly ordered. */
          @Meta.question(#{ id: "generics/partial" })
          @Meta.tag(TagName.name)
          @UI.order(Partial.b)
          model Partial {
            a?: string;
            b?: string;
          }
        `),
      )
      .toEmitDiagnostics({
        code: "simpler-forms/order-incomplete",
        message: /omits a/,
      });
  });

  it("accepts a complete order", async () => {
    const lint = await tester("order-incomplete");
    await lint
      .expect(
        bank(`
          /** Fully ordered. */
          @Meta.question(#{ id: "generics/complete" })
          @Meta.tag(TagName.name)
          @UI.order(Complete.b, Complete.a)
          model Complete {
            a?: string;
            b?: string;
          }
        `),
      )
      .toBeValid();
  });
});

describe("no-redeclared-property", () => {
  it("reports a derived block re-declaring what it inherits", async () => {
    const lint = await tester("no-redeclared-property");
    await lint
      .expect(
        bank(`
          /** A base. */
          @Meta.question(#{ id: "generics/base" })
          @Meta.tag(TagName.name)
          model Base {
            city?: string;
          }

          model Derived extends Base {
            city?: string;
          }
        `),
      )
      .toEmitDiagnostics({
        code: "simpler-forms/no-redeclared-property",
        message: /city/,
      });
  });

  it("accepts a derived block that only adds", async () => {
    const lint = await tester("no-redeclared-property");
    await lint
      .expect(
        bank(`
          /** A base. */
          @Meta.question(#{ id: "generics/base" })
          @Meta.tag(TagName.name)
          model Base {
            city?: string;
          }

          model Derived extends Base {
            county?: string;
          }
        `),
      )
      .toBeValid();
  });

  it("accepts a derived profile that changes a collection constraint", async () => {
    const lint = await tester("no-redeclared-property");
    await lint
      .expect(
        bank(`
          /** A base. */
          @Meta.question(#{ id: "generics/base" })
          @Meta.tag(TagName.generic)
          model Base {
            @maxItems(5)
            entries?: string[];
          }

          model TenEntryProfile extends Base {
            @maxItems(10)
            entries?: string[];
          }
        `),
      )
      .toBeValid();
  });

  it("accepts a derived profile that adds a source-backed default", async () => {
    const lint = await tester("no-redeclared-property");
    await lint
      .expect(
        bank(`
          enum Role { investigator: "Investigator" }

          /** A base. */
          @Meta.question(#{ id: "generics/base" })
          @Meta.tag(TagName.role)
          model Base {
            role: Role;
          }

          model DefaultedProfile extends Base {
            role: Role = Role.investigator;
          }
        `),
      )
      .toBeValid();
  });

  it("compares inherited count conditions without serializing compiler models", async () => {
    const lint = await tester("no-redeclared-property");
    await lint
      .expect(
        bank(`
          /** A base with a count-gated overflow field. */
          @Meta.question(#{ id: "generics/count-gated-base" })
          @Meta.tag(TagName.generic)
          model Base {
            people?: string[];
            @UI.enabledWhenCount(Base.people, 2)
            upload?: string;
          }

          model Derived extends Base {
            people?: string[];
            @UI.enabledWhenCount(Derived.people, 2)
            upload?: string;
          }
        `),
      )
      .toEmitDiagnostics({
        code: "simpler-forms/no-redeclared-property",
        message: /people, upload/,
      });
  });
});
