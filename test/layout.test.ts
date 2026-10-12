import {
  type Diagnostic,
  createTester,
  expectDiagnosticEmpty,
  expectDiagnostics,
} from "@typespec/compiler/testing";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { Tester } from "./tester.js";

/** The emitter composes `@typespec/json-schema`, so these fixtures load it as well. */
const EmitTester = createTester(fileURLToPath(new URL("..", import.meta.url)), {
  libraries: ["simpler-forms", "@typespec/json-schema"],
});

type Json = Record<string, any>;

/**
 * A person asked in two roles, and a list of contacts. `Person` is a question, so its
 * own presentation is a Group of its fields; `Address` is a question with a condition of
 * its own on `state`.
 */
const spec = (layouts: string) => `
  import "simpler-forms";
  import "@typespec/json-schema";
  using SimplerForms;
  using Bank;

  @JsonSchema.jsonSchema
  namespace Bank {
    enum Country { USA, CAN }

    /** A mailing address. */
    @Meta.question(#{ id: "generic/address" })
    model Address {
      street?: string;
      country?: Country;
      @UI.enabledWhen(Address.country, Country.USA)
      state?: string;
      county?: string;
      province?: string;
    }

    /** A person to contact. */
    @Meta.question(#{ id: "generic/person" })
    @UI.label("Contact Person")
    model Person {
      @UI.label("Name") name?: string;
      title?: string;
      address?: Address;
    }

    /** One of several contacts. */
    @Meta.question(#{ id: "generic/contact" })
    model Contact {
      role?: string;
      name?: string;
      email?: string;
    }
  }

  @JsonSchema.jsonSchema
  namespace Forms {
    @Meta.submission(#{ id: "contacts", shortFormName: "C", formVersion: "1.0" })
    model Contacts {
      /** Individual authorized to accept payments. */
      @UI.label("Payee")
      payee?: Person;

      manager?: Person;
      contacts?: Contact[];
    }

    ${layouts}
  }
`;

const emit = async (layouts: string) => {
  const [result, diagnostics] = await EmitTester.emit(
    "simpler-forms",
  ).compileAndDiagnose(spec(layouts));
  return {
    diagnostics,
    paths: Object.keys(result.outputs).sort(),
    json: (path: string): Json => {
      const text = result.outputs[path];
      if (text === undefined)
        throw new Error(
          `no ${path}; emitted ${Object.keys(result.outputs).join(", ")}`,
        );
      return JSON.parse(text);
    },
  };
};

const diagnose = (layouts: string) => EmitTester.diagnose(spec(layouts));

/** The layout of the published form `id`. */
const ui = async (layouts: string, id = "contacts-layout"): Promise<Json> => {
  const { diagnostics, json } = await emit(layouts);
  expectDiagnosticEmpty(
    diagnostics.filter((d: Diagnostic) => d.severity === "error"),
  );
  return json(`forms/${id}/ui.json`);
};

/** Each Control's scope, and each Group's label, as an outline. */
const outline = (node: Json): unknown =>
  node.type === "Control"
    ? node.options?.detail
      ? { [node.scope]: outline(node.options.detail) }
      : node.scope
    : { [node.label ?? "(group)"]: (node.elements ?? []).map(outline) };

const form = (id = "contacts-layout") =>
  `@Meta.form(#{ id: "${id}", formName: "Contacts" })`;

/** Every top-level field, placed as its model lays it out. */
const everything = `
  people: {
    payee: Contacts.payee;
    manager: Contacts.manager;
    contacts: Contacts.contacts;
  };
`;

const P = "#/properties";

