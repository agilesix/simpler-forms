# Contributing

## Develop

```bash
pnpm install
pnpm build      # required before anything else; see below
pnpm test
pnpm checks     # format, lint, types, tests
```

**Build before you type-check.** Each `lib/*.tsp` file imports `dist/src/index.js` to resolve
the `extern dec` declarations it makes, so the TypeSpec sources do not type-check until the
compiled JavaScript exists. This is why CI runs `pnpm build` ahead of `pnpm checks`, and why
a fresh clone reports unimplemented decorators until the first build.

Tests compile TypeSpec source strings with the compiler's `createTester`; see
[`test/README.md`](./test/README.md).

## Source layout

```
lib/            TypeSpec declarations: the decorator vocabulary
  main.tsp        the entry point a consumer imports
  meta.tsp        @Meta.*: question, form, tags, entities, role
  ui.tsp          @UI.*: layouts, labels, widgets, conditions
  validation.tsp  @Validation.*
  mapping.tsp     @Mapping.*: links to other representations of a response
  types.tsp       shared scalars and enums
src/            the library implementation
  public.ts       the API a target emitter reads; the only semver-governed surface
  decorators/     decorator entry points, one module per namespace
  model.ts        typed accessors over decorator state
  mapping.ts      resolveMapping: a form's links in one mapping, through what it composes
  mapping-from.ts resolveMappingFrom: the same tree, from links declared on the target
  forms.ts        which @Meta.form models are published, and with which layout
  layout.ts       resolves a @UI.layout's references, placements and conditions
  validate.ts     $onValidate: cross-cutting checks reported as diagnostics
  linter.ts       lint rules
  emitter.ts      $onEmit: writes the artifacts
  casing.ts       property-casing: renames properties in finished artifacts
  emitters/       one module per emitted artifact
  lib.ts          createTypeSpecLibrary: diagnostics, lint rules, emitter options
test/           vitest suites, driven by the compiler's createTester
```

## Design notes

**No consumer vocabulary.** Widgets, tags, entities and mapping targets are declared by the
consuming program, and a platform's own decorators, validation and artifacts belong in its own
TypeSpec library listed beside this one. Add neither a fixed list nor a plugin interface here.

**Diagnostics are live in the editor.** `$onValidate` runs in the standard compile pipeline
before the linter and is not gated by `noEmit`, and the language server routes through that
same pipeline. Prefer a validation check to an emitter-time error, so authors see it as they type.

**Diagnostic codes come from the alias.** The library name is passed to
`createTypeSpecLibrary` as both `name` and `alias`, and the alias prefixes every diagnostic
code and lint rule id. Moving the package into an npm scope later would leave every
`#suppress` in a consumer's specs working; only its import specifier and dependency entry
would change.

## Release

`main` is released by [release-please](https://github.com/googleapis/release-please). Merging a
conventional commit opens or updates a release pull request; merging that pull request tags the
release and publishes it to npm. Mark a breaking change with `!` and a `BREAKING CHANGE:`
footer, which `bump-minor-pre-major` turns into a minor bump while below 1.0.

Publication authenticates through npm trusted publishing, so this repository holds no npm
token. The workflow exchanges a GitHub OIDC token for a short-lived credential, and npm
attaches a provenance attestation to the version it accepts. The trusted publisher is
configured against `.github/workflows/release.yml` by path, so renaming or moving that file
stops publication until the publisher is updated to match.
