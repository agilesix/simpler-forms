# form-spec

A [TypeSpec](https://typespec.io) library for specifying grant application forms once and
emitting portable form artifacts — a JSON Schema for the data, a UI schema for the layout,
and an index describing how the two relate.

The library holds no form content and no vocabulary specific to any consuming application.
Form definitions, a shared question bank, and target-specific emitters live in the
repositories that consume this package.

## Status

Pre-release. **The package name is not yet pinned** — `@common-grants/form-spec` in
`package.json` is a working placeholder while the choice between a `@common-grants` scope and
an unscoped name is settled.

This is worth pinning before the first publish rather than after. The name is passed to
`createTypeSpecLibrary`, which makes it the prefix of every diagnostic code and linter rule
id the library reports. Once a form specification anywhere contains a line like
`#suppress "@common-grants/form-spec/no-orphan-question"`, renaming the package is a
breaking change for every consumer. Accordingly, `release.yml` tags releases but does not
publish to npm.

## Install

```bash
pnpm add -D @common-grants/form-spec @typespec/compiler @typespec/json-schema
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

## Layout

```
lib/            TypeSpec declarations — the decorator vocabulary
src/            The library implementation
  decorators.ts   decorator entry points
  model.ts        typed accessors over decorator state
  validate.ts     $onValidate — cross-cutting checks reported as diagnostics
  linter.ts       lint rules
  emitter.ts      $onEmit — writes the canonical artifacts
  emitters/       one module per emitted artifact
contract/       JSON Schemas the emitted artifacts are validated against
test/           vitest suites, driven by the compiler's createTester
```

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
