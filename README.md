# simpler-forms

A [TypeSpec](https://typespec.io) library for specifying grant application forms once and
emitting portable form artifacts — a JSON Schema for the data, a UI schema for the layout,
and an index describing how the two relate.

The library holds no form content and no vocabulary specific to any consuming application.
Form definitions, a shared question bank, and target-specific emitters live in the
repositories that consume this package.

## Status

Pre-release, published from `main` as `simpler-forms`, unscoped.

Versions stay below 1.0 for now. release-please is configured with `bump-minor-pre-major`,
so a breaking change moves the minor — 0.1.0 to 0.2.0 — instead of jumping to 1.0.0. Read any
minor bump as potentially breaking until this section says otherwise.

The library name is passed to `createTypeSpecLibrary` as both `name` and `alias`, and it is
the alias that prefixes every diagnostic code and lint rule id. So a suppression in a form
specification reads:

```tsp
#suppress "simpler-forms/no-orphan-question"
```

Because that prefix comes from the alias and not from the package name, moving the package
into an npm scope later — `@agilesix/simpler-forms`, say — leaves every suppression already
written in a specification working. What such a move does change is the import specifier in a
consumer's specs and its dependency entry, one line each.

## Install

```bash
pnpm add -D simpler-forms @typespec/compiler @typespec/json-schema
```

`@typespec/compiler` and `@typespec/json-schema` are peer dependencies, so a consumer
controls its own compiler version.

## Develop

```bash
pnpm install
pnpm build      # required before anything else — see below
pnpm test
pnpm checks     # format, lint, types, tests
```

**Build before you type-check.** Each `lib/*.tsp` file imports `dist/src/index.js` to resolve
the `extern dec` declarations it makes, so the TypeSpec sources do not type-check until the
compiled JavaScript exists. This is why CI runs `pnpm build` ahead of `pnpm checks`, and why
a fresh clone reports unimplemented decorators until the first build.

## Release

`main` is released by [release-please](https://github.com/googleapis/release-please). Pushing a
conventional commit opens or updates a release pull request; merging that pull request tags the
release and publishes the tarball to npm.

Publication authenticates through npm trusted publishing, so this repository holds no npm
token. The workflow exchanges a GitHub OIDC token for a short-lived credential, and npm
attaches a provenance attestation to the version it accepts. The trusted publisher is
configured against `.github/workflows/release.yml` by path, so renaming or moving that file
stops publication until the publisher is updated to match.

## Options

Set in `tspconfig.yaml` under `options: simpler-forms:`.

| Option            | Default    | Effect                                                        |
| ----------------- | ---------- | ------------------------------------------------------------- |
| `base-uri`        | none       | Makes every `$id` and cross-block `$ref` absolute.            |
| `property-casing` | `preserve` | `snake` writes `firstName` as `first_name` in every artifact. |

`property-casing` applies to `schema.json` property keys, `required` and conditional rules,
`ui.json` Control and rule scopes, `index.json` field occurrence paths, and `@example`
values. Specifications are still written in TypeSpec names, including string paths such as
`@Validation.requiredPaths("primaryContact.name.firstName")`, and a path that does not
resolve is reported in the name the author wrote.

The `snake` rule starts a word at each capital that follows a lowercase letter or a digit,
and treats a run of capitals as one word, so `ombNumber` and `OMBNumber` both become
`omb_number`. Digits stay with the word before them: `street1` is unchanged and
`sf424Version` becomes `sf424_version`. For a name the rule converts badly, use
`@encodedName("application/json", "...")` on that property; it overrides the casing. A
property name is emitted the same way everywhere it is declared, so every declaration of
that name needs the same `@encodedName`. Two properties of one model that would be emitted
under the same name are an error, and so is one name emitted two ways.

## Layout

```
lib/            TypeSpec declarations — the decorator vocabulary
  main.tsp        the entry point a consumer imports
  meta.tsp        @Meta.*   — question, submission, form, tags, entities, role
  ui.tsp          @UI.*     — layouts, labels, widgets, conditions
  validation.tsp  @Validation.*
  mapping.tsp     @Mapping.* — links to other representations of a response
  types.tsp       shared scalars and enums
src/            the library implementation
  public.ts       the API a target emitter reads — the only semver-governed surface
  decorators/     decorator entry points, one module per namespace
  model.ts        typed accessors over decorator state
  mapping.ts      resolveMapping — a form's links in one mapping, through what it composes
  forms.ts        which @Meta.form models are published, and under which ids
  layout.ts       resolves a @UI.layout's references, placements and conditions
  validate.ts     $onValidate — cross-cutting checks reported as diagnostics
  linter.ts       lint rules
  emitter.ts      $onEmit — writes the canonical artifacts
  casing.ts       property-casing — renames properties in finished artifacts
  emitters/       one module per emitted artifact
  lib.ts          createTypeSpecLibrary — diagnostics, lint rules, emitter options
test/           vitest suites, driven by the compiler's createTester
```

Only `src/public.ts` is public API. The decorator implementations, emitters and validators
are internal, and a target emitter reaching past that module depends on something that can
change in a patch.

## Design notes

**Diagnostics are live in the editor.** `$onValidate` runs in the standard compile pipeline
before the linter and is not gated by `noEmit`, and the language server routes through that
same pipeline. A custom diagnostic therefore appears as a squiggle while an author types,
not only in CI.

**Where artifacts land is the consumer's decision.** The emitter writes to
`emitter-output-dir` in a stable layout of its own. It deliberately knows nothing about any
consuming application's directory conventions; installing artifacts into a particular tree is
a separate step owned by the consumer, so that a downstream layout change is not a breaking
change here.

**Target vocabulary belongs downstream.** A consuming application's own decorators, state,
validation and emitted files are contributed by its own TypeSpec library listed alongside
this one in `tspconfig.yaml`, rather than by a plugin interface here.

**Widgets are the consumer's vocabulary.** Which widgets exist is a contract between a
program and its renderers, so this library ships no widget list. A program declares its own
set once with `@UI.widgets`, the way `@versioned` declares versions, and `@UI.widget` then
takes a member of that enum. A member of an enum no namespace declares is an error. The
emitted name is the member's string value when it has one, and its name otherwise:

```tsp
@UI.widgets(Widget)
namespace Rendering {
  enum Widget {
    Text,
    FieldList,
    Attachment: "ApplicationAttachment",
  }
}

model Contacts {
  @UI.widget(Rendering.Widget.FieldList)
  contacts: Contact[];
}
```

On a property whose type is a question with fields of its own, the widget is emitted on the
group those fields lay out as.

**Tags and entities are the consumer's catalogue.** A question bank sorts its questions by
tag and by the entity each is asked about, and which tags and entities exist is that bank's
decision. A program declares them the way it declares widgets, once each, with `@Meta.tags`
and `@Meta.entities`. `@Meta.tag` and a question's `entity` then take their members, and a
member of an enum no namespace declares is an error. As with widgets, a member's string value
is what's emitted to the question's `index.json` when it has one:

```tsp
@Meta.tags(Tag)
@Meta.entities(Entity)
namespace Catalogue {
  enum Tag { name, address, money }
  enum Entity { poc, primaryOrg }
}

@Meta.question(#{ id: "poc/name", entity: Catalogue.Entity.poc })
@Meta.tag(Catalogue.Tag.name)
model PocName {
  firstName: string;
}
```

**A submission is the data; a form is one way of presenting it.** `@Meta.submission` holds
what a form collects and submits: the schema, its validation and mappings, and the
Grants.gov identity, version included. `@Meta.form` is one presentation an applicant opens,
published under its own id as `forms/<id>/`. A simple form is its own presentation, the way
a question is: its fields' `@UI.*` decorators lay it out, and each object field becomes a
labelled group.

```tsp
@Meta.submission(#{ id: "key-contacts", shortFormName: "Key_Contacts", formVersion: "2.0" })
@Meta.form(#{ formName: "KEY CONTACTS" })
model KeyContacts {
  @UI.label("Applicant Organization Name")
  applicantOrganizationName: OrganizationName;

  @UI.widget(Rendering.Widget.FieldList)
  keyContacts: KeyContact[];
}
```

**A layout presents a submission another way.** A `@UI.layout` model points at the
submission's fields with typed references, so a misspelled field is a compiler error. Its
top-level properties are sections, in order. Inside one, a field reference places that
field as its model lays it out; a model with `@UI.field` lays out one field's contents,
listing what changes and leaving the rest in their declared order; a model without it is a
new group of only what it lists. References are relative to the enclosing `@UI.field` type,
or absolute from the presented model, so one entry model can serve several fields:

```tsp
model PersonWithoutCountyOrProvince {
  @UI.omit county: Person.address::type.county;
  @UI.omit province: Person.address::type.province;
}

@Meta.form(#{ id: "epa-key-contacts", formName: "EPA KEY CONTACTS FORM" })
@UI.layout(EPAKeyContacts)
model EPAKeyContactsLayout {
  @UI.label("Authorized Representative")
  @UI.field(EPAKeyContacts.authorizedRepresentative)
  authorizedRepresentative: PersonWithoutCountyOrProvince;

  @UI.label("Payee")
  @UI.field(EPAKeyContacts.payee)
  payee: PersonWithoutCountyOrProvince;
}
```

An entry can set a label, help text (`@UI.helpText` or a doc comment), a widget, `@UI.omit`,
`@UI.flatten` to place a field's children without their group, and one display condition
whose source is a typed reference resolved the same way. Validation stays on the submission,
which every layout shares, so a `@Validation.*` decorator on an entry is an error. Each
layout with a `@Meta.form` is published under its own id with the submission's schema; one
without is checked but not published.

**Mappings link a form to its other representations.** A response often has to be written
in another shape too: an XML document, a CSV row. `@Mapping.to` links a model or property to
its counterpart in a TypeSpec model of that shape, the mapping target. The wire details
(element names, namespaces, column headers) stay on the target, in whatever vocabulary its
representation uses. Which mappings exist is the program's to declare, with `@Mapping.targets`, the way
`@UI.widgets` declares widgets; each link names one, so a form carries several side by side:

```tsp
@Mapping.targets(Target)
namespace Mappings {
  enum Target { grantsGovXml, csv }
}

@Mapping.to(Mappings.Target.grantsGovXml, Xsd.HumanName)
model PersonName {
  @Mapping.to(Mappings.Target.grantsGovXml, Xsd.HumanName.firstName)
  @Mapping.to(Mappings.Target.csv, Csv.Row.contactFirstName)
  firstName: string;
}
```

A question links once, at the level its mapping is shared, and every form that composes it
gets those links. A composing model whose target differs adds or overrides links for nested
paths with `@Mapping.path`; an object with no link of its own whose descendants are linked
that way is flattened into its parent. A mapping emitter takes the members it emits as an
option, checks them against `mappingTargets`, and calls `resolveMapping` once per form per
member. Every link is checked as it resolves: against the model its parent maps to, against
the target's type and cardinality, and against other sources landing on the same target.

The same links can be declared from the other side, on the target, with `@Mapping.from`. The
target model names the form it is the target of, as `@UI.layout` names the form it presents,
and each target property names the field it is filled from, relative to the field its parent
is filled from. A target shared by many forms is annotated once against the questions that
fill it:

```tsp
model HumanName {
  @Mapping.from(Mappings.Target.grantsGovXml, PersonName.firstName) firstName: string;
}

@Mapping.from(Mappings.Target.grantsGovXml, Forms.KeyContacts)
model Root {
  @Mapping.from(Mappings.Target.grantsGovXml, Forms.KeyContacts.contacts) contacts: Contact[];
}
```

`resolveMappingFrom` resolves those links into the same tree `resolveMapping` does, so an
emitter can read either. A target property with no `@Mapping.from` whose own properties are
filled is a wrapper element. The tree, keyed by the form's properties, cannot hold one, so it
is left out with a `mapping-from-wrapper` problem, which an emitter whose output cannot hold a
wrapper either reports.

## License

[MIT](./LICENSE.md). Copyright (c) 2026 Agile Six Applications, Inc.
