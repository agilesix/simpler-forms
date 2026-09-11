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

## Layout

```
lib/            TypeSpec declarations — the decorator vocabulary
  main.tsp        the entry point a consumer imports
  meta.tsp        @Meta.*   — question, form, tag, role
  ui.tsp          @UI.*     — labels, sections, widgets, overrides
  validation.tsp  @Validation.*
  types.tsp       shared scalars and enums
src/            the library implementation
  public.ts       the API a target emitter reads — the only semver-governed surface
  decorators/     decorator entry points, one module per namespace
  model.ts        typed accessors over decorator state
  validate.ts     $onValidate — cross-cutting checks reported as diagnostics
  linter.ts       lint rules
  emitter.ts      $onEmit — writes the canonical artifacts
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

## License

Public domain, [CC0 1.0 Universal](./LICENSE.md).
