import { describe, expect, it } from "vitest";
import { allBlocks } from "../src/model.js";
import { emitBlockUi, type UiNode } from "../src/emitters/block-ui.js";
import { Tester, formMeta } from "./tester.js";

/** Compile a specification and lay out the one form it declares. */
const formUi = async (code: string): Promise<UiNode> => {
  const { program } = await Tester.compile(code);
  const form = allBlocks(program).find((block) => block.kind === "form");
  if (!form) throw new Error("fixture declares no form");
  return emitBlockUi(program, form);
};

const scopes = (node: UiNode | undefined): string[] =>
  node
    ? [
        ...(node.scope ? [node.scope] : []),
        ...(node.elements ?? []).flatMap(scopes),
      ]
    : [];

const spec = (body: string) => `
  import "simpler-forms";
  using SimplerForms;
  using QuestionBank;
  namespace QuestionBank {
    /** A person to contact. */
    @Meta.question(#{ id: "poc/contact" })
    model QuestionContact {
      name?: string;
      email?: string;
    }

    /** An address, given its meaning by the questions that extend it. */
    @Meta.question(#{ id: "generics/place" })
    model QuestionPlace {
      city?: string;
      country?: string;
    }

    /** The applicant's address: the same shape, adding nothing of its own. */
    @Meta.question(#{ id: "primary-org/place" })
    model QuestionApplicantPlace extends QuestionPlace {}
  }
  namespace Forms {
    ${body}
  }
`;

describe("emitBlockUi", () => {
  describe("a repeated property", () => {
    it("lays out each entry in options.detail, interleaving inherited fields in @UI.order", async () => {
      const ui = await formUi(
        spec(`
          @UI.order(Contact.name, Contact.role, Contact.email)
          model Contact extends QuestionContact {
            role?: string;
          }
          ${formMeta("contacts")}
          model Contacts {
            contacts: Contact[];
          }
        `),
      );

      const list = ui.elements?.[0];
      expect(list?.scope).toEqual("#/properties/contacts");
      expect(scopes(list?.options?.detail as UiNode)).toEqual([
        "#/properties/name",
        "#/properties/role",
        "#/properties/email",
      ]);
    });

    it("gives a list of scalars no detail, since an entry has no fields", async () => {
      const ui = await formUi(
        spec(`
          ${formMeta("titles")}
          model Titles {
            titles?: string[];
          }
        `),
      );

      expect(ui.elements?.[0]?.options?.detail).toBeUndefined();
    });
  });

  describe("@UI.hiddenWhen", () => {
    it("emits a SHOW rule that holds only once the source is answered with another value", async () => {
      const ui = await formUi(
        spec(`
          ${formMeta("hidden")}
          model Hidden {
            country?: string;
            @UI.hiddenWhen(Hidden.country, "USA")
            province?: string;
          }
        `),
      );

      expect(ui.elements?.[1]).toMatchObject({
        scope: "#/properties/province",
        rule: {
          effect: "SHOW",
          condition: {
            scope: "#/properties/country",
            failWhenUndefined: true,
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
                { not: { const: "USA" } },
              ],
            },
          },
        },
      });
    });
  });

  describe("@UI.widget", () => {
    const widgets = `
      @UI.widgets(Widget)
      namespace Rendering {
        enum Widget { Text, Collapsible, Attachment: "ApplicationAttachment" }
      }
    `;

    it("names the widget on a field's control", async () => {
      const ui = await formUi(
        spec(`
          ${widgets}
          ${formMeta("widget-field")}
          model WidgetField {
            @UI.widget(Rendering.Widget.Text)
            note?: string;
          }
        `),
      );

      expect(ui.elements?.[0]?.options?.widget).toEqual("Text");
    });

    it("names a widget by its string value when it has one", async () => {
      const ui = await formUi(
        spec(`
          ${widgets}
          ${formMeta("widget-value")}
          model WidgetValue {
            @UI.widget(Rendering.Widget.Attachment)
            upload?: string;
          }
        `),
      );

      expect(ui.elements?.[0]?.options?.widget).toEqual(
        "ApplicationAttachment",
      );
    });

    it("names the widget on the group a question with fields lays out as", async () => {
      const ui = await formUi(
        spec(`
          ${widgets}
          ${formMeta("widget-group")}
          model WidgetGroup {
            @UI.widget(Rendering.Widget.Collapsible)
            contact?: QuestionContact;
          }
        `),
      );

      expect(ui.elements?.[0]).toMatchObject({
        type: "Group",
        options: { widget: "Collapsible" },
      });
      expect(scopes(ui.elements?.[0])).toEqual([
        "#/properties/contact/properties/name",
        "#/properties/contact/properties/email",
      ]);
    });

    it("names the widget on a list's control beside its entry layout", async () => {
      const ui = await formUi(
        spec(`
          ${widgets}
          ${formMeta("widget-list")}
          model WidgetList {
            @UI.widget(Rendering.Widget.Collapsible)
            contacts?: QuestionContact[];
          }
        `),
      );

      const list = ui.elements?.[0];
      expect(list?.options?.widget).toEqual("Collapsible");
      expect(list?.options?.detail).toBeDefined();
    });
  });

  describe("a question that extends another", () => {
    it("lays out the fields it inherits rather than an empty group", async () => {
      const ui = await formUi(
        spec(`
          ${formMeta("applicant")}
          model Applicant {
            place?: QuestionApplicantPlace;
          }
        `),
      );

      expect(scopes(ui)).toEqual([
        "#/properties/place/properties/city",
        "#/properties/place/properties/country",
      ]);
    });
  });
});
