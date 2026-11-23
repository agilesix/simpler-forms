import type { Model, ModelProperty, Program } from "@typespec/compiler";
import {
  expectDiagnosticEmpty,
  expectDiagnostics,
} from "@typespec/compiler/testing";
import { describe, expect, it } from "vitest";
import {
  formulaBlock,
  formulaBlockFields,
  propFormula,
} from "../src/formula.js";
import { Tester, form, formMeta } from "./tester.js";

/** The SF-424C's cost row: a total, the part that isn't allowable, and the allowable rest. */
const ROW = `
  model Row {
    total?: string;
    nonAllowable?: string;
    @Formula.subtract(Row.total, Row.nonAllowable) allowable?: string;
  }
`;

const compile = async (body: string) => {
  const [{ program }, diagnostics] = await Tester.compileAndDiagnose(
    form(`${ROW}\n${body}`),
  );
  expectDiagnosticEmpty(diagnostics);
  return program;
};

const resolve = <T>(p: Program, ref: string) =>
  p.resolveTypeReference(`Forms.${ref}`)[0] as T;

/** A formula's sources, written as `From:field.field`, for comparison. */
const sources = (p: Program, ref: string) =>
  propFormula(p, resolve<ModelProperty>(p, ref))!.sources.map(
    ({ from, fields }) =>
      `${from ? `${from.name}:` : ""}${fields.map((f) => `${f.model?.name}.${f.name}`).join(" ")}`,
  );

describe("propFormula", () => {
  it("reads a field on the formula's own model from the formula's place", async () => {
    const p = await compile("");
    expect(propFormula(p, resolve(p, "Row.allowable"))!.name).toBe("subtract");
    expect(sources(p, "Row.allowable")).toEqual([
      "Row.total",
      "Row.nonAllowable",
    ]);
  });

  it("reads every item of a list through a path of fields", async () => {
    const p = await compile(`
      model Budget {
        rows?: Row[];
        @Formula.sum([Budget.rows, Row.total]) total?: string;
      }
    `);
    expect(sources(p, "Budget.total")).toEqual(["Budget.rows Row.total"]);
  });

  it("starts a path on a model that contains the formula", async () => {
    const p = await compile(`
      ${formMeta("funding")}
      model Funding {
        budget?: Budget;
        share?: Share;
      }
      model Budget { total?: string; }
      model Share {
        @Formula.sum([Funding.budget, Budget.total]) projectCosts?: string;
      }
    `);
    expect(sources(p, "Share.projectCosts")).toEqual([
      "Funding:Funding.budget Budget.total",
    ]);
  });

  it("resolves a copy's formula to its original's fields", async () => {
    const p = await compile(`
      model Copied is Row;
      model Spread { ...Row; }
    `);
    for (const ref of ["Copied.allowable", "Spread.allowable"])
      expect(sources(p, ref)).toEqual(["Row.total", "Row.nonAllowable"]);
  });

  it("keeps percentOf's amount and percentage in order", async () => {
    const p = await compile(`
      model Funding {
        costs?: string;
        rate?: int32;
        @Formula.percentOf(Funding.costs, Funding.rate) share?: string;
      }
    `);
    expect(sources(p, "Funding.share")).toEqual([
      "Funding.costs",
      "Funding.rate",
    ]);
  });
});

describe("formulaBlockFields", () => {
  it("skips the fields a block calculates and walks nested blocks", async () => {
    const p = await compile(`
      model Section {
        row?: Row;
        note?: string;
      }
    `);
    const fields = formulaBlockFields(p, resolve<Model>(p, "Section"));
    expect(fields.map((path) => path.map((f) => f.name).join("."))).toEqual([
      "row.total",
      "row.nonAllowable",
      "note",
    ]);
  });

  it("treats a list as one field, not a block", async () => {
    const p = await compile(`model Lines { rows?: Row[]; }`);
    const rows = resolve<ModelProperty>(p, "Lines.rows");
    expect(formulaBlock(rows.type)).toBeUndefined();
  });
});

