import type { ModelProperty, Program } from "@typespec/compiler";
import { expectDiagnostics } from "@typespec/compiler/testing";
import { describe, expect, it } from "vitest";
import { propTransform } from "../src/model.js";
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
