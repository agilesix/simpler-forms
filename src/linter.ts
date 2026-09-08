import type { Model, ModelProperty, Scalar } from "@typespec/compiler";
import {
  createRule,
  defineCodeFix,
  defineLinter,
  getDoc,
  getMaxItems,
  getMaxLength,
  getMinItems,
  getMinLength,
  getSourceLocation,
  paramMessage,
  serializeValueAsJson,
} from "@typespec/compiler";
import {
  allBlocks,
  modelOrder,
  orderedProps,
  propEnabledWhen,
  propOmit,
  propReadOnlyWhen,
  propRequiredWhen,
  propSection,
  propValidationConstraintsWhen,
  propVisibleWhen,
} from "./model.js";

/**
 * Hygiene checks. A TypeSpec linter rule may only be a warning, so everything whose failure
 * makes an artifact *wrong* lives in `$onValidate` instead; what is left here is a
 * specification worth tidying rather than a broken one.
 */

const orphanQuestion = createRule({
  name: "no-orphan-question",
  severity: "warning",
  description: "A bank question that no form and no other question composes.",
  messages: {
    default: paramMessage`Question "${"id"}" is composed by nothing. Either a form should ask it or it should be deleted; an unasked question is still maintained.`,
  },
  create(context) {
    return {
      root: (program) => {
        const blocks = allBlocks(program);
        const byType = new Map(blocks.map((block) => [block.model, block]));
        const referenced = new Set<string>();

        // Reachability, not property references. A question is composed by holding it in a
        // property, by extending it, or by being reached through a model that is not itself
        // a question -- and all three have to count, or the rule reports a question that a
        // form does ask.
        const seen = new Set<Model | Scalar>();
        const reach = (type: Model | Scalar, viaComposition: boolean): void => {
          const block = byType.get(type);
          if (block && viaComposition) referenced.add(block.id);
          if (seen.has(type)) return;
          seen.add(type);
          // Extending a question composes it, for a scalar as much as for a model: naming a
          // shape does not make the shape unasked.
          const base = type.kind === "Model" ? type.baseModel : type.baseScalar;
          if (base) reach(base, true);
          if (type.kind !== "Model") return;
          for (const prop of type.properties.values()) {
            for (const target of held(prop)) reach(target, true);
            for (
              let source = prop.sourceProperty;
              source;
              source = source.sourceProperty
            ) {
              if (source.model) reach(source.model, true);
            }
          }
        };
        for (const block of blocks) reach(block.model, false);

        for (const block of blocks) {
          if (block.kind !== "question") continue;
          if (referenced.has(block.id)) continue;
          context.reportDiagnostic({
            target: block.model,
            format: { id: block.id },
          });
        }
      },
    };
  },
});

/**
 * The declarations a property holds: its own type, and the entries of a list.
 *
 * Both, because a list can itself be a question -- `primary-org/applicant-type` is one to
 * three codes, so the *list* is what the form asks -- and the entries can be a question too.
 * Returning only the entries reports the list as composed by nothing.
 */
function held(prop: ModelProperty): (Model | Scalar)[] {
  const type = prop.type;
  if (type.kind === "Scalar") return [type];
  if (type.kind !== "Model") return [];
  const out: (Model | Scalar)[] = [type];
  const item = type.indexer?.value;
  if (item && (item.kind === "Model" || item.kind === "Scalar")) out.push(item);
  return out;
}

const questionDocs = createRule({
  name: "require-question-docs",
  severity: "warning",
  description:
    "Every bank question needs a doc comment; it becomes its description.",
  messages: {
    default: paramMessage`Question "${"id"}" has no doc comment, so it has no description. Applicants read it, and so does anyone browsing the bank.`,
  },
  create(context) {
    return {
      root: (program) => {
        for (const block of allBlocks(program)) {
          if (block.kind !== "question") continue;
          if (getDoc(program, block.model)) continue;
          context.reportDiagnostic({
            target: block.model,
            format: { id: block.id },
          });
        }
      },
    };
  },
});

const sectionUnused = createRule({
  name: "section-unused",
  severity: "warning",
  description: "A declared section that no field is placed in.",
  messages: {
    default: paramMessage`Section "${"section"}" on ${"form"} holds no fields, so it will not render. Usually this means a field was dropped.`,
  },
  create(context) {
    return {
      root: (program) => {
        for (const block of allBlocks(program)) {
          if (
            block.kind !== "form" ||
            !block.sections ||
            block.model.kind !== "Model"
          )
            continue;
          const used = new Set<string>();
          for (const prop of orderedProps(program, block)) {
            const section = propSection(program, prop);
            if (section) used.add(section.name);
          }
          for (const member of block.sections.members.values()) {
            if (used.has(member.name)) continue;
            // A documented empty section is deliberate static presentation content.
            if (getDoc(program, member)) continue;
            context.reportDiagnostic({
              target: member,
              format: { section: member.name, form: block.id },
            });
          }
        }
      },
    };
  },
});

const orderIncomplete = createRule({
  name: "order-incomplete",
  severity: "warning",
  description: "@UI.order that omits a property, which then falls to the end.",
  messages: {
    default: paramMessage`@UI.order on ${"model"} omits ${"missing"}. Omitted properties are appended in declaration order, which is rarely what was meant.`,
  },
  create(context) {
    return {
      model: (model) => {
        const order = modelOrder(context.program, model);
        if (!order) return;
        const missing = [...properties(model)]
          .filter(
            (prop) =>
              !propOmit(context.program, prop) && !order.includes(prop.name),
          )
          .map((prop) => prop.name);
        if (!missing.length) return;
        context.reportDiagnostic({
          target: model,
          format: {
            model: model.name || "an anonymous model",
            missing: missing.join(", "),
          },
          codefixes: [appendToOrder(model, missing)],
        });
      },
    };
  },
});

