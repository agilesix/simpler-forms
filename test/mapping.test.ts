import type { EnumMember, Model, Program } from "@typespec/compiler";
import {
  expectDiagnosticEmpty,
  expectDiagnostics,
} from "@typespec/compiler/testing";
import { describe, expect, it } from "vitest";
import { type MappingNode, resolveMapping } from "../src/mapping.js";
import { Tester, formMeta } from "./tester.js";

/**
 * Two mappings, and a target shape for each: `Wire` mirrors an XML document, `Flat` a CSV
 * row. A fixture adds the sources and their links.
 */
const spec = (body: string, { declare = true } = {}) => `
  import "simpler-forms";
  using SimplerForms;

  ${declare ? "@Mapping.targets(Target)" : ""}
  namespace Mappings {
    enum Target { xml, csv }
  }

  namespace Wire {
    model Name { first: string; last: string; }
    model Contact { contactName: Name; phone?: string; email?: string; }
    model Root { applicant: string; contacts: Contact[]; }
  }

  namespace Flat {
    model Row { applicantName: string; }
  }

  namespace Forms {
    ${body}
  }
`;

const NAME = `
  @Meta.question(#{ id: "person/name" })
  @Mapping.to(Mappings.Target.xml, Wire.Name)
  model PersonName {
    @Mapping.to(Mappings.Target.xml, Wire.Name.first) firstName: string;
    @Mapping.to(Mappings.Target.xml, Wire.Name.last) lastName: string;
  }
  model ContactInfo { phone?: string; email?: string; }
`;

const resolve = (program: Program, model: string, mapping = "xml") => {
  const [source] = program.resolveTypeReference(`Forms.${model}`);
  const [member] = program.resolveTypeReference(`Mappings.Target.${mapping}`);
  return resolveMapping(program, source as Model, member as EnumMember);
};

/** Each node as `source -> target (kind)`, children indented below it. */
const outline = (nodes: MappingNode[], depth = 0): string[] =>
  nodes.flatMap((node) => [
    `${"  ".repeat(depth)}${node.sourcePath.join(".")} -> ${
      node.target ? `${node.target.model?.name}.${node.target.name}` : "-"
    } (${node.kind})`,
    ...outline(node.children, depth + 1),
  ]);