describe("@UI.layout", () => {
  describe("entries", () => {
    it("places a referenced field as its model lays it out", async () => {
      const layout = await ui(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout { ${everything} }
      `);
      const [section] = layout.elements;
      expect(section.label).toEqual("people");
      const [payee, manager] = section.elements;
      // The property's label and doc comment, not the question's (#7).
      expect(payee.label).toEqual("Payee");
      expect(payee.options.description).toEqual(
        "Individual authorized to accept payments.",
      );
      expect(manager.label).toEqual("Contact Person");
      expect(outline(payee)).toEqual({
        Payee: [
          `${P}/payee/properties/name`,
          `${P}/payee/properties/title`,
          {
            "A mailing address.": [
              `${P}/payee/properties/address/properties/street`,
              `${P}/payee/properties/address/properties/country`,
              `${P}/payee/properties/address/properties/state`,
              `${P}/payee/properties/address/properties/county`,
              `${P}/payee/properties/address/properties/province`,
            ],
          },
        ],
      });
      // The question's own condition comes with it, scoped to this occurrence.
      expect(payee.elements[2].elements[2].rule).toEqual({
        effect: "ENABLE",
        condition: {
          scope: `${P}/payee/properties/address/properties/country`,
          schema: { const: "USA" },
        },
      });
    });

    it("lays out a field with @UI.field: listed entries first, the rest after", async () => {
      const layout = await ui(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout {
          people: {
            @UI.label("Who gets paid")
            @UI.field(Contacts.payee)
            payee: {
              @UI.helpText("As it appears on the bank account.")
              address: Person.address;
              @UI.omit title: Person.title;
            };
            manager: Contacts.manager;
            contacts: Contacts.contacts;
          };
        }
      `);
      const payee = layout.elements[0].elements[0];
      expect(payee.label).toEqual("Who gets paid");
      expect(outline(payee)).toEqual({
        "Who gets paid": [
          {
            "A mailing address.": expect.any(Array),
          },
          `${P}/payee/properties/name`,
        ],
      });
      expect(payee.elements[0].options.description).toEqual(
        "As it appears on the bank account.",
      );
    });

    it("makes a group of only what a model without @UI.field lists", async () => {
      const layout = await ui(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout {
          /** Names first. */
          @UI.label("Names")
          names: {
            payee: Contacts.payee::type.name;
            manager: Contacts.manager::type.name;
          };
          ${everything}
        }
      `);
      expect(outline(layout.elements[0])).toEqual({
        Names: [`${P}/payee/properties/name`, `${P}/manager/properties/name`],
      });
      expect(layout.elements[0].options.description).toEqual("Names first.");
      // A field pulled out is no longer in its group.
      expect(outline(layout.elements[1].elements[0])).toEqual({
        Payee: [`${P}/payee/properties/title`, expect.any(Object)],
      });
    });

    it("pulls a deep field out to where it is listed", async () => {
      const layout = await ui(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout {
          ${everything}
          @UI.label("Where to pay")
          payee: {
            county: Contacts.payee::type.address::type.county;
          };
        }
      `);
      const [people, where] = layout.elements;
      expect(outline(where)).toEqual({
        "Where to pay": [`${P}/payee/properties/address/properties/county`],
      });
      expect(JSON.stringify(people)).not.toContain(
        `${P}/payee/properties/address/properties/county`,
      );
    });

    it("resolves references relative to the @UI.field type, so one model serves both roles", async () => {
      const layout = await ui(`
        model PersonWithoutCounty {
          @UI.omit county: Person.address::type.county;
        }
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout {
          @UI.field(Contacts.payee) payee: PersonWithoutCounty;
          @UI.field(Contacts.manager) manager: PersonWithoutCounty;
          contacts: { contacts: Contacts.contacts; };
        }
      `);
      const text = JSON.stringify(layout);
      expect(text).not.toContain("properties/county");
      expect(text).toContain(
        `${P}/payee/properties/address/properties/province`,
      );
      expect(text).toContain(
        `${P}/manager/properties/address/properties/province`,
      );
    });

    it("lays out a list's entries through @UI.field, relative to the entry", async () => {
      const layout = await ui(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout {
          payee: { payee: Contacts.payee; manager: Contacts.manager; };
          @UI.field(Contacts.contacts)
          contacts: {
            @UI.label("Their name") name: Contact.name;
            @UI.omit email: Contact.email;
          };
        }
      `);
      const section = layout.elements[1];
      expect(section.label).toEqual("contacts");
      expect(outline(section)).toEqual({
        contacts: [
          {
            [`${P}/contacts`]: {
              "(group)": ["#/properties/name", "#/properties/role"],
            },
          },
        ],
      });
      expect(section.elements[0].options.detail.elements[0].label).toEqual(
        "Their name",
      );
    });

    it("gives a section that wraps a list the list's description", async () => {
      const layout = await ui(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout {
          payee: { payee: Contacts.payee; manager: Contacts.manager; };
          /** Enter each contact. */
          @UI.field(Contacts.contacts)
          contacts: { name: Contact.name; };
        }
      `);
      const section = layout.elements[1];
      expect(section.options).toEqual({ description: "Enter each contact." });
      expect(section.elements[0].options.description).toBeUndefined();
    });

    it("places a field's children without their group with @UI.flatten", async () => {
      const layout = await ui(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout {
          @UI.field(Contacts.payee)
          payee: { @UI.flatten address: Person.address; };
          manager: { manager: Contacts.manager; contacts: Contacts.contacts; };
        }
      `);
      expect(outline(layout.elements[0])).toEqual({
        Payee: [
          `${P}/payee/properties/address/properties/street`,
          `${P}/payee/properties/address/properties/country`,
          `${P}/payee/properties/address/properties/state`,
          `${P}/payee/properties/address/properties/county`,
          `${P}/payee/properties/address/properties/province`,
          `${P}/payee/properties/name`,
          `${P}/payee/properties/title`,
        ],
      });
    });
  });

  describe("publishing", () => {
    it("publishes a layout with @Meta.form under its own id, with the submission's schema", async () => {
      const { paths, json } = await emit(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout { ${everything} }
      `);
      expect(paths.filter((p) => p.startsWith("forms/"))).toEqual([
        "forms/contacts-layout/index.json",
        "forms/contacts-layout/manifest.json",
        "forms/contacts-layout/schema.json",
        "forms/contacts-layout/ui.json",
      ]);
      expect(json("forms/contacts-layout/manifest.json")).toMatchObject({
        form: { id: "contacts-layout", formName: "Contacts" },
        submission: { id: "contacts" },
      });
      expect(json("forms/contacts-layout/schema.json").$id).toEqual(
        "contacts/schema.json",
      );
      expect(json("forms/contacts-layout/index.json").id).toEqual(
        "contacts-layout",
      );
    });

    it("checks a layout without @Meta.form but publishes nothing for it", async () => {
      const { paths, diagnostics } = await emit(`
        @UI.layout(Contacts)
        model ContactsLayout { people: { payee: Contacts.payee; }; }
      `);
      expect(paths.some((p) => p.startsWith("forms/"))).toBe(false);
      expect(diagnostics.map((d: Diagnostic) => d.code)).toContain(
        "simpler-forms/layout-unplaced",
      );
    });

    it("keeps layout models out of JSON Schema output", async () => {
      const { paths } = await emit(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout { ${everything} }
      `);
      expect(
        paths.filter(
          (p) => /layout/i.test(p) && !p.startsWith("forms/contacts-layout/"),
        ),
      ).toEqual([]);
      expect(paths.every((p) => !p.includes("ContactsLayout"))).toBe(true);
    });

    it("requires a layout's @Meta.form to give an id", async () => {
      expectDiagnostics(
        await diagnose(`
          @Meta.form(#{ formName: "Contacts" })
          @UI.layout(Contacts)
          model ContactsLayout { ${everything} }
        `),
        { code: "simpler-forms/layout-form-id" },
      );
    });

    it("rejects a form presenting a model with no submission", async () => {
      expectDiagnostics(
        await diagnose(`
          @Meta.form(#{ id: "person-sheet", formName: "Person" })
          @UI.layout(Person)
          model PersonLayout { person: { name: Person.name; title: Person.title; address: Person.address; }; }
        `),
        {
          code: "simpler-forms/layout-form-without-submission",
          message: /presents Person, which has no @Meta.submission/,
        },
      );
    });
  });

  describe("diagnostics", () => {
    it("accepts a complete layout", async () => {
      expectDiagnosticEmpty(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout { ${everything} }
        `),
      );
    });

    it("reports a reference from the wrong model for where it sits", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            ${everything}
            @UI.field(Contacts.manager)
            other: { role: Contact.role; };
          }
        `),
        [
          { code: "simpler-forms/layout-entry-name" },
          { code: "simpler-forms/layout-placed-twice" },
          {
            code: "simpler-forms/layout-ref-root",
            message:
              /Contact.role starts from Contact, but entries here lay out Person \(from other\)/,
          },
        ],
      );
    });

    it("reports a field that is not placed, and one only partly placed", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            people: {
              payee: Contacts.payee;
              name: Contacts.manager::type.name;
            };
          }
        `),
        [
          {
            code: "simpler-forms/layout-unplaced",
            message: /Only manager.name of Contacts.manager is placed/,
          },
          {
            code: "simpler-forms/layout-unplaced",
            message: /Contacts.contacts is not placed in any section/,
          },
        ],
      );
    });

    it("accepts a field left out with @UI.omit", async () => {
      expectDiagnosticEmpty(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            people: { payee: Contacts.payee; manager: Contacts.manager; };
            @UI.omit contacts: Contacts.contacts;
          }
        `),
      );
    });

    it("rejects a section that is a field reference", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            ${everything}
            payee: Contacts.payee;
          }
        `),
        { code: "simpler-forms/layout-section-not-group" },
      );
    });

    it("rejects validation on a layout entry", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            people: {
              @Validation.constraints(#{ maxLength: 4 })
              payee: Contacts.payee;
              manager: Contacts.manager;
              contacts: Contacts.contacts;
            };
          }
        `),
        {
          code: "simpler-forms/layout-validation",
          message: /@Validation.constraints on layout entry payee/,
        },
      );
    });

    it("warns about siblings that render under one label", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            ${everything}
            names: {
              @UI.flatten payee: Contacts.payee::type.address;
              @UI.flatten manager: Contacts.manager::type.address;
            };
          }
        `),
        [
          { code: "simpler-forms/layout-duplicate-label", message: /"street"/ },
          {
            code: "simpler-forms/layout-duplicate-label",
            message: /"country"/,
          },
          { code: "simpler-forms/layout-duplicate-label", message: /"state"/ },
          { code: "simpler-forms/layout-duplicate-label", message: /"county"/ },
          {
            code: "simpler-forms/layout-duplicate-label",
            message: /"province"/,
          },
        ],
      );
    });

    it("warns about flattening a field with no children", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            ${everything}
            extra: { @UI.flatten title: Contacts.payee::type.title; };
          }
        `),
        { code: "simpler-forms/layout-flatten-leaf" },
      );
    });
  });

  describe("conditions", () => {
    it("emits a layout's condition as a rule, replacing the field's own", async () => {
      const layout = await ui(`
        ${form()}
        @UI.layout(Contacts)
        model ContactsLayout {
          people: {
            @UI.field(Contacts.payee)
            payee: {
              @UI.field(Person.address)
              address: {
                @UI.visibleWhen(Address.country, Country.CAN)
                province: Address.province;
              };
            };
            @UI.hiddenWhen(Contacts.payee::type.title, "none")
            manager: Contacts.manager;
            contacts: Contacts.contacts;
          };
        }
      `);
      const [payee, manager] = layout.elements[0].elements;
      const address = payee.elements[0];
      expect(address.elements[0]).toMatchObject({
        scope: `${P}/payee/properties/address/properties/province`,
        rule: {
          effect: "SHOW",
          condition: {
            scope: `${P}/payee/properties/address/properties/country`,
            schema: { const: "CAN" },
          },
        },
      });
      expect(manager.rule).toEqual({
        effect: "SHOW",
        condition: {
          scope: `${P}/payee/properties/title`,
          schema: {
            allOf: [
              {
                not: {
                  anyOf: [
                    { type: "null" },
                    { const: "" },
                    { type: "array", maxItems: 0 },
                  ],
                },
              },
              { not: { const: "none" } },
            ],
          },
          failWhenUndefined: true,
        },
      });
    });

    it("warns when a layout's condition replaces the field's own", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            people: {
              @UI.field(Contacts.payee)
              payee: {
                @UI.field(Person.address)
                address: {
                  @UI.visibleWhen(Address.country, Country.USA)
                  state: Address.state;
                };
              };
              manager: Contacts.manager;
              contacts: Contacts.contacts;
            };
          }
        `),
        {
          code: "simpler-forms/layout-condition-replaces",
          message: /state's condition replaces the one state declares itself/,
        },
      );
    });

    it("rejects a condition read from inside the field it controls", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            people: {
              @UI.visibleWhen(Contacts.payee::type.title, "x")
              payee: Contacts.payee;
              manager: Contacts.manager;
              contacts: Contacts.contacts;
            };
          }
        `),
        { code: "simpler-forms/layout-condition-self" },
      );
    });

    it("rejects two display conditions on one entry", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            people: {
              payee: Contacts.payee;
              @UI.visibleWhen(Contacts.payee::type.title, "x")
              @UI.enabledWhen(Contacts.payee::type.title, "y")
              manager: Contacts.manager;
              contacts: Contacts.contacts;
            };
          }
        `),
        { code: "simpler-forms/layout-condition-count" },
      );
    });

    it("warns about a condition waiting on an omitted field", async () => {
      expectDiagnostics(
        await diagnose(`
          @UI.layout(Contacts)
          model ContactsLayout {
            people: {
              @UI.field(Contacts.payee)
              payee: { @UI.omit title: Person.title; };
              @UI.visibleWhen(Contacts.payee::type.title, "x")
              manager: Contacts.manager;
              contacts: Contacts.contacts;
            };
          }
        `),
        { code: "simpler-forms/layout-condition-source-omitted" },
      );
    });
  });
});

