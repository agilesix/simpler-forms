# Changelog

## [0.3.1](https://github.com/agilesix/simpler-forms/compare/v0.3.0...v0.3.1) (2026-11-24)


### Bug Fixes

* lay out a named list question as one control ([#42](https://github.com/agilesix/simpler-forms/issues/42)) ([1243982](https://github.com/agilesix/simpler-forms/commit/124398274a50e09a52bd4fd2497ebaee44713ac1))

## [0.3.0](https://github.com/agilesix/simpler-forms/compare/v0.2.0...v0.3.0) (2026-11-23)


### ⚠ BREAKING CHANGES

* the Validation calculation decorators and Op are removed.
    - @Validation.computed(Op.Sum, A.x, A.y) is @Formula.sum(A.x, A.y), and
      likewise subtract and percentOf.
    - @Validation.computedFrom(Op.Sum, "lines[*].x") is
      @Formula.sum([A.lines, Line.x]).
    - @Validation.totals(A.rows) is @Formula.sum(A.rows) on the block answer.
    - @Validation.evaluationOrder is gone: the order follows from what each
      formula reads.
    - @Validation.materializeWhenAnySourcePresent is gone.

### Features

* replace the calculation decorators with a Formula namespace ([#38](https://github.com/agilesix/simpler-forms/issues/38)) ([9007f7c](https://github.com/agilesix/simpler-forms/commit/9007f7c512905a346fd57c5b1cee5e1199591e48))

## [0.2.0](https://github.com/agilesix/simpler-forms/compare/v0.1.0...v0.2.0) (2026-11-19)


### Features

* **mapping:** add @Mapping.match ([#30](https://github.com/agilesix/simpler-forms/issues/30)) ([c85449e](https://github.com/agilesix/simpler-forms/commit/c85449efdda00a5911eae30abb7cb79cd3951755))
* **mapping:** add @Mapping.required ([#31](https://github.com/agilesix/simpler-forms/issues/31)) ([118c5e5](https://github.com/agilesix/simpler-forms/commit/118c5e5f4dc06c37687059192afa948bcaca9fdf))
* **mapping:** add @Mapping.transforms and @Mapping.transform ([#29](https://github.com/agilesix/simpler-forms/issues/29)) ([466effb](https://github.com/agilesix/simpler-forms/commit/466effbec0decbf26041f54329a0fa2225cd0230))
* **mapping:** add @Mapping.when with SimplerForms.Operator ([#32](https://github.com/agilesix/simpler-forms/issues/32)) ([fb72f13](https://github.com/agilesix/simpler-forms/commit/fb72f138228ffbbd6e68fc93e50e030eb2b29fed))
* **mapping:** select list items with Item and Slice in @Mapping.from ([#28](https://github.com/agilesix/simpler-forms/issues/28)) ([ba4af64](https://github.com/agilesix/simpler-forms/commit/ba4af64b6e33fdaeb377570b34d404fc392cecef))
* **meta:** allow @Meta.question on enums ([#33](https://github.com/agilesix/simpler-forms/issues/33)) ([33b8652](https://github.com/agilesix/simpler-forms/commit/33b8652338312083d008a01b87a6f989630d8be9))


### Bug Fixes

* **validation:** emit @Validation.requiredPaths on a list's items ([#26](https://github.com/agilesix/simpler-forms/issues/26)) ([1a7389b](https://github.com/agilesix/simpler-forms/commit/1a7389b3c5e968d21c0233fdbe486eb3df68d1fc))
* **validation:** write a local model's @Validation.requiredPaths once ([#27](https://github.com/agilesix/simpler-forms/issues/27)) ([4cbf757](https://github.com/agilesix/simpler-forms/commit/4cbf75725b05cdf6725aed54ac704957f7a5169e))


### Dependencies

* update dependencies with security fixes ([#25](https://github.com/agilesix/simpler-forms/issues/25)) ([a0d916a](https://github.com/agilesix/simpler-forms/commit/a0d916a6ef6ee887ccc2d4a342814cc2030c49e9))

## 0.1.0 (2026-10-13)


### ⚠ BREAKING CHANGES

* **meta:** SubmissionMeta no longer has legacyFormId, shortFormName, formVersion, agencyCode or ombNumber, and the manifest's submission entry no longer carries them. Declare them with a decorator from the consuming platform's library.
* **meta:** TagName and EntityName are removed. Declare them in the consuming program, e.g. @Meta.tags(TagName) @Meta.entities(EntityName) on a namespace holding the two enums.
* **ui:** @Meta.form no longer takes legacyFormId, shortFormName, formVersion, agencyCode or ombNumber; move them to @Meta.submission. Block.kind is "submission" instead of "form".
* **ui:** `WidgetName` is removed and `@UI.widget` no longer accepts its members. Declare the widgets your renderers provide with `@UI.widgets`.

### Features

* **emitter:** add property-casing option ([#9](https://github.com/agilesix/simpler-forms/issues/9)) ([38d281d](https://github.com/agilesix/simpler-forms/commit/38d281de7092a2cc5c2d9a6b9f45cf198afc7a3d))
* **lib:** export the API a target emitter reads ([2636a48](https://github.com/agilesix/simpler-forms/commit/2636a480e35362597e6ce639ae14a28dcc79d09f))
* **lib:** extract the portable library and fold four namespaces into Meta ([c3b50f3](https://github.com/agilesix/simpler-forms/commit/c3b50f38abda14ac6ec3876c6d9a528d1a69278f))
* **mapping:** add @Mapping.to and @Mapping.from ([#11](https://github.com/agilesix/simpler-forms/issues/11)) ([96f21c1](https://github.com/agilesix/simpler-forms/commit/96f21c179f8a711592774c32b94bedd40faf822f))
* **meta:** fold @Meta.submission into @Meta.form ([#15](https://github.com/agilesix/simpler-forms/issues/15)) ([7e949b9](https://github.com/agilesix/simpler-forms/commit/7e949b97acc76df641187f7a39ba511e5482831c))
* **meta:** let programs declare tags and entities ([#14](https://github.com/agilesix/simpler-forms/issues/14)) ([6c1b82e](https://github.com/agilesix/simpler-forms/commit/6c1b82ee903057ea54e9e66008fbd13ebb2d4f90))
* **ui:** add @UI.layout and @Meta.submission ([#12](https://github.com/agilesix/simpler-forms/issues/12)) ([81d553d](https://github.com/agilesix/simpler-forms/commit/81d553dd2a3778434b13cd5a3d771512779c6ff6))
* **ui:** adds conditional hidden and disable decorators ([#4](https://github.com/agilesix/simpler-forms/issues/4)) ([4797d10](https://github.com/agilesix/simpler-forms/commit/4797d10b1dead14596f816e7c89050a31a946141))
* **ui:** let programs declare their own widgets ([#10](https://github.com/agilesix/simpler-forms/issues/10)) ([87ed1bf](https://github.com/agilesix/simpler-forms/commit/87ed1bfc520c8e79064a74f7c4753344cdda21e2))


### Bug Fixes

* **emitter:** resolve a block's $id the way @typespec/json-schema does ([dd60187](https://github.com/agilesix/simpler-forms/commit/dd601873d495873a78345f4733c9eaf1b1b91e6c))
* unblock npm publication ([#2](https://github.com/agilesix/simpler-forms/issues/2)) ([ac7486c](https://github.com/agilesix/simpler-forms/commit/ac7486ca786993f41b84f2c61ea257ce3c607398))


### Documentation

* correct the package name and the layout ([1f24e40](https://github.com/agilesix/simpler-forms/commit/1f24e402f7cc9877d7c9f6597475dc8836078787))
* focus the README on using the library ([#18](https://github.com/agilesix/simpler-forms/issues/18)) ([87935cd](https://github.com/agilesix/simpler-forms/commit/87935cd45fb66b06ee2193c7a20d4275845ba0ab))
