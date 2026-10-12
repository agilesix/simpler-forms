import type { EnumMember, Model, Program } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { type MappingNode, resolveMapping } from "../src/mapping.js";
import { resolveMappingFrom } from "../src/mapping-from.js";
import { Tester, formMeta } from "./tester.js";

/**
 * One form linked to one XML shape both ways: `@Mapping.to` on the form, and `@Mapping.from`
 * on the XML shape. `wire` replaces the XML shape where a test needs a different one.
 */
const FORM = `
  @Meta.question(#{ id: "person/name" })
  @Mapping.to(Mappings.Target.xml, Wire.Name)
  model PersonName {
    @Mapping.to(Mappings.Target.xml, Wire.Name.first) firstName: string;
    @Mapping.to(Mappings.Target.xml, Wire.Name.last) lastName: string;
  }
  model ContactInfo { phone?: string; email?: string; }

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
`;

/** The same form with no `@Mapping.to`, for targets of a different shape. */
const PLAIN_FORM = `
  @Meta.question(#{ id: "person/name" })
  model PersonName { firstName: string; lastName: string; }
  ${formMeta("contacts")}
  model ContactsForm { applicant: string; }
`;

const WIRE = `
  model Name {
    @Mapping.from(Mappings.Target.xml, Forms.PersonName.firstName) first: string;
    @Mapping.from(Mappings.Target.xml, Forms.PersonName.lastName) last: string;
  }
  model Contact {
    @Mapping.from(Mappings.Target.xml, Forms.KeyContact.name) contactName: Name;
    @Mapping.from(Mappings.Target.xml, Forms.ContactInfo.phone) phone?: string;
    @Mapping.from(Mappings.Target.xml, Forms.ContactInfo.email) email?: string;
  }
  @Mapping.from(Mappings.Target.xml, Forms.ContactsForm)
  model Root {
    @Mapping.from(Mappings.Target.xml, Forms.ContactsForm.applicant) applicant: string;
    @Mapping.from(Mappings.Target.xml, Forms.ContactsForm.contacts) contacts: Contact[];
  }
`;

const spec = (wire = WIRE, form = FORM) => `
  import "simpler-forms";
  using SimplerForms;

  @Mapping.targets(Target)
  namespace Mappings {
    enum Target { xml }
  }

  namespace Wire { ${wire} }
  namespace Forms { ${form} }
`;

const members = (program: Program) => {
  const [form] = program.resolveTypeReference("Forms.ContactsForm");
  const [xml] = program.resolveTypeReference("Mappings.Target.xml");
  return { form: form as Model, xml: xml as EnumMember };
};

/** Each node as `source -> target (kind)`, children indented below it. */
const outline = (nodes: MappingNode[], depth = 0): string[] =>
  nodes.flatMap((node) => [
    `${"  ".repeat(depth)}${node.sourcePath.join(".")} -> ${
      node.target ? `${node.target.model?.name}.${node.target.name}` : "-"
    } (${node.kind})`,
    ...outline(node.children, depth + 1),
  ]);

describe("resolveMappingFrom", () => {
  it("resolves to the tree @Mapping.to gives, groups included", async () => {
    const { program } = await Tester.compile(spec());
    const { form, xml } = members(program);
    const from = resolveMappingFrom(program, form, xml);
    expect(from?.problems).toEqual([]);
    expect(from?.resolved.target.name).toBe("Root");
    expect(outline(from!.resolved.children)).toEqual(
      outline(resolveMapping(program, form, xml)!.children),
    );
    expect(outline(from!.resolved.children)).toContain(
      "  contacts.contact -> - (group)",
    );
  });

  it("is undefined for a form no target names", async () => {
    const { program } = await Tester.compile(
      spec(
        WIRE.replace(
          "@Mapping.from(Mappings.Target.xml, Forms.ContactsForm)",
          "",
        ),
      ),
    );
    const { form, xml } = members(program);
    expect(resolveMappingFrom(program, form, xml)).toBeUndefined();
  });

  it("reports a wrapper element, which rules keyed by the form's properties cannot write", async () => {
    const [{ program }, diagnostics] = await Tester.compileAndDiagnose(
      spec(
        `
        model Profile {
          @Mapping.from(Mappings.Target.xml, Forms.ContactsForm.applicant) applicant: string;
        }
        @Mapping.from(Mappings.Target.xml, Forms.ContactsForm)
        model Root { profile: Profile; }
      `,
        PLAIN_FORM,
      ),
    );
    const { form, xml } = members(program);
    const from = resolveMappingFrom(program, form, xml)!;
    expect(from.resolved.children).toEqual([]);
    expect(from.problems.map((p) => p.code)).toEqual([
      "simpler-forms/mapping-from-wrapper",
    ]);
    // An emitter whose output cannot hold a wrapper reports it; compiling does not.
    expect(diagnostics).toEqual([]);
  });

  it("reports a field that is not below the parent's", async () => {
    const [{ program }] = await Tester.compileAndDiagnose(
      spec(
        `
        @Mapping.from(Mappings.Target.xml, Forms.ContactsForm)
        model Root {
          @Mapping.from(Mappings.Target.xml, Forms.PersonName.firstName) first: string;
        }
      `,
        PLAIN_FORM,
      ),
    );
    const { form, xml } = members(program);
    expect(
      resolveMappingFrom(program, form, xml)!.problems.map((p) => p.code),
    ).toEqual(["simpler-forms/mapping-from-unresolved"]);
  });

  it("takes, of several sources, the one below the parent's field", async () => {
    const { program } = await Tester.compile(
      spec(
        WIRE.replace(
          "@Mapping.from(Mappings.Target.xml, Forms.PersonName.firstName) first",
          "@Mapping.from(Mappings.Target.xml, Forms.OtherName.given)\n    @Mapping.from(Mappings.Target.xml, Forms.PersonName.firstName) first",
        ),
        `${FORM} model OtherName { given: string; }`,
      ),
    );
    const { form, xml } = members(program);
    const from = resolveMappingFrom(program, form, xml)!;
    expect(from.problems).toEqual([]);
    expect(outline(from.resolved.children)).toContain(
      "    contacts.name.firstName -> Name.first (leaf)",
    );
  });
});
