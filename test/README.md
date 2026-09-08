# Tests

`pnpm test` runs only tests that are self-contained: they compile TypeSpec source
strings through `createTester` and assert on what this library produces. No test here
reads a file from disk or depends on any particular corpus of forms.

| File               | Lines | What it covers                                              |
| ------------------ | ----: | ----------------------------------------------------------- |
| `validate.test.ts` |   885 | Every `$onValidate` diagnostic                              |
| `linter.test.ts`   |   410 | Every lint rule, via `createLinterRuleTester`               |
| `tester.ts`        |    39 | Shared harness — `Tester`, `form()`, `bank()`, `formMeta()` |

## Tests that were not brought over, and why

Four files from the original suite are not here. They are intact in
`grants-form-spec/typespec-form-spec/test/` and none of their coverage has been lost —
it is coverage of things this package no longer contains.

**Tests of the SGG emitters.** `calculation-emitter.test.ts` (44 lines) imports
`rules-sgg.js`; `condition-emitter.test.ts` (928 lines) imports `ui-schema-sgg.js`.
Both belong wherever the SGG emitters land, which is the `forms/emitters/sgg/`
workspace in the Simpler Grants fork.

**Tests of the emitted corpus.** `contract.test.ts` (629 lines) and
`emitter.test.ts` (780 lines) resolve `packageRoot` as `../..` and read
`dist/question-bank` and `dist/forms` — the emitted output of the 43 specifications in
the parent repository. They validate real artifacts against the schemas in
`contract/v1`, which is valuable, but they are integration tests over a corpus rather
than tests of this library. They belong wherever the specifications live.

## Known gap to close

`condition-emitter.test.ts` is **mixed**, not purely SGG. Alongside its 12 `emitSggUi`
assertions it makes 7 against `emitBlockUi` and several against `emitFieldOccurrences`
and `emitSchemaOverlay`, all of which are in this package. The two are interleaved
within individual tests — one test asserts that `emitBlockUi` throws and, two lines
later, that `emitSggUi` throws — so the file cannot be divided by `describe` block and
needs per-test separation.

Until that is done, this package has **no direct test coverage of `block-ui.ts`,
`field-occurrences.ts`, or `overlay.ts`**. Those three are exercised indirectly through
`validate.test.ts`, but their emitted output is not asserted here.

One block is cleanly separable and worth taking first: `describe("field occurrence role
precedence")` at lines 642–690 touches only `emitFieldOccurrences`.
