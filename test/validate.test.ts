import {
  expectDiagnosticEmpty,
  expectDiagnostics,
} from "@typespec/compiler/testing";
import { describe, it } from "vitest";
import { Tester, bank, form, formMeta } from "./tester.js";

/**
 * Each check gets a fixture that must fail and one that must not. A check that cannot fire
 * is worse than no check: it reads as coverage and provides none.
 */
describe("$onValidate", () => {
  describe("at-least-one-invalid", () => {
    it("rejects fewer than two distinct alternatives", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          ${formMeta("alternative-check")}
          @Validation.atLeastOneOf(AlternativeCheck.first)
          model AlternativeCheck { first?: string; second?: string; }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/at-least-one-invalid",
      });
    });

    it("accepts two sibling alternatives", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            ${formMeta("alternative-check")}
            @Validation.atLeastOneOf(AlternativeCheck.first, AlternativeCheck.second)
            model AlternativeCheck { first?: string; second?: string; }
          `),
        ),
      );
    });
  });

  describe("cardinality-path-unresolved", () => {
    it("rejects cardinality on a non-block model whose annotation would not emit", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          @Validation.requiredPaths("name")
          model LocalDetails { name?: string; }
          ${formMeta("cardinality-model-check")}
          model CardinalityModelCheck { details?: LocalDetails; }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/cardinality-model-not-emitted",
      });
    });

    it("accepts cardinality on an emitted semantic question block", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          bank(`
            /** A reusable person's name. */
            @Meta.question(#{ id: "person/name" })
            @Meta.tag(TagName.name)
            @Validation.requiredPaths("firstName", "lastName")
            model PersonName { firstName?: string; lastName?: string; }
          `),
        ),
      );
    });

    it("rejects a required descendant path that is not in the composed object", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          model SharedDetails { name?: string; }
          ${formMeta("cardinality-check")}
          model CardinalityCheck {
            @Validation.requiredPaths("missing")
            details: SharedDetails;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/cardinality-path-unresolved",
      });
    });

    it("accepts nested required and conditional paths on one occurrence", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            enum Country { usa: "USA", other: "Other" }
            model Address { country?: Country; state?: string; }
            model SharedDetails { address?: Address; }
            ${formMeta("cardinality-check")}
            model CardinalityCheck {
              @Validation.requiredPaths("address.country")
              @Validation.requiredPathWhen("address.state", "address.country", Country.usa)
              details: SharedDetails;
            }
          `),
        ),
      );
    });

    it("rejects an unresolved conditional alternative path", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          ${formMeta("conditional-alternative-check")}
          @Validation.atLeastOnePathWhenPresent("trigger", "first", "missing")
          model ConditionalAlternativeCheck {
            trigger?: string;
            first?: string;
            second?: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/cardinality-path-unresolved",
      });
    });
  });

  describe("conditional-at-least-one-path-invalid", () => {
    it("rejects fewer than two distinct target paths", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          ${formMeta("conditional-alternative-check")}
          @Validation.atLeastOnePathWhenPresent("trigger", "first", "first")
          model ConditionalAlternativeCheck { trigger?: string; first?: string; }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/conditional-at-least-one-path-invalid",
      });
    });
  });

  describe("positive-decimal-string-target-invalid", () => {
    it("rejects a numeric target because the portable comparison contract is lexical", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          ${formMeta("positive-decimal-string-check")}
          @Validation.positiveDecimalStringWhenPathPresent("total", "attachment")
          model PositiveDecimalStringCheck { attachment?: string; total?: decimal; }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/positive-decimal-string-target-invalid",
      });
    });
  });

  describe("date-order-source-invalid", () => {
    it("rejects a date-order source outside the target model", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          model OtherPeriod { start: plainDate; }
          model Period {
            @Validation.notBefore(OtherPeriod.start)
            end: plainDate;
          }
          ${formMeta("date-order-check")}
          model DateOrderCheck { period: Period; }
        `),
      );

      expectDiagnostics(diagnostics, {
        code: "simpler-forms/date-order-source-invalid",
      });
    });

    it("accepts a different sibling date", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            model Period {
              start: plainDate;
              @Validation.notBefore(Period.start)
              end: plainDate;
            }
            ${formMeta("date-order-check")}
            model DateOrderCheck { period: Period; }
          `),
        ),
      );
    });
  });

  describe("encoded-checkbox-contract-invalid", () => {
    it("rejects a contract that does not cover every wire value", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          enum RevisionCode { A: "A", B: "B", AB: "AB" }
          ${formMeta("encoded-checkbox-check")}
          model EncodedCheckboxCheck {
            @UI.encodedCheckboxGroup(#{
              choices: #[
                #{ code: "A", label: "Increase award" },
                #{ code: "B", label: "Decrease award" },
              ],
              combinations: #[
                #{ value: "A", members: #["A"] },
                #{ value: "B", members: #["B"] },
              ],
            })
            revision?: RevisionCode;
          }
        `),
      );

      expectDiagnostics(diagnostics, {
        code: "simpler-forms/encoded-checkbox-contract-invalid",
      });
    });

    it("accepts a contract exactly matching the wire enum", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            enum RevisionCode { A: "A", B: "B", AB: "AB" }
            ${formMeta("encoded-checkbox-check")}
            model EncodedCheckboxCheck {
              @UI.encodedCheckboxGroup(#{
                choices: #[
                  #{ code: "A", label: "Increase award" },
                  #{ code: "B", label: "Decrease award" },
                ],
                combinations: #[
                  #{ value: "A", members: #["A"] },
                  #{ value: "B", members: #["B"] },
                  #{ value: "AB", members: #["A", "B"] },
                ],
              })
              revision?: RevisionCode;
            }
          `),
        ),
      );
    });
  });

  describe("calculation-path-unresolved", () => {
    it("rejects a misspelled path across a repeated boundary", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          /** Money. */
          @Meta.question(#{ id: "budget/money" })
          @Meta.tag(TagName.money)
          scalar Money extends string;

          model Period { amount?: Money; }
          model Summary {
            @Validation.computedFrom(Op.Sum, "/periods[*].amunt")
            total?: Money;
          }
          enum Section { only: "Only" }
          ${formMeta("path-check")}
          @UI.sections(Section)
          model PathCheck {
            @UI.section(Section.only) periods?: Period[];
            @UI.section(Section.only) summary?: Summary;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/calculation-path-unresolved",
      });
    });

    it("accepts an existing path across a repeated boundary", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            /** Money. */
            @Meta.question(#{ id: "budget/money" })
            @Meta.tag(TagName.money)
            scalar Money extends string;

            model Period { amount?: Money; }
            model Summary {
              @Validation.computedFrom(Op.Sum, "/periods[*].amount")
              total?: Money;
            }
            enum Section { only: "Only" }
            ${formMeta("path-check")}
            @UI.sections(Section)
            model PathCheck {
              @UI.section(Section.only) periods?: Period[];
              @UI.section(Section.only) summary?: Summary;
            }
          `),
        ),
      );
    });

    it("accepts a parent-scoped path inside a reusable nested composition", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            model Period { amount?: string; }
            model Summary {
              @Validation.computedFrom(Op.Sum, "../periods[*].amount")
              total?: string;
            }
            model BudgetDetails {
              periods?: Period[];
              summary?: Summary;
            }
            ${formMeta("nested-budget")}
            model NestedBudget { budgets?: BudgetDetails[]; }
          `),
        ),
      );
    });

    it("rejects a misspelled parent-scoped path", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          model Period { amount?: string; }
          model Summary {
            @Validation.computedFrom(Op.Sum, "../periods[*].amunt")
            total?: string;
          }
          model BudgetDetails {
            periods?: Period[];
            summary?: Summary;
          }
          ${formMeta("nested-budget")}
          model NestedBudget { budgets?: BudgetDetails[]; }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/calculation-path-unresolved",
      });
    });
  });

  describe("form-scoped-question-id", () => {
    it("rejects a question named after a form", async () => {
      const diagnostics = await Tester.diagnose(
        bank(`
          /** Named for a form. */
          @Meta.question(#{ id: "sf424/applicant-profile" })
          @Meta.tag(TagName.name)
          scalar FormScoped extends string;
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/form-scoped-question-id",
      });
    });

    it("accepts a question named for what it means", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          bank(`
            /** The organization's legal name. */
            @Meta.question(#{ id: "primary-org/legal-name" })
            @Meta.tag(TagName.name)
            scalar LegalName extends string;
          `),
        ),
      );
    });

    it("does not confuse letters inside a semantic word with a form abbreviation", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          bank(`
            /** A narrative supplied by the applicant. */
            @Meta.question(#{ id: "project/narrative" })
            @Meta.tag(TagName.narrative)
            scalar ProjectNarrative extends string;
          `),
        ),
      );
    });
  });

  describe("duplicate-block-id", () => {
    it("rejects two blocks claiming one id", async () => {
      const diagnostics = await Tester.diagnose(
        bank(`
          /** First. */
          @Meta.question(#{ id: "generics/clash" })
          @Meta.tag(TagName.name)
          scalar ClashA extends string;

          /** Second. */
          @Meta.question(#{ id: "generics/clash" })
          @Meta.tag(TagName.name)
          scalar ClashB extends string;
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/duplicate-block-id",
      });
    });

    it("rejects `is`, which copies the base's identity", async () => {
      const diagnostics = await Tester.diagnose(
        bank(`
          /** A point of contact. */
          @Meta.question(#{ id: "poc/details" })
          @Meta.tag(TagName.person)
          model Poc {
            name: string;
          }

          model FormLocal is Poc {}
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/duplicate-block-id",
      });
    });

    it("accepts `extends`, which carries no identity", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          bank(`
            /** A point of contact. */
            @Meta.question(#{ id: "poc/details" })
            @Meta.tag(TagName.person)
            model Poc {
              name: string;
            }

            model FormLocal extends Poc {
              role: string;
            }
          `),
        ),
      );
    });
  });

  describe("condition-value-not-in-enum", () => {
    it("rejects a comparison against a value the source cannot hold", async () => {
      const diagnostics = await Tester.diagnose(
        bank(`
          enum Country {
            usa: "USA: UNITED STATES",
          }

          /** An address. */
          @Meta.question(#{ id: "generics/address" })
          @Meta.tag(TagName.address)
          model Address {
            country: Country;

            @Validation.requiredWhen(Address.country, "USA: UNITED STATE")
            state?: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/condition-value-not-in-enum",
      });
    });

    it("accepts a comparison against a member", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          bank(`
            enum Country {
              usa: "USA: UNITED STATES",
            }

            /** An address. */
            @Meta.question(#{ id: "generics/address" })
            @Meta.tag(TagName.address)
            model Address {
              country: Country;

              @Validation.requiredWhen(Address.country, Country.usa)
              state?: string;
            }
          `),
        ),
      );
    });

    it("checks every member of a multi-value condition", async () => {
      const diagnostics = await Tester.diagnose(
        bank(`
          enum Role {
            professional: "Other Professional",
            other: "Other (Specify)",
          }

          /** Research person details. */
          @Meta.question(#{ id: "research-person/details" })
          @Meta.tag(TagName.person)
          model Person {
            role: Role;

            @UI.enabledWhenAny(Person.role, Role.professional, "Unknown Role")
            otherRole?: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/condition-value-not-in-enum",
      });
    });
  });

  describe("condition-path-unresolved", () => {
    it("rejects a misspelled nested condition path", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          enum Section { only: "Only" }
          enum Choice { yes: "Yes", no: "No" }
          model Details { choice: Choice; }

          ${formMeta("nested-condition")}
          @UI.sections(Section)
          model NestedCondition {
            @UI.section(Section.only)
            details: Details;

            @UI.section(Section.only)
            @Validation.requiredWhenPath("details.choce", Choice.yes)
            explanation?: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/condition-path-unresolved",
      });
    });

    it("accepts an existing nested condition path and enum member", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            enum Section { only: "Only" }
            enum Choice { yes: "Yes", no: "No" }
            model Details { choice: Choice; }

            ${formMeta("nested-condition")}
            @UI.sections(Section)
            model NestedCondition {
              @UI.section(Section.only)
              details: Details;

              @UI.section(Section.only)
              @Validation.requiredWhenPath("details.choice", Choice.yes)
              explanation?: string;
            }
          `),
        ),
      );
    });
  });

  describe("calculation-cycle", () => {
    it("rejects a calculation that depends on itself", async () => {
      const diagnostics = await Tester.diagnose(
        bank(`
          /** A budget. */
          @Meta.question(#{ id: "budget/cyclic" })
          @Meta.tag(TagName.money)
          model Cyclic {
            @Validation.computed(Op.Sum, Cyclic.b)
            a?: string;

            @Validation.computed(Op.Sum, Cyclic.a)
            b?: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/calculation-cycle",
      });
    });

    it("accepts a chain", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          bank(`
            /** A budget. */
            @Meta.question(#{ id: "budget/chained" })
            @Meta.tag(TagName.money)
            model Chained {
              leaf?: string;

              @Validation.computed(Op.Sum, Chained.leaf)
              mid?: string;

              @Validation.computed(Op.Sum, Chained.mid)
              top?: string;
            }
          `),
        ),
      );
    });
  });

  describe("required-but-unreachable", () => {
    it("rejects a field that is always required but only sometimes visible", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          enum Section { only: "Only" }
          enum Choice { yes: "Yes", no: "No" }

          /** A form. */
          ${formMeta("contradiction")}
          @UI.sections(Section)
          model Contradiction {
            @UI.section(Section.only)
            choice: Choice;

            @UI.section(Section.only)
            @UI.visibleWhen(Contradiction.choice, Choice.yes)
            explanation: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/required-but-unreachable",
      });
    });

    it("accepts the same field made conditionally required", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            enum Section { only: "Only" }
            enum Choice { yes: "Yes", no: "No" }

            /** A form. */
            ${formMeta("consistent")}
            @UI.sections(Section)
            model Consistent {
              @UI.section(Section.only)
              choice: Choice;

              @UI.section(Section.only)
              @UI.visibleWhen(Consistent.choice, Choice.yes)
              @Validation.requiredWhen(Consistent.choice, Choice.yes)
              explanation?: string;
            }
          `),
        ),
      );
    });
  });

  describe("section-orphan", () => {
    it("rejects a field in no section", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          enum Section { only: "Only" }

          /** A form. */
          ${formMeta("orphan")}
          @UI.sections(Section)
          model Orphan {
            @UI.section(Section.only)
            placed: string;

            unplaced: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/section-orphan",
      });
    });

    it("accepts a field deliberately omitted from the UI", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            enum Section { only: "Only" }

            /** A form. */
            ${formMeta("omitted")}
            @UI.sections(Section)
            model Omitted {
              @UI.section(Section.only)
              placed: string;

              @UI.omit
              hidden?: string;
            }
          `),
        ),
      );
    });

    it("accepts an inherited field assigned by a form-local section override", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            enum Section { only: "Only" }

            /** A reusable question. */
            @Meta.question(#{ id: "shared/answer" })
            @Meta.tag(TagName.details)
            model SharedAnswer { answer: string; }

            /** A form. */
            ${formMeta("override-section")}
            @UI.sections(Section)
            @UI.overrides(#{ answer: #{ section: "only", readOnly: true, visibleReadOnly: true } })
            model OverrideSection extends SharedAnswer {}
          `),
        ),
      );
    });

    it("rejects visible read-only rendering without a read-only schema occurrence", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          enum Section { only: "Only" }

          /** A form. */
          ${formMeta("unsafe-visible-read-only")}
          @UI.sections(Section)
          @UI.overrides(#{ answer: #{ section: "only", visibleReadOnly: true } })
          model UnsafeVisibleReadOnly { answer: string; }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/visible-read-only-without-read-only",
      });
    });
  });

  describe("override-path-unresolved", () => {
    it("rejects an override addressing a property that does not exist", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          enum Section { only: "Only" }

          /** An address. */
          @Meta.question(#{ id: "generics/address" })
          @Meta.tag(TagName.address)
          model Address {
            city: string;
          }

          /** A form. */
          ${formMeta("typo")}
          @UI.sections(Section)
          @UI.overrides(#{ \`applicant.citty\`: #{ omit: true } })
          model Typo {
            @UI.section(Section.only)
            applicant: Address;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/override-path-unresolved",
      });
    });

    it("accepts an override that resolves", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            enum Section { only: "Only" }

            /** An address. */
            @Meta.question(#{ id: "generics/address" })
            @Meta.tag(TagName.address)
            model Address {
              city: string;
            }

            /** A form. */
            ${formMeta("resolves")}
            @UI.sections(Section)
            @UI.overrides(#{ \`applicant.city\`: #{ omit: true } })
            model Resolves {
              @UI.section(Section.only)
              applicant: Address;
            }
          `),
        ),
      );
    });

    it("rejects an enabledWhen override whose source path does not resolve", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          enum Section { only: "Only" }

          /** An address. */
          @Meta.question(#{ id: "generics/address" })
          @Meta.tag(TagName.address)
          model Address {
            city: string;
          }

          /** A form. */
          ${formMeta("bad-behavior-source")}
          @UI.sections(Section)
          @UI.overrides(#{
            \`applicant.city\`: #{
              enabledWhen: #{ path: "applicant.citty", equals: "Boston" }
            }
          })
          model BadBehaviorSource {
            @UI.section(Section.only)
            applicant: Address;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/override-path-unresolved",
      });
    });
  });

  describe("calculation-materialization-without-calculation", () => {
    it("rejects a materialization policy without a calculation", async () => {
      const diagnostics = await Tester.diagnose(
        form(`
          ${formMeta("invalid-materialization")}
          model InvalidMaterialization {
            @Validation.materializeWhenAnySourcePresent
            total?: decimal;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/calculation-materialization-without-calculation",
      });
    });

    it("accepts the policy on a declared calculation", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          form(`
            ${formMeta("valid-materialization")}
            model ValidMaterialization {
              left?: decimal;
              right?: decimal;
              @Validation.materializeWhenAnySourcePresent
              @Validation.computed(Op.Sum, ValidMaterialization.left, ValidMaterialization.right)
              total?: decimal;
            }
          `),
        ),
      );
    });
  });
});
