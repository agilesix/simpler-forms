import { createTester, expectDiagnostics } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { snakeCase } from "../src/casing.js";
import { Tester, formMeta } from "./tester.js";

/** The emitter composes `@typespec/json-schema`, so these fixtures load it as well. */
const EmitTester = createTester(fileURLToPath(new URL("..", import.meta.url)), {
  libraries: ["simpler-forms", "@typespec/json-schema"],
});

type Json = Record<string, any>;

const emit = async (
  code: string,
  casing?: "preserve" | "snake",
): Promise<(path: string) => Json> => {
  const { outputs } = await EmitTester.emit(
    "simpler-forms",
    casing ? { "property-casing": casing } : {},
  ).compile(code);
  return (path) => {
    const text = outputs[path];
    if (text === undefined)
      throw new Error(`no ${path}; emitted ${Object.keys(outputs).join(", ")}`);
    return JSON.parse(text);
  };
};

const spec = `
  import "simpler-forms";
  import "@typespec/json-schema";
  using SimplerForms;
  using QuestionBank;
  @JsonSchema.jsonSchema
  namespace QuestionBank {
    /** A person's name. */
    @Meta.question(#{ id: "person/name" })
    @example(#{ firstName: "Ada", lastName: "Lovelace" })
    model PersonName {
      firstName?: string;
      lastName?: string;
    }
  }
  @JsonSchema.jsonSchema
  namespace Forms {
    model KeyContact {
      name?: PersonName;
      ombNumber?: string;
      street1?: string;
      @encodedName("application/json", "ein")
      employerIdNumber?: string;
    }

    enum ContactKind { individual, organization }

    ${formMeta("contact-form")}
    @Validation.requiredPaths("primaryContact.name.firstName")
    model ContactForm {
      contactKind?: ContactKind;
      @UI.visibleWhen(ContactForm.contactKind, ContactKind.organization)
      @Validation.requiredWhen(ContactForm.contactKind, ContactKind.organization)
      organizationName?: string;
      primaryContact?: KeyContact;
      keyContacts?: KeyContact[];
    }
  }
`;

const scopes = (node: Json): string[] => [
  ...(node.scope ? [node.scope] : []),
  ...(node.elements ?? []).flatMap(scopes),
];

describe("snakeCase", () => {
  it.each([
    ["firstName", "first_name"],
    ["street1", "street1"],
    ["ombNumber", "omb_number"],
    ["OMBNumber", "omb_number"],
    ["HTTPServer", "http_server"],
    ["sf424Version", "sf424_version"],
    ["first_name", "first_name"],
  ])("converts %s to %s", (name, expected) => {
    expect(snakeCase(name)).toBe(expected);
  });
});

describe("default property casing", () => {
  it("keeps TypeSpec property names", async () => {
    const artifact = await emit(spec);
    expect(
      Object.keys(artifact("forms/contact-form/schema.json").properties),
    ).toEqual([
      "contactKind",
      "organizationName",
      "primaryContact",
      "keyContacts",
    ]);
  });
});

describe("snake property casing", () => {
  it("renames nested schema properties", async () => {
    const artifact = await emit(spec, "snake");
    const contact = artifact("forms/contact-form/schema.json").$defs.KeyContact
      .properties;
    expect(Object.keys(contact)).toEqual([
      "name",
      "omb_number",
      "street1",
      "ein",
    ]);
  });

  it("renames properties of published questions", async () => {
    const artifact = await emit(spec, "snake");
    expect(
      Object.keys(artifact("question-bank/person/name/schema.json").properties),
    ).toEqual(["first_name", "last_name"]);
  });

  it("renames required paths resolved from TypeSpec names", async () => {
    const artifact = await emit(spec, "snake");
    const schema = artifact("forms/contact-form/schema.json");
    expect(schema.required).toEqual(["primary_contact"]);
    expect(schema.properties.primary_contact.required).toEqual(["name"]);
    expect(schema.properties.primary_contact.properties.name.required).toEqual([
      "first_name",
    ]);
  });

  it("renames conditional requiredness", async () => {
    const artifact = await emit(spec, "snake");
    expect(artifact("forms/contact-form/schema.json").allOf).toContainEqual({
      if: {
        properties: { contact_kind: { const: "organization" } },
        required: ["contact_kind"],
      },
      then: { required: ["organization_name"] },
    });
  });

  it("renames control and rule scopes", async () => {
    const artifact = await emit(spec, "snake");
    const ui = artifact("forms/contact-form/ui.json");
    const organizationName = ui.elements.find(
      (node: Json) => node.scope === "#/properties/organization_name",
    );
    expect(organizationName.rule.condition.scope).toBe(
      "#/properties/contact_kind",
    );
  });

  it("renames item detail scopes relative to array item", async () => {
    const artifact = await emit(spec, "snake");
    const keyContacts = artifact("forms/contact-form/ui.json").elements.find(
      (node: Json) => node.scope === "#/properties/key_contacts",
    );
    expect(scopes(keyContacts.options.detail)).toEqual([
      "#/properties/name/properties/first_name",
      "#/properties/name/properties/last_name",
      "#/properties/omb_number",
      "#/properties/street1",
      "#/properties/ein",
    ]);
  });

  it("renames field occurrence paths through array items", async () => {
    const artifact = await emit(spec, "snake");
    const paths = artifact(
      "forms/contact-form/index.json",
    ).fieldOccurrences.map((occurrence: Json) => occurrence.path);
    expect(paths).toContain("/key_contacts/[]/name/first_name");
    expect(paths).toContain("/key_contacts/[]/ein");
    expect(paths.some((path: string) => /[A-Z]/.test(path))).toBe(false);
  });

  it("renames example keys", async () => {
    const artifact = await emit(spec, "snake");
    expect(artifact("question-bank/person/name/schema.json").examples).toEqual([
      { first_name: "Ada", last_name: "Lovelace" },
    ]);
  });

  it("leaves no staged schemas in TypeSpec names", async () => {
    const { outputs } = await EmitTester.emit("simpler-forms", {
      "property-casing": "snake",
    }).compile(spec);
    expect(Object.keys(outputs)).toContain("forms/contact-form/schema.json");
    expect(
      Object.keys(outputs).filter((path) => path.startsWith(".json-schema/")),
    ).toEqual([]);
  });

  it("rejects two properties emitted under one name", async () => {
    const diagnostics = await EmitTester.emit("simpler-forms", {
      "property-casing": "snake",
    }).diagnose(`
      import "simpler-forms";
      import "@typespec/json-schema";
      using SimplerForms;
      @JsonSchema.jsonSchema
      namespace Forms {
        ${formMeta("collision")}
        model Collision { firstName?: string; first_name?: string; }
      }
    `);
    expectDiagnostics(diagnostics, {
      code: "simpler-forms/property-casing-collision",
    });
  });
});

describe("string paths under snake casing", () => {
  it("reject a snake case path with the authored name", async () => {
    const diagnostics = await Tester.diagnose(`
      import "simpler-forms";
      using SimplerForms;
      namespace Forms {
        ${formMeta("path-check")}
        @Validation.requiredPaths("first_name")
        model PathCheck { firstName?: string; }
      }
    `);
    expectDiagnostics(diagnostics, {
      code: "simpler-forms/cardinality-path-unresolved",
      message: /"first_name"/,
    });
  });
});
