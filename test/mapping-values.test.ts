import type { ModelProperty, Program } from "@typespec/compiler";
import { expectDiagnostics } from "@typespec/compiler/testing";
import { describe, expect, it } from "vitest";
import { propMappingRequired, propMatch, propTransform } from "../src/model.js";
import { Tester, formMeta } from "./tester.js";

/**
 * A form and a target whose root reads it. `root` is the target root's properties; the
 * program declares one mapping, `xml`, and two transformations.
 */
const spec = (root: string, form = "title?: string; codes?: string[];") => `
  import "simpler-forms";
  using SimplerForms;

  @Mapping.targets(Target)
  namespace Mappings { enum Target { xml } }

  @Mapping.transforms(Transformation)
  namespace Transforms {
    enum Transformation { yesNo: "boolean_to_yes_no", truncate: "truncate_string" }
  }

  namespace Forms {
    ${formMeta("example")}
    model Example { ${form} }
  }

  namespace Wire {
    alias xml = Mappings.Target.xml;
    @Mapping.from(xml, Forms.Example)
    model Root { ${root} }
  }
`;

const prop = (program: Program, name: string) => {
  const [found] = program.resolveTypeReference(`Wire.Root.${name}`);
  return found as ModelProperty;
};

describe("@Mapping.transform", () => {
  it("names the transformation by its member's value, with its params", async () => {
    const [{ program }, diagnostics] = await Tester.compileAndDiagnose(
      spec(`
        @Mapping.from(xml, Forms.Example.title)
        @Mapping.transform(Transforms.Transformation.truncate, #{ max_length: 60 })
        title?: string;
      `),
    );
    expect(diagnostics).toEqual([]);
    const transform = propTransform(program, prop(program, "title"));
    expect(
      transform && { name: transform.name, params: transform.params },
    ).toEqual({
      name: "truncate_string",
      params: { max_length: 60 },
    });
  });

  it("reports a transformation from an enum no namespace declares", async () => {
    const diagnostics = await Tester.diagnose(
      spec(`
        @Mapping.from(xml, Forms.Example.title)
        @Mapping.transform(Wire.Other.upper)
        title?: string;
      `).replace(
        "namespace Wire {",
        "namespace Wire {\n    enum Other { upper }",
      ),
    );
    expectDiagnostics(diagnostics, {
      code: "simpler-forms/mapping-transform-undeclared",
    });
  });
});

describe("@Mapping.match", () => {
  it("spells out each value's entry, and a fixed default", async () => {
    const [{ program }, diagnostics] = await Tester.compileAndDiagnose(
      spec(
        `@Mapping.from(xml, Forms.Example.agrees)
         @Mapping.match(#{ \`true\`: "Y: Yes", \`false\`: "N: No" }, "N: No")
         agrees?: string;`,
        "agrees?: boolean;",
      ),
    );
    expect(diagnostics).toEqual([]);
    expect(propMatch(program, prop(program, "agrees"))).toEqual({
      cases: { true: "Y: Yes", false: "N: No" },
      default: { value: "N: No" },
    });
  });

  it("passes unlisted values through when the default names a field", async () => {
    const [{ program }, diagnostics] = await Tester.compileAndDiagnose(
      spec(`
        @Mapping.from(xml, Forms.Example.title)
        @Mapping.match(#{ \`b. the state\`: "b. the State" }, Forms.Example.title)
        title?: string;
      `),
    );
    expect(diagnostics).toEqual([]);
    const match = propMatch(program, prop(program, "title"))!;
    expect(match.cases).toEqual({ "b. the state": "b. the State" });
    expect(
      match.default && "field" in match.default && match.default.field.name,
    ).toBe("title");
  });

  it("has no default unless one is given", async () => {
    const { program } = await Tester.compile(
      spec(`
        @Mapping.from(xml, Forms.Example.title)
        @Mapping.match(#{ a: "A" })
        title?: string;
      `),
    );
    expect(propMatch(program, prop(program, "title"))).toEqual({
      cases: { a: "A" },
    });
  });

  it("keeps numbers and booleans as values", async () => {
    const { program } = await Tester.compile(
      spec(`
        @Mapping.from(xml, Forms.Example.title)
        @Mapping.match(#{ one: 1, yes: true }, 0)
        title?: string;
      `),
    );
    expect(propMatch(program, prop(program, "title"))).toEqual({
      cases: { one: 1, yes: true },
      default: { value: 0 },
    });
  });

  it("reports a property that has both a match and a transform", async () => {
    const diagnostics = await Tester.diagnose(
      spec(`
        @Mapping.from(xml, Forms.Example.title)
        @Mapping.match(#{ a: "A" })
        @Mapping.transform(Transforms.Transformation.truncate)
        title?: string;
      `),
    );
    expectDiagnostics(diagnostics, {
      code: "simpler-forms/mapping-match-and-transform",
    });
  });
});

describe("@Mapping.required", () => {
  it("marks only the properties written even when empty", async () => {
    const [{ program }, diagnostics] = await Tester.compileAndDiagnose(
      spec(`
        @Mapping.from(xml, Forms.Example.title) @Mapping.required title?: string;
        @Mapping.from(xml, Forms.Example.codes) codes?: string[];
      `),
    );
    expect(diagnostics).toEqual([]);
    expect(propMappingRequired(program, prop(program, "title"))).toBe(true);
    expect(propMappingRequired(program, prop(program, "codes"))).toBe(false);
  });
});
