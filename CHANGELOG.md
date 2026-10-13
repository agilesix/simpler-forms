# Changelog

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