describe("resolveMapping", () => {
  it("composes a question's links into the form that uses it", async () => {
    const { program } = await Tester.compile(
      spec(`
        ${NAME}
        @Mapping.to(Mappings.Target.xml, Wire.Contact)
        @Mapping.path(Mappings.Target.xml, "contact.phone", Wire.Contact.phone)
        @Mapping.path(Mappings.Target.xml, "contact.email", Wire.Contact.email)
        model KeyContact {
          @Mapping.to(Mappings.Target.xml, Wire.Contact.contactName) name: PersonName;
          contact: ContactInfo;
        }
        ${formMeta("contacts")}
        @Mapping.to(Mappings.Target.xml, Wire.Root)
        model ContactsForm {
          @Mapping.to(Mappings.Target.xml, Wire.Root.applicant) applicant: string;
          @Mapping.to(Mappings.Target.xml, Wire.Root.contacts) contacts: KeyContact[];
        }
      `),
    );
    const resolved = resolve(program, "ContactsForm");
    expect(resolved?.target.name).toBe("Root");
    expect(outline(resolved!.children)).toEqual([
      "applicant -> Root.applicant (leaf)",
      "contacts -> Root.contacts (array)",
      "  contacts.name -> Contact.contactName (object)",
      "    contacts.name.firstName -> Name.first (leaf)",
      "    contacts.name.lastName -> Name.last (leaf)",
      "  contacts.contact -> - (group)",
      "    contacts.contact.phone -> Contact.phone (leaf)",
      "    contacts.contact.email -> Contact.email (leaf)",
    ]);
  });

  it("lets a composing model's path override a composed question's link", async () => {
    const { program } = await Tester.compile(
      spec(`
        ${NAME}
        @Mapping.to(Mappings.Target.xml, Wire.Contact)
        @Mapping.path(Mappings.Target.xml, "name.firstName", Wire.Name.last)
        @Mapping.path(Mappings.Target.xml, "name.lastName", Wire.Name.first)
        model Reversed {
          @Mapping.to(Mappings.Target.xml, Wire.Contact.contactName) name: PersonName;
        }
      `),
    );
    expect(outline(resolve(program, "Reversed")!.children)).toEqual([
      "name -> Contact.contactName (object)",
      "  name.firstName -> Name.last (leaf)",
      "  name.lastName -> Name.first (leaf)",
    ]);
  });

  it("resolves each mapping from its own links only", async () => {
    const { program } = await Tester.compile(
      spec(`
        @Mapping.to(Mappings.Target.xml, Wire.Root)
        @Mapping.to(Mappings.Target.csv, Flat.Row)
        model Both {
          @Mapping.to(Mappings.Target.xml, Wire.Root.applicant)
          @Mapping.to(Mappings.Target.csv, Flat.Row.applicantName)
          applicant: string;
          unlinked?: string;
        }
      `),
    );
    expect(outline(resolve(program, "Both", "xml")!.children)).toEqual([
      "applicant -> Root.applicant (leaf)",
    ]);
    expect(outline(resolve(program, "Both", "csv")!.children)).toEqual([
      "applicant -> Row.applicantName (leaf)",
    ]);
  });

  it("is undefined for a model with no link in the mapping", async () => {
    const { program } = await Tester.compile(
      spec(`
        @Mapping.to(Mappings.Target.xml, Wire.Root)
        model XmlOnly {}
      `),
    );
    expect(resolve(program, "XmlOnly", "csv")).toBeUndefined();
  });
});