describe("conditions that can hide a required field", () => {
  const required = (layouts: string) => `
    import "simpler-forms";
    using SimplerForms;
    namespace Forms {
      enum YesNo { yes, no }
      model Changes { pd?: YesNo; org?: YesNo; }
      @Meta.submission(#{ id: "changes", shortFormName: "C", formVersion: "1.0" })
      model ChangeForm {
        changes?: Changes;
        @Validation.requiredWhenPath("changes.pd", YesNo.yes)
        formerPd?: string;
        always: string;
      }
      ${layouts}
    }
  `;

  it("accepts a condition that matches when the field is required", async () => {
    expectDiagnosticEmpty(
      await Tester.diagnose(
        required(`
          @UI.layout(ChangeForm)
          model L {
            s: {
              changes: ChangeForm.changes;
              @UI.enabledWhen(ChangeForm.changes::type.pd, YesNo.yes)
              formerPd: ChangeForm.formerPd;
              always: ChangeForm.always;
            };
          }
        `),
      ),
    );
  });

  it("warns about a condition that differs from when the field is required", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        required(`
          @UI.layout(ChangeForm)
          model L {
            s: {
              changes: ChangeForm.changes;
              @UI.enabledWhen(ChangeForm.changes::type.org, YesNo.yes)
              formerPd: ChangeForm.formerPd;
              always: ChangeForm.always;
            };
          }
        `),
      ),
      {
        code: "simpler-forms/layout-condition-hides-required",
        message:
          /required when changes.pd = yes, but this layout makes it usable only when changes.org = yes/,
      },
    );
  });

  it("warns about a condition that hides a field exactly when it is required", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        required(`
          @UI.layout(ChangeForm)
          model L {
            s: {
              changes: ChangeForm.changes;
              @UI.disabledWhen(ChangeForm.changes::type.pd, YesNo.yes)
              formerPd: ChangeForm.formerPd;
              always: ChangeForm.always;
            };
          }
        `),
      ),
      {
        code: "simpler-forms/layout-condition-hides-required",
        message: /exactly when this layout hides or disables it/,
      },
    );
  });

  it("warns about a condition on an always-required field", async () => {
    expectDiagnostics(
      await Tester.diagnose(
        required(`
          @UI.layout(ChangeForm)
          model L {
            s: {
              changes: ChangeForm.changes;
              formerPd: ChangeForm.formerPd;
              @UI.visibleWhen(ChangeForm.changes::type.pd, YesNo.yes)
              always: ChangeForm.always;
            };
          }
        `),
      ),
      {
        code: "simpler-forms/layout-condition-hides-required",
        message: /always is always required/,
      },
    );
  });
});
