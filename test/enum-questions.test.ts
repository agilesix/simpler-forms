import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

/** The emitter composes `@typespec/json-schema`, so these fixtures load it as well. */
const EmitTester = createTester(fileURLToPath(new URL("..", import.meta.url)), {
  libraries: ["simpler-forms", "@typespec/json-schema"],
});

const BANK = `
  import "simpler-forms";
  import "@typespec/json-schema";
  using SimplerForms;

  @JsonSchema.jsonSchema
  namespace QuestionBank {
    /** A US state. */
    @Meta.question(#{ id: "types/codes/state-code" })
    enum StateCode { AL: "AL: Alabama", AK: "AK: Alaska" }

    /** A mailing address. */
    @Meta.question(#{ id: "types/address" })
    model Address { street: string; state?: StateCode; }

    /** A paint color, not a question of its own. */
    enum Color { red, blue }

    /** A painted thing. */
    @Meta.question(#{ id: "types/painted" })
    model Painted { color?: Color; }
  }
`;

const emitted = async () => {
  const { outputs } = await EmitTester.emit("simpler-forms").compile(BANK);
  return (path: string) => {
    const text = outputs[path];
    if (text === undefined)
      throw new Error(`no ${path}; emitted ${Object.keys(outputs).join(", ")}`);
    return JSON.parse(text);
  };
};

describe("@Meta.question on an enum", () => {
  it("publishes the code list as a question of its own", async () => {
    const read = await emitted();
    expect(
      read("question-bank/types/codes/state-code/schema.json"),
    ).toMatchObject({
      $id: "types/codes/state-code/schema.json",
      type: "string",
      enum: ["AL: Alabama", "AK: Alaska"],
    });
    expect(
      read("question-bank/types/codes/state-code/index.json"),
    ).toMatchObject({
      id: "types/codes/state-code",
      kind: "question",
    });
  });

  it("is referenced by the questions that use it, not copied into them", async () => {
    const address = (await emitted())(
      "question-bank/types/address/schema.json",
    );
    expect(address.properties.state.$ref).toMatch(
      /types\/codes\/state-code\/schema\.json$/,
    );
    expect(address.$defs).toBeUndefined();
  });

  it("leaves an enum that isn't a question inlined, as before", async () => {
    const painted = (await emitted())(
      "question-bank/types/painted/schema.json",
    );
    expect(painted.properties.color.$ref).toBe("#/$defs/Color");
    expect(painted.$defs.Color.enum).toEqual(["red", "blue"]);
  });
});
