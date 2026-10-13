import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

/**
 * A tester rooted at this package, so `import "simpler-forms"` resolves the way
 * it does in a real specification.
 *
 * `@typespec/json-schema` is deliberately absent. These fixtures exercise the checks, and a
 * check runs on the type graph -- whether the graph is also being emitted as JSON Schema is
 * not part of what is under test. The emitter has its own tests.
 */
export const Tester = createTester(
  fileURLToPath(new URL("..", import.meta.url)),
  {
    libraries: ["simpler-forms"],
  },
);

/**
 * The tags and entities a fixture's questions are catalogued by. A program declares its own;
 * these stand in for one.
 */
const catalogue = `
  @Meta.tags(TagName)
  @Meta.entities(EntityName)
  namespace Catalogue {
    enum TagName { address, attachment, generic, money, name, narrative, person, role }
    enum EntityName { generic, poc, primaryOrg }
  }
`;

/**
 * The preamble every fixture needs: the library, the program's catalogue, and a namespace to
 * declare blocks in.
 */
export const bank = (body: string) => `
  import "simpler-forms";
  using SimplerForms;
  using Catalogue;
  ${catalogue}
  namespace QuestionBank {
    ${body}
  }
`;

export const form = (body: string) => `
  import "simpler-forms";
  using SimplerForms;
  using Catalogue;
  ${catalogue}
  namespace Forms {
    ${body}
  }
`;

/** Metadata every form needs, so a fixture can say only what it is testing. */
export const formMeta = (id: string) =>
  `@Meta.form(#{ id: "${id}", formName: "${id}" })`;