/**
 * The fix is mechanical -- append the missing names in declaration order -- so it is
 * offered rather than described.
 */
function appendToOrder(model: Model, missing: string[]) {
  return defineCodeFix({
    id: "append-to-ui-order",
    label: `Append ${missing.join(", ")} to @UI.order`,
    fix: (context) => {
      const decorator = model.decorators.find(
        (d) => d.definition?.name === "@order",
      );
      const location = getSourceLocation(decorator?.node ?? model.node);
      if (!location) return;
      const text = location.file.text.slice(location.pos, location.end);
      const close = text.lastIndexOf(")");
      if (close < 0) return;
      const addition = missing.map((n) => `, ${model.name}.${n}`).join("");
      return context.prependText(
        {
          file: location.file,
          pos: location.pos + close,
          end: location.pos + close,
        },
        addition,
      );
    },
  });
}

const redeclaredProperty = createRule({
  name: "no-redeclared-property",
  severity: "warning",
  description: "A derived block re-declaring a property it already inherits.",
  messages: {
    default: paramMessage`${"model"} re-declares ${"names"} identically to ${"base"}. A redeclaration that narrows -- making an optional member required for this form -- says something; one that repeats says nothing, and leaves two copies to keep in step by hand. For presentation only, use @UI.overrides.`,
  },
  create(context) {
    return {
      model: (model) => {
        if (!model.baseModel) return;
        const inherited = new Map<string, ModelProperty>();
        for (let m: Model | undefined = model.baseModel; m; m = m.baseModel) {
          for (const [name, prop] of m.properties)
            if (!inherited.has(name)) inherited.set(name, prop);
        }
        const clashes = [...model.properties.values()]
          .filter((prop) => {
            const base = inherited.get(prop.name);
            if (
              base &&
              [
                [
                  propEnabledWhen(context.program, base),
                  propEnabledWhen(context.program, prop),
                ],
                [
                  propReadOnlyWhen(context.program, base),
                  propReadOnlyWhen(context.program, prop),
                ],
                [
                  propRequiredWhen(context.program, base),
                  propRequiredWhen(context.program, prop),
                ],
                [
                  propValidationConstraintsWhen(context.program, base),
                  propValidationConstraintsWhen(context.program, prop),
                ],
                [
                  propVisibleWhen(context.program, base),
                  propVisibleWhen(context.program, prop),
                ],
              ].some(
                ([left, right]) =>
                  JSON.stringify(left) !== JSON.stringify(right),
              )
            ) {
              return false;
            }
            // Narrowing is the point of redeclaring: a form may require a member the
            // question leaves optional. Only an identical repeat is worth a warning.
            return (
              base &&
              base.optional === prop.optional &&
              base.type === prop.type &&
              getMinItems(context.program, base) ===
                getMinItems(context.program, prop) &&
              getMaxItems(context.program, base) ===
                getMaxItems(context.program, prop) &&
              getMinLength(context.program, base) ===
                getMinLength(context.program, prop) &&
              getMaxLength(context.program, base) ===
                getMaxLength(context.program, prop) &&
              JSON.stringify(
                base.defaultValue
                  ? serializeValueAsJson(
                      context.program,
                      base.defaultValue,
                      base.defaultValue.type,
                    )
                  : undefined,
              ) ===
                JSON.stringify(
                  prop.defaultValue
                    ? serializeValueAsJson(
                        context.program,
                        prop.defaultValue,
                        prop.defaultValue.type,
                      )
                    : undefined,
                )
            );
          })
          .map((prop) => prop.name);
        if (!clashes.length) return;
        context.reportDiagnostic({
          target: model,
          format: {
            model: model.name || "an anonymous model",
            names: clashes.join(", "),
            base: model.baseModel.name || "its base",
          },
        });
      },
    };
  },
});

const untaggedQuestion = createRule({
  name: "require-question-tags",
  severity: "warning",
  description: "A bank question with no tags cannot be found by browsing.",
  messages: {
    default: paramMessage`Question "${"id"}" has no @Meta.tag, so it appears under no heading in the question browser.`,
  },
  create(context) {
    return {
      root: (program) => {
        for (const block of allBlocks(program)) {
          if (block.kind !== "question" || block.tags.length) continue;
          context.reportDiagnostic({
            target: block.model,
            format: { id: block.id },
          });
        }
      },
    };
  },
});

/** Own and inherited properties, the derived declaration winning. */
function properties(model: Model): ModelProperty[] {
  const out = new Map<string, ModelProperty>();
  const chain: Model[] = [];
  for (let m: Model | undefined = model; m; m = m.baseModel) chain.unshift(m);
  for (const m of chain)
    for (const prop of m.properties.values()) out.set(prop.name, prop);
  return [...out.values()];
}

export const $linter = defineLinter({
  rules: [
    orphanQuestion,
    questionDocs,
    sectionUnused,
    orderIncomplete,
    redeclaredProperty,
    untaggedQuestion,
  ],
  ruleSets: {
    recommended: {
      enable: {
        "simpler-forms/no-orphan-question": true,
        "simpler-forms/require-question-docs": true,
        "simpler-forms/section-unused": true,
        "simpler-forms/order-incomplete": true,
        "simpler-forms/no-redeclared-property": true,
        "simpler-forms/require-question-tags": true,
      },
    },
  },
});