describe("$onValidate", () => {
  const diagnose = (body: string) => Tester.diagnose(form(`${ROW}\n${body}`));

  it.each([
    [
      "two formulas on one answer",
      `model Budget {
         a?: string;
         @Formula.sum(Budget.a) @Formula.sum(Budget.a) total?: string;
       }`,
      "duplicate-formula",
      "total has more than one @Formula. Keep one formula for this answer.",
    ],
    [
      "a path whose fields don't chain",
      `model Other { total?: string; }
       model Budget {
         rows?: Row[];
         @Formula.sum([Budget.rows, Other.total]) total?: string;
       }`,
      "formula-path-invalid",
      "total can't read rows.total: Other.total isn't a field of rows.",
    ],
    [
      "a field on a model that doesn't contain the formula",
      `model Other { amount?: string; }
       model Budget {
         @Formula.sum(Other.amount) total?: string;
       }`,
      "formula-source-unreachable",
      "total reads Other.amount, but Other isn't Budget or a model that contains it.",
    ],
    [
      "a block that reads a different block",
      `model Other { amount?: string; }
       model Budget {
         row?: Row;
         @Formula.sum(Budget.row) totals?: Other;
       }`,
      "formula-block-mismatch",
      "totals has the block type Other, so it's calculated field by field, but row doesn't.",
    ],
    [
      "a percentage of a block",
      `model Budget {
         row?: Row;
         rate?: int32;
         @Formula.percentOf(Budget.row, Budget.rate) share?: Row;
       }`,
      "formula-block-percent",
      "share has the block type Row, and @Formula.percentOf takes a percentage of one amount, not of a block.",
    ],
    [
      "one value that reads a block",
      `model Budget {
         row?: Row;
         @Formula.sum(Budget.row) total?: string;
       }`,
      "formula-reads-block",
      "total is one value, but row has the block type Row. Give total that type to calculate it field by field.",
    ],
    [
      "formulas that read each other",
      `model Budget {
         @Formula.sum(Budget.b) a?: string;
         @Formula.sum(Budget.a) b?: string;
       }`,
      "formula-cycle",
      "a reads itself through Budget.a -> Budget.b -> Budget.a. Remove one of the formulas in the loop.",
    ],
    [
      "a formula that reads itself through a block",
      `model Budget {
         @Formula.sum(Budget.combined) combined?: Row;
       }`,
      "formula-cycle",
      "combined reads itself through Budget.combined -> Budget.combined. Remove one of the formulas in the loop.",
    ],
    [
      "formulas added to a copy that read each other",
      `model Copied is Row;
       @@Formula.sum(Copied.total, Copied.nonAllowable);
       @@Formula.sum(Copied.nonAllowable, Copied.total);`,
      "formula-cycle",
      "total reads itself through Copied.total -> Copied.nonAllowable -> Copied.total. Remove one of the formulas in the loop.",
    ],
    [
      "a formula added to a copy that reads a model that doesn't contain it",
      `model Other { amount?: string; }
       model Copied is Row;
       @@Formula.sum(Copied.total, Other.amount);`,
      "formula-source-unreachable",
      "total reads Other.amount, but Other isn't Row or a model that contains it.",
    ],
  ])("reports %s", async (_, body, code, message) => {
    expectDiagnostics(await diagnose(body), {
      code: `simpler-forms/${code}`,
      message,
    });
  });

  it("accepts the patterns of the SF-424 family's budgets", async () => {
    expectDiagnosticEmpty(
      await diagnose(`
        model Section {
          land?: Row;
          site?: Row;
          @Formula.sum(Section.land, Section.site) subtotal?: Row;
          income?: Row;
          @Formula.subtract(Section.subtotal, Section.income) net?: Row;
          lines?: Row[];
          @Formula.sum(Section.lines) lineTotals?: Row;
          @Formula.sum([Section.lines, Row.allowable]) allowable?: string;
        }
        ${formMeta("budget")}
        model Budget {
          section?: CopiedSection;
          funding?: Funding;
        }
        model CopiedSection is Section;
        model Base { inherited?: string; }
        model Extended extends Base {
          own?: string;
          @Formula.sum(Extended.inherited, Extended.own) total?: string;
        }
        model Funding {
          @Formula.sum([Budget.section, Section.net, Row.allowable]) costs?: string;
          rate?: int32;
          @Formula.percentOf(Funding.costs, Funding.rate) share?: string;
        }
      `),
    );
  });
});