describe("mapping diagnostics", () => {
  describe("mapping-target-undeclared", () => {
    it("rejects a mapping no namespace declares", async () => {
      const diagnostics = await Tester.diagnose(
        spec(
          `@Mapping.to(Mappings.Target.xml, Wire.Root) model Undeclared {}`,
          {
            declare: false,
          },
        ),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-target-undeclared",
      });
    });

    it("accepts a declared mapping", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          spec(`@Mapping.to(Mappings.Target.xml, Wire.Root) model Declared {}`),
        ),
      );
    });
  });

  describe("mapping-duplicate", () => {
    it("rejects two links in one mapping", async () => {
      const diagnostics = await Tester.diagnose(
        spec(`
          @Mapping.to(Mappings.Target.xml, Wire.Root)
          @Mapping.to(Mappings.Target.xml, Wire.Contact)
          model Twice {}
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-duplicate",
      });
    });

    it("accepts one link in each of two mappings", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          spec(`
            @Mapping.to(Mappings.Target.xml, Wire.Root)
            @Mapping.to(Mappings.Target.csv, Flat.Row)
            model OncePerMapping {}
          `),
        ),
      );
    });
  });

  describe("mapping-path-unresolved", () => {
    it("rejects a path that names no property", async () => {
      const diagnostics = await Tester.diagnose(
        spec(`
          ${NAME}
          @Mapping.to(Mappings.Target.xml, Wire.Contact)
          @Mapping.path(Mappings.Target.xml, "contact.pager", Wire.Contact.phone)
          model Pager { contact: ContactInfo; }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-path-unresolved",
        message: /has no property "pager"/,
      });
    });

    it("accepts a path through an unlinked object", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          spec(`
            ${NAME}
            @Mapping.to(Mappings.Target.xml, Wire.Contact)
            @Mapping.path(Mappings.Target.xml, "contact.phone", Wire.Contact.phone)
            model Phone { contact: ContactInfo; }
          `),
        ),
      );
    });
  });

  describe("mapping-target-out-of-context", () => {
    it("rejects a property linked outside its parent's target", async () => {
      const diagnostics = await Tester.diagnose(
        spec(`
          @Mapping.to(Mappings.Target.xml, Wire.Root)
          model Elsewhere {
            @Mapping.to(Mappings.Target.xml, Wire.Contact.phone) phone: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-target-out-of-context",
      });
    });

    it("accepts a property linked within its parent's target", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          spec(`
            @Mapping.to(Mappings.Target.xml, Wire.Contact)
            model Within {
              @Mapping.to(Mappings.Target.xml, Wire.Contact.phone) phone: string;
            }
          `),
        ),
      );
    });
  });

  describe("mapping-type-mismatch", () => {
    it("rejects a question linked to a different model than its target", async () => {
      const diagnostics = await Tester.diagnose(
        spec(`
          @Mapping.to(Mappings.Target.xml, Wire.Contact)
          model NotAName { phone?: string; }
          @Mapping.to(Mappings.Target.xml, Wire.Contact)
          model Mismatched {
            @Mapping.to(Mappings.Target.xml, Wire.Contact.contactName) name: NotAName;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-type-mismatch",
        message: /NotAName maps to Contact, not Name/,
      });
    });

    it("rejects a value linked to an object", async () => {
      const diagnostics = await Tester.diagnose(
        spec(`
          @Mapping.to(Mappings.Target.xml, Wire.Contact)
          model ValueToObject {
            @Mapping.to(Mappings.Target.xml, Wire.Contact.contactName) name: string;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-type-mismatch",
      });
    });

    it("rejects a model linked to a property", async () => {
      const diagnostics = await Tester.diagnose(
        spec(
          `@Mapping.to(Mappings.Target.xml, Wire.Root.applicant) model ToProperty {}`,
        ),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-type-mismatch",
      });
    });

    it("accepts an object linked to the model its type maps to", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          spec(`
            ${NAME}
            @Mapping.to(Mappings.Target.xml, Wire.Contact)
            model Matched {
              @Mapping.to(Mappings.Target.xml, Wire.Contact.contactName) name: PersonName;
            }
          `),
        ),
      );
    });
  });

  describe("mapping-cardinality-mismatch", () => {
    it("rejects a single value linked to a list", async () => {
      const diagnostics = await Tester.diagnose(
        spec(`
          @Mapping.to(Mappings.Target.xml, Wire.Root)
          model OneToMany {
            @Mapping.to(Mappings.Target.xml, Wire.Root.contacts) contact: Wire.Contact;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-cardinality-mismatch",
      });
    });

    it("accepts a list linked to a list", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          spec(`
            @Mapping.to(Mappings.Target.xml, Wire.Root)
            model ManyToMany {
              @Mapping.to(Mappings.Target.xml, Wire.Root.contacts) contacts: Wire.Contact[];
            }
          `),
        ),
      );
    });
  });

  describe("mapping-target-duplicate", () => {
    it("rejects two sources landing on one target, through a group", async () => {
      const diagnostics = await Tester.diagnose(
        spec(`
          ${NAME}
          @Mapping.to(Mappings.Target.xml, Wire.Contact)
          @Mapping.path(Mappings.Target.xml, "contact.phone", Wire.Contact.phone)
          model TwoPhones {
            @Mapping.to(Mappings.Target.xml, Wire.Contact.phone) phone: string;
            contact: ContactInfo;
          }
        `),
      );
      expectDiagnostics(diagnostics, {
        code: "simpler-forms/mapping-target-duplicate",
      });
    });

    it("accepts distinct targets", async () => {
      expectDiagnosticEmpty(
        await Tester.diagnose(
          spec(`
            ${NAME}
            @Mapping.to(Mappings.Target.xml, Wire.Contact)
            @Mapping.path(Mappings.Target.xml, "contact.email", Wire.Contact.email)
            model PhoneAndEmail {
              @Mapping.to(Mappings.Target.xml, Wire.Contact.phone) phone: string;
              contact: ContactInfo;
            }
          `),
        ),
      );
    });
  });
});
