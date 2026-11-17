import { createTester } from "@typespec/compiler/testing";
import Ajv from "ajv/dist/2020.js";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

/** The emitter composes `@typespec/json-schema`, so these fixtures load it as well. */
const EmitTester = createTester(fileURLToPath(new URL("..", import.meta.url)), {
  libraries: ["simpler-forms", "@typespec/json-schema"],
});

/** The schema the emitter writes for form `id`, declared by `models` in a `Forms` namespace. */
const formSchema = async (id: string, models: string) => {
  const { outputs } = await EmitTester.emit("simpler-forms").compile(`
    import "simpler-forms";
    import "@typespec/json-schema";
    using SimplerForms;
    @JsonSchema.jsonSchema
    namespace Forms { ${models} }
  `);
  const text = outputs[`forms/${id}/schema.json`];
  if (text === undefined)
    throw new Error(`no schema for ${id}; emitted ${Object.keys(outputs)}`);
  return JSON.parse(text) as Record<string, any>;
};

/** The JSON paths of the errors validating `data` against `schema` reports, one per error. */
const errorsFor = (schema: object, data: unknown) => {
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  validate(data);
  return (validate.errors ?? []).map(
    (e) => `${e.instancePath} ${e.params.missingProperty ?? e.keyword}`,
  );
};

describe("@Validation.requiredPaths", () => {
  const contacts = `
    model Contact { name: string; email?: string; }

    @Meta.form(#{ id: "contacts", formName: "CONTACTS" })
    model Contacts {
      @Validation.requiredPaths("email")
      contacts: Contact[];

      @Validation.requiredPaths("email")
      primary: Contact;
    }
  `;

  it("requires the path on each item of a list", async () => {
    const schema = await formSchema("contacts", contacts);
    expect(schema.properties.contacts.items.required).toEqual(["email"]);
    expect(schema.properties.contacts.required).toBeUndefined();
  });

  it("reports an item missing the path", async () => {
    const schema = await formSchema("contacts", contacts);
    const data = {
      contacts: [{ name: "Ada", email: "ada@example.com" }, { name: "Grace" }],
      primary: { name: "Alan", email: "alan@example.com" },
    };
    expect(errorsFor(schema, data)).toEqual(["/contacts/1 email"]);
  });

  it("applies a list's conditional paths to each item too", async () => {
    const schema = await formSchema(
      "roles",
      `model Role { kind: string; other?: string; }

       @Meta.form(#{ id: "roles", formName: "ROLES" })
       model Roles {
         @Validation.requiredPathWhen("other", "kind", "Other")
         roles: Role[];
       }`,
    );
    const data = {
      roles: [
        { kind: "PI" },
        { kind: "Other" },
        { kind: "Other", other: "Advisor" },
      ],
    };
    expect(errorsFor(schema, data).filter((e) => e.endsWith(" other"))).toEqual(
      ["/roles/1 other"],
    );
  });
});
