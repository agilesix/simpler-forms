# simpler-forms

A [TypeSpec](https://typespec.io) library for specifying forms once and emitting portable form
artifacts: a JSON Schema for the data, a UI schema for the layout, and an index describing how
the two relate.

The library holds no form content and no vocabulary of its own. Your program supplies the
questions, the forms, and the widgets, tags and mapping targets they use.

## Install

```bash
pnpm add -D simpler-forms @typespec/compiler @typespec/json-schema
```

`@typespec/compiler` and `@typespec/json-schema` are peer dependencies, so you control the
compiler version.

## Quick start

`tspconfig.yaml`:

```yaml
emit:
  - simpler-forms
options:
  simpler-forms:
    property-casing: snake
linter:
  extends:
    - simpler-forms/recommended
```

`main.tsp`:

```tsp
import "@typespec/json-schema";
import "simpler-forms";

using SimplerForms;

@Meta.tags(Tag)
@Meta.entities(Entity)
namespace Catalogue {
  enum Tag { name, contact }
  enum Entity { poc }
}

@UI.widgets(Widget)
namespace Rendering {
  enum Widget { Text, TextArea }
}

@JsonSchema.jsonSchema
namespace Questions {
  /** The name of the person to contact. */
  @Meta.question(#{ id: "poc/name", entity: Catalogue.Entity.poc })
  @Meta.tag(Catalogue.Tag.name, Catalogue.Tag.contact)
  model PersonName {
    @UI.label("First Name") firstName: string;
    @UI.label("Last Name") lastName: string;
  }
}

@JsonSchema.jsonSchema
namespace Forms {
  /** Who to contact about this application. */
  @Meta.form(#{ id: "point-of-contact", formName: "POINT OF CONTACT" })
  model PointOfContact {
    @UI.label("Contact Name")
    name: Questions.PersonName;

    @UI.label("Notes")
    @UI.widget(Rendering.Widget.TextArea)
    notes?: string;
  }
}
```

`tsp compile main.tsp` writes:

```
tsp-output/simpler-forms/
  question-bank/poc/name/      schema.json  ui.json  index.json
  forms/point-of-contact/      schema.json  ui.json  index.json  manifest.json
```

| Artifact        | What it holds                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `schema.json`   | The JSON Schema for the data, with its validation                                                                                   |
| `ui.json`       | A [JSON Forms](https://jsonforms.io) UI schema laying the data out                                                                  |
| `index.json`    | A catalogue entry: name, description and tags; for a question, its entity and what it composes; for a form, where each field occurs |
| `manifest.json` | The form's identity and the artifacts in its package                                                                                |

Where the artifacts go from there is up to you: the emitter writes the same layout to
`emitter-output-dir` regardless of where your application installs them.

## Questions

A question is a reusable block of a form, given a stable id with `@Meta.question`. It is
published under `question-bank/<id>/`, and a form that composes it refers to its schema.

- `entity` names what the question is asked about, and is the first segment of its id.
- `@Meta.tag` files it under headings in a question catalogue.
- Its doc comment is its description; `@UI.label` and `@UI.helpText` are how it reads in a form.
- A property whose type is a question takes the question's label unless it sets its own.

A question can be an object (a model), a single value (a scalar) or a code list (an enum). A
code list published as a question, such as a list of states, is written once, and the
questions that use it refer to it. An enum without `@Meta.question` is copied into each
schema that uses it, as before.

## Forms

`@Meta.form` goes on the model holding the data an applicant submits, and publishes it under
`forms/<id>/`. Its fields' `@UI.*` decorators lay it out, and each object field becomes a
labeled group.

Validation lives on the form and its questions, in the `@Validation.*` decorators:
conditional requiredness (`@Validation.requiredPaths`, `@Validation.requiredWhen`), constraints
that apply under a condition, and more. See `lib/validation.tsp` for the full set.

### Formulas

An answer calculated from others, like a budget's total, has a `@Formula.*` decorator: `sum`,
`subtract` or `percentOf`. A source is a field, or a path of fields written as a tuple, where a
list means every item. The first field is on the formula's own model, so each place the model
is used reads its own answers, or on a model that contains it:

```tsp
model CostRow {
  total?: Money;
  nonAllowable?: Money;
  @Formula.subtract(CostRow.total, CostRow.nonAllowable) allowable?: Money;
}

model Budget {
  rows?: CostRow[];
  @Formula.sum([Budget.rows, CostRow.allowable]) allowableTotal?: Money;

  // A block answer is calculated field by field. It skips the fields it calculates itself,
  // which are then worked out from the totals.
  @Formula.sum(Budget.rows) rowTotals?: CostRow;
}
```

Formulas say what is calculated, not when: an emitter that runs them in order works the order
out from what each one reads, and formulas that read each other in a loop are an error. Which
value types each formula supports is up to the emitter that runs it. An emitter reads a
field's formula with `propFormula`, which resolves each source to the fields it reads.

A platform's own identity for a form, such as the name and version a submission system knows it
by, belongs in that platform's TypeSpec library, as a decorator of its own on the same model.

## Layouts

A `@UI.layout` model presents a form differently from how its data is shaped, and is published
as the form's `ui.json`. It points at the form's fields with typed references, so a misspelled
field is a compiler error.

```tsp
@UI.layout(PointOfContact)
model PointOfContactLayout {
  /** Enter the contact's name. */
  @UI.label("Contact")
  contact: {
    name: PointOfContact.name;
  };

  @UI.label("Other")
  other: {
    notes: PointOfContact.notes;
  };
}
```

- Its top-level properties are sections, in order, and a doc comment is a section's description.
- A field reference places that field as its own model lays it out.
- An entry typed as a model with `@UI.field(ref)` lays out that field's contents, listing only
  what changes and keeping the rest in their declared order. References inside it are relative
  to the field, so one entry model can serve several fields.
- An entry can set a label, help text, a widget, `@UI.omit`, `@UI.flatten` (place a field's
  children without their group) and one display condition.
- Validation stays on the form, so a `@Validation.*` decorator on a layout entry is an error.

A form has at most one layout.

## Your program's vocabulary

Which widgets your renderers provide, which tags and entities your question bank uses, and
which representations your forms map to are yours to declare. Declare each set once, on a
namespace, and the decorators that use them take its members:

| Declare                  | Used by                        |
| ------------------------ | ------------------------------ |
| `@UI.widgets(Enum)`      | `@UI.widget`                   |
| `@Meta.tags(Enum)`       | `@Meta.tag`                    |
| `@Meta.entities(Enum)`   | `@Meta.question`'s `entity`    |
| `@Mapping.targets(Enum)` | `@Mapping.to`, `@Mapping.from` |

A member of an enum no namespace declares is an error. Where a member is emitted, its string
value is used when it has one, and its name otherwise.

## Mappings

A response often has to be written in another shape too, such as an XML document or a CSV row.
A mapping links a form to a TypeSpec model of that shape, the mapping target. Wire details
such as element names and namespaces stay on the target, in whatever vocabulary its
representation uses.

Declare the links on the target with `@Mapping.from`. The target's root names the form, and
each property names the field it is filled from, relative to its parent's field. A target type
shared by many forms is annotated once, against the questions that fill it:

```tsp
@Mapping.targets(Target)
namespace Mappings {
  enum Target { xml }
}

model Name {
  @Mapping.from(Mappings.Target.xml, Questions.PersonName.firstName) first: string;
  @Mapping.from(Mappings.Target.xml, Questions.PersonName.lastName) last: string;
}

@Mapping.from(Mappings.Target.xml, Forms.PointOfContact)
model Root {
  @Mapping.from(Mappings.Target.xml, Forms.PointOfContact.name) contactName: Name;
  @Mapping.from(Mappings.Target.xml, Forms.PointOfContact.notes) notes?: string;
}
```

A target can be filled from some of a list field's items. Name the field with `Mapping.Item`
for one item, counting from 0 (`-1` is the last), or `Mapping.Slice` for a range, its end
excluded. That fits a target that numbers its elements instead of repeating one:

```tsp
model Root {
  @Mapping.from(Mappings.Target.xml, Mapping.Item<Forms.Application.types, 0>) typeCode1: string;
  @Mapping.from(Mappings.Target.xml, Mapping.Item<Forms.Application.types, 1>) typeCode2?: string;
  @Mapping.from(Mappings.Target.xml, Mapping.Item<Forms.Application.sites, 0>) primarySite: Site;
  @Mapping.from(Mappings.Target.xml, Mapping.Slice<Forms.Application.sites, 1>) otherSites?: Site[];
}
```

### Changing a value on its way through

A target property can change the value it reads. `@Mapping.transform` names a transformation
the target emitter's runtime implements. The program declares the ones it uses in an enum, as
it does its mappings, with the name the runtime implements each under as its value:

```tsp
@Mapping.transforms(Transformation)
namespace Transforms {
  enum Transformation { yesNo: "boolean_to_yes_no", truncate: "truncate_string" }
}

model Root {
  @Mapping.from(Mappings.Target.xml, Forms.Application.title)
  @Mapping.transform(Transforms.Transformation.truncate, #{ max_length: 60 })
  title: string;
}
```

A lookup can be spelled out instead, with `@Mapping.match`, so every emitter applies it the
same way. A value it doesn't list is written as the default: a fixed value, or a field.
Naming the field the property is filled from passes other values through unchanged:

```tsp
model Root {
  @Mapping.from(Mappings.Target.xml, Forms.Application.agrees)
  @Mapping.match(#{ `true`: "Y: Yes", `false`: "N: No" })
  agrees: string;

  @Mapping.from(Mappings.Target.xml, Forms.Application.review)
  @Mapping.match(#{ `b. … by the state`: "b. … by the State" }, Forms.Application.review)
  stateReview: string;
}
```

An empty value is left out of the target. `@Mapping.required` writes it anyway, as an empty
element, for one the target requires but the form may leave unanswered:

```tsp
model Root {
  @Mapping.from(Mappings.Target.xml, Forms.Application.dateReceived)
  @Mapping.required
  dateReceived: plainDate;
}
```

`@Mapping.when` writes a target property only while a condition holds, so an answer the
form keeps after it stops applying, such as an explanation for an option the applicant has
since changed, isn't written. It compares the answer at a field with a value, using an
`Operator`: `equals`, `notEquals`, `in` (a list of values), `contains` (for a list answer) or
`exists` (no value). Every condition on a property must hold:

```tsp
model Root {
  @Mapping.from(Mappings.Target.xml, Forms.Application.revisionExplanation)
  @Mapping.when(Forms.Application.applicationType, Operator.equals, "Revision")
  @Mapping.when(Forms.Application.revisionCodes, Operator.contains, "E")
  revisionOtherExplanation?: string;
}
```

The same links can be declared from the form's side with `@Mapping.to`, plus `@Mapping.path`
for nested paths. Every link is checked as it resolves, against the target's type and
cardinality.

simpler-forms emits no mapping artifact itself: an emitter for the target format reads the
links (see [Writing a target emitter](#writing-a-target-emitter)).

## Options

Set under `options: simpler-forms:` in `tspconfig.yaml`.

| Option            | Default    | Effect                                                       |
| ----------------- | ---------- | ------------------------------------------------------------ |
| `base-uri`        | none       | Makes every `$id` and cross-block `$ref` absolute            |
| `property-casing` | `preserve` | `snake` writes `firstName` as `first_name` in every artifact |

With `snake`, specifications are still written in TypeSpec names, including string paths such as
`@Validation.requiredPaths("contact.name.firstName")`. A run of capitals is one word
(`OMBNumber` becomes `omb_number`), and digits stay with the word before them (`street1` is
unchanged). For a name the rule converts badly, set `@encodedName("application/json", "...")`
on every property with that name.

## Diagnostics

Checks run as you type in an editor with the TypeSpec extension, as well as on compile. Extend
`simpler-forms/recommended` in `tspconfig.yaml` for the lint rules, and suppress a diagnostic by
its code:

```tsp
#suppress "simpler-forms/no-orphan-question" "Asked only by forms in another repository"
```

## Writing a target emitter

An emitter for another format, such as the XML a mapping target describes, is a TypeSpec
library of its own, listed beside this one in `tspconfig.yaml`. It reads forms, layouts and
mappings through the package's JavaScript API:

```ts
import { resolveForms, resolveMappingFrom } from "simpler-forms";
```

That API, from `src/public.ts`, is the supported surface. Anything else in the package is
internal and can change in any release.

## Versioning

simpler-forms is below 1.0. A breaking change bumps the minor version (0.1.0 to 0.2.0), so
treat every minor release as potentially breaking. The changelog lists breaking changes first.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE.md). Copyright (c) 2026 Agile Six Applications, Inc.
