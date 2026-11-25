import type { Model } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { propNotBefore } from "../src/model.js";
import { Tester, form, formMeta } from "./tester.js";

describe("propNotBefore", () => {
  it.each([
    ["a spread", "...Period;"],
    ["an OptionalProperties<> copy", "...OptionalProperties<Period>;"],
  ])(
    "resolves to the sibling in the copy's own model (%s)",
    async (_copy, body) => {
      const { program } = await Tester.compile(
        form(`
        model Period {
          start?: plainDate;
          @Validation.notBefore(Period.start)
          end?: plainDate;
        }
        model OtherPeriod { ${body} }
        ${formMeta("date-order-check")}
        model DateOrderCheck { period?: Period; other?: OtherPeriod; }
      `),
      );
      const forms = program.getGlobalNamespaceType().namespaces.get("Forms")!;
      const model = (name: string) => forms.models.get(name) as Model;

      for (const name of ["Period", "OtherPeriod"]) {
        const end = model(name).properties.get("end")!;
        expect(propNotBefore(program, end)).toBe(
          model(name).properties.get("start"),
        );
      }
    },
  );
});
