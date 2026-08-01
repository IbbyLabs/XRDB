# Changelog

All notable changes to XRDB are documented here.

## [3.47.0](https://github.com/IbbyLabs/XRDB/compare/v3.46.1...v3.47.0) (2026-08-01)


### Added

* **logging:** log the user agent on each request ([2049a87](https://github.com/IbbyLabs/XRDB/commit/2049a87fadbc854ac226dfc67279a35e2ad729e6))


### Fixed

* **logo:** never draw a logo over art that already has the title ([67034f0](https://github.com/IbbyLabs/XRDB/commit/67034f09b2a40986edc7074e8420902324ce1f01))
* **quality:** stop asking a stream addon that has stopped answering ([82f724b](https://github.com/IbbyLabs/XRDB/commit/82f724b9c4602512036fa075a22eb0954569f163))

## [3.46.1](https://github.com/IbbyLabs/XRDB/compare/v3.46.0...v3.46.1) (2026-08-01)


### Fixed

* **logo:** keep the scrim peak on the logo at a poster edge (BUG-175) ([8293fec](https://github.com/IbbyLabs/XRDB/commit/8293fec86de02852ef0973e4db633ab5ecc25e75))

## [3.46.0](https://github.com/IbbyLabs/XRDB/compare/v3.45.0...v3.46.0) (2026-08-01)


### Added

* **render:** cap size on the RPDB route and weight renders by size ([7aab652](https://github.com/IbbyLabs/XRDB/commit/7aab652aa0a6a9969a3017c2e5a59567bf790d84))

## [3.45.0](https://github.com/IbbyLabs/XRDB/compare/v3.44.0...v3.45.0) (2026-08-01)


### Added

* **cache:** remember a not-found render briefly ([2a3b4a0](https://github.com/IbbyLabs/XRDB/commit/2a3b4a00e3e149632eea9318e6f32dcfd62d4281))
* **logging:** log MDBList's sources and raw awards string at debug ([7d07543](https://github.com/IbbyLabs/XRDB/commit/7d07543685ffd694ead4f49d8a424cf3f4bd0b94))
* **logo:** add scrim size and strength controls (FR-132) ([782bb26](https://github.com/IbbyLabs/XRDB/commit/782bb26a67602e158b489a00619679b8d5c28a53))
* **ratings:** mark the scale on sources not scored out of ten ([34cc531](https://github.com/IbbyLabs/XRDB/commit/34cc5311226c8a438f77d0685fce7b0b69a2fe26))


### Fixed

* **artwork:** apply the vote and size floors to the alternative path ([a09a0aa](https://github.com/IbbyLabs/XRDB/commit/a09a0aa763fa889096be12b3ba3eec2da22c6260))
* **ratings:** shorten the cache term for an answer that lost sources ([f5eee27](https://github.com/IbbyLabs/XRDB/commit/f5eee274b3405bd16d1f5bf73e3cc87785696618))

## [3.44.0](https://github.com/IbbyLabs/XRDB/compare/v3.43.0...v3.44.0) (2026-07-31)


### Added

* **cache:** log the disk tier bounds at startup ([395adff](https://github.com/IbbyLabs/XRDB/commit/395adffe3908293263b6596e6e782f3507229353))


### Fixed

* **config:** document every environment variable the server reads ([22dd0d9](https://github.com/IbbyLabs/XRDB/commit/22dd0d966bbd1b3c0b88f80f287e6b3e3da4f00c))

## [3.43.0](https://github.com/IbbyLabs/XRDB/compare/v3.42.0...v3.43.0) (2026-07-31)


### Added

* **cache:** make the disk tier bounds configurable ([362c6f3](https://github.com/IbbyLabs/XRDB/commit/362c6f34f55315d890b4127a37f7ad3238963138))

## [3.42.0](https://github.com/IbbyLabs/XRDB/compare/v3.41.1...v3.42.0) (2026-07-31)


### Added

* **render:** shed queued renders instead of waiting without bound ([0b7467f](https://github.com/IbbyLabs/XRDB/commit/0b7467f93f499f92adbf6dfc5bec82248acaff99))


### Performance

* **render:** skip the resize when the source is already the output size ([340d5de](https://github.com/IbbyLabs/XRDB/commit/340d5de60dc7cc114301efa7c253e1a54f973635))

## [3.41.1](https://github.com/IbbyLabs/XRDB/compare/v3.41.0...v3.41.1) (2026-07-31)


### Performance

* **ratings:** drop only the source whose reading changed ([cd78591](https://github.com/IbbyLabs/XRDB/commit/cd785919b58530893cb8b6d6da83aa00d89b95fa))

## [3.41.0](https://github.com/IbbyLabs/XRDB/compare/v3.40.0...v3.41.0) (2026-07-31)


### Added

* **genre:** outline the icon on plain style, and a glow option (FR-131) ([2d1cb9f](https://github.com/IbbyLabs/XRDB/commit/2d1cb9f8db9e8bee16e8e4b9c61c178e4c7dc751))

## [3.40.0](https://github.com/IbbyLabs/XRDB/compare/v3.39.0...v3.40.0) (2026-07-31)


### Added

* **anime:** accept anidb ids ([2ee498b](https://github.com/IbbyLabs/XRDB/commit/2ee498b207fe3b01d2286f76000f2303b21b8cfb))

## [3.39.0](https://github.com/IbbyLabs/XRDB/compare/v3.38.0...v3.39.0) (2026-07-31)


### Added

* **badges:** genre pill style and tinted outlines (FR-129, FR-130) ([18e7d0a](https://github.com/IbbyLabs/XRDB/commit/18e7d0a638516bb18f3673590db787393c8e5494))

## [3.38.0](https://github.com/IbbyLabs/XRDB/compare/v3.37.2...v3.38.0) (2026-07-31)


### Added

* **rpdb:** answer the poster key check AIOStreams makes ([7c5591f](https://github.com/IbbyLabs/XRDB/commit/7c5591f79cf63e154e41d6b25852e397f8e94677))


### Fixed

* **mdblist:** stop re-paying the wrong-endpoint lookup on every render ([a287e85](https://github.com/IbbyLabs/XRDB/commit/a287e858c6f0c65eb0bd672ecb6956923e369f98))

## [3.37.2](https://github.com/IbbyLabs/XRDB/compare/v3.37.1...v3.37.2) (2026-07-31)


### Fixed

* **ratings:** keep the Metacritic user score MDBList sends ([16ab0d7](https://github.com/IbbyLabs/XRDB/commit/16ab0d7d36fb218bbd57e4613def4c482e63b42b))

## [3.37.1](https://github.com/IbbyLabs/XRDB/compare/v3.37.0...v3.37.1) (2026-07-31)


### Fixed

* **ratings:** discard cached scores read on the wrong scale ([b0a32f0](https://github.com/IbbyLabs/XRDB/commit/b0a32f08a32a84bd75a9ab3c143164ce979af98e))
* **ratings:** read the TMDB and Metacritic user scales MDBList sends ([4737163](https://github.com/IbbyLabs/XRDB/commit/47371639ddf36c00475cb00bc64e604bbfb5f208))

## [3.37.0](https://github.com/IbbyLabs/XRDB/compare/v3.36.2...v3.37.0) (2026-07-31)


### Added

* **configurator:** surface every render setting in the UI, with a guard ([b3910ae](https://github.com/IbbyLabs/XRDB/commit/b3910ae99081bae7a202a4ec2741dcce8bba2e7f))
* **profile:** revert a profile to its last saved settings (FR-56) ([f66957f](https://github.com/IbbyLabs/XRDB/commit/f66957fa5c6c7c9c4eb4a8334dd8d76e807c5311))


### Fixed

* **stinger:** keep the badge when artwork comes from another source ([5316105](https://github.com/IbbyLabs/XRDB/commit/5316105981d177ed64b6aefc7ebcaf9c450f35cd))

## [3.36.2](https://github.com/IbbyLabs/XRDB/compare/v3.36.1...v3.36.2) (2026-07-31)


### Fixed

* **configurator:** keep the preview in view when scrolling (FR-128) ([5113ae0](https://github.com/IbbyLabs/XRDB/commit/5113ae06c59af410e4627ec617ed3f856de72576))
* **genre:** make the glass badge translucent and allow the border off ([49b4af2](https://github.com/IbbyLabs/XRDB/commit/49b4af2633e78425a31612ffe39c76051ea82db6))

## [3.36.1](https://github.com/IbbyLabs/XRDB/compare/v3.36.0...v3.36.1) (2026-07-31)


### Fixed

* **badge:** scale the badge on wide-but-short surfaces like logos ([75141ae](https://github.com/IbbyLabs/XRDB/commit/75141ae923c36c2f78d78a7174e25cda41583795))
* **logo:** prefer English over an untrusted textless logo ([93521ee](https://github.com/IbbyLabs/XRDB/commit/93521ee4e441cd03698310cd91e0d3b9e1596dad))

## [3.36.0](https://github.com/IbbyLabs/XRDB/compare/v3.35.3...v3.36.0) (2026-07-31)


### Added

* **overlays:** size control for the age rating badge (FR-127) ([850316e](https://github.com/IbbyLabs/XRDB/commit/850316e45aa3adc3c433ccaf3be0df13d95a6a38))
* **overlays:** X/Y offsets for the rating ring and age badge (FR-127) ([e01a3b8](https://github.com/IbbyLabs/XRDB/commit/e01a3b885686ab49736d598bf3dd025a0f4ce2fc))


### Fixed

* **logo:** prefer English when the requested language has no logo ([24cc04b](https://github.com/IbbyLabs/XRDB/commit/24cc04b12826c1242361aae612e1e045b7523c0b))

## [3.35.3](https://github.com/IbbyLabs/XRDB/compare/v3.35.2...v3.35.3) (2026-07-31)


### Fixed

* **ratings:** bump cache shape so the awards parser fix takes effect ([4ec232b](https://github.com/IbbyLabs/XRDB/commit/4ec232bde56b7027ae306240d3809e365a750a92))

## [3.35.2](https://github.com/IbbyLabs/XRDB/compare/v3.35.1...v3.35.2) (2026-07-31)


### Fixed

* **badges:** let the rating badge scale grow badges on small surfaces ([42c147e](https://github.com/IbbyLabs/XRDB/commit/42c147e1719bc4b478aa5249f476d1e9367266dc))
* **badges:** scope the scale-aware cap to small surfaces ([11bc3ea](https://github.com/IbbyLabs/XRDB/commit/11bc3ea71cb89addb83b58a504e6aad67b300a0b))
* **overlays:** keep the rating ring in-frame, restore logo fallback ([bb8366c](https://github.com/IbbyLabs/XRDB/commit/bb8366cc012057fd2251588dd703b2f376a5f409))

## [3.35.1](https://github.com/IbbyLabs/XRDB/compare/v3.35.0...v3.35.1) (2026-07-31)


### Fixed

* **awards:** tie the Oscar/Emmy win to the specific award ([e105be1](https://github.com/IbbyLabs/XRDB/commit/e105be1a7eb63b15e66631b760269979a43af59e))

## [3.35.0](https://github.com/IbbyLabs/XRDB/compare/v3.34.1...v3.35.0) (2026-07-31)


### Added

* **artwork:** add MediUX as a curated artwork source (FR-95) ([73383d2](https://github.com/IbbyLabs/XRDB/commit/73383d249694c90a5619bab4d77e15bb86a2164e))

## [3.34.1](https://github.com/IbbyLabs/XRDB/compare/v3.34.0...v3.34.1) (2026-07-31)


### Fixed

* **ratings:** version the ratings cache by MediaMeta shape ([aa25ef5](https://github.com/IbbyLabs/XRDB/commit/aa25ef558676402565316b31b8d3d63653c70a78))

## [3.34.0](https://github.com/IbbyLabs/XRDB/compare/v3.33.1...v3.34.0) (2026-07-31)


### Added

* **badges:** add a mid/post-credits stinger badge (FR-100) ([be0b2a8](https://github.com/IbbyLabs/XRDB/commit/be0b2a80073701bccbb17a57e1def4e1194c4022))

## [3.33.1](https://github.com/IbbyLabs/XRDB/compare/v3.33.0...v3.33.1) (2026-07-31)


### Fixed

* **awards:** read the win/nominate verdict from the leading clause only ([5891b23](https://github.com/IbbyLabs/XRDB/commit/5891b23803d9c876c7aa2d525aa1db8b6cd6b526))

## [3.33.0](https://github.com/IbbyLabs/XRDB/compare/v3.32.0...v3.33.0) (2026-07-31)


### Added

* **stremio:** option to strip Cinemeta's IMDb rating (FR-82) ([2622739](https://github.com/IbbyLabs/XRDB/commit/262273944923cc97d735aa9a2a62cc039ac076b9))

## [3.32.0](https://github.com/IbbyLabs/XRDB/compare/v3.31.0...v3.32.0) (2026-07-31)


### Added

* **badges:** add an Oscar/Emmy awards badge (FR-90) ([c3c41e0](https://github.com/IbbyLabs/XRDB/commit/c3c41e0e4c01762f7c075946b7be0609b386a504))

## [3.31.0](https://github.com/IbbyLabs/XRDB/compare/v3.30.1...v3.31.0) (2026-07-31)


### Added

* **templates:** add Cinematic and Library presets (FR-84, FR-33) ([380cf8d](https://github.com/IbbyLabs/XRDB/commit/380cf8df76fe6be131d6f4e8f2c2177c8fa46566))

## [3.30.1](https://github.com/IbbyLabs/XRDB/compare/v3.30.0...v3.30.1) (2026-07-31)


### Fixed

* **ratings:** don't let an owner key's success clear the shared cooldown ([30d9baf](https://github.com/IbbyLabs/XRDB/commit/30d9baf1bfd5742b3008f1a8ebacaa1657253a4b))

## [3.30.0](https://github.com/IbbyLabs/XRDB/compare/v3.29.4...v3.30.0) (2026-07-30)


### Added

* **observability:** log when a ratings source is rate-limited ([df086f8](https://github.com/IbbyLabs/XRDB/commit/df086f8b151323986a55e5fc706a8521af892051))

## [3.29.4](https://github.com/IbbyLabs/XRDB/compare/v3.29.3...v3.29.4) (2026-07-30)


### Fixed

* **preview:** apply a profile's provider keys, refresh on a key change ([c71818f](https://github.com/IbbyLabs/XRDB/commit/c71818f49371bb7afad51e8a08152e15ba52aad9))

## [3.29.3](https://github.com/IbbyLabs/XRDB/compare/v3.29.2...v3.29.3) (2026-07-30)


### Fixed

* **health:** stop counting non-anime titles as source failures ([7989a8c](https://github.com/IbbyLabs/XRDB/commit/7989a8c1262dc9651740919f9fed7635309013b8))
* **ratings:** don't let an owner key's failure set the shared cooldown ([e1f8f26](https://github.com/IbbyLabs/XRDB/commit/e1f8f26ea902f92197f140360d7c559595effa4c))
* **ratings:** let an owner key bypass the shared key's cooldown ([151d4c9](https://github.com/IbbyLabs/XRDB/commit/151d4c9268b82486162fbbb66d060f79f4afefc2))

## [3.29.2](https://github.com/IbbyLabs/XRDB/compare/v3.29.1...v3.29.2) (2026-07-30)


### Fixed

* **ratings:** keep remembered ratings across restarts ([863a616](https://github.com/IbbyLabs/XRDB/commit/863a616895ec896a3836eecdb9212cb0f5ee818f))
* **ratings:** write the ratings snapshot before the process exits ([b410859](https://github.com/IbbyLabs/XRDB/commit/b410859faf3115014c6e3dce071f5298ddb1313b))

## [3.29.1](https://github.com/IbbyLabs/XRDB/compare/v3.29.0...v3.29.1) (2026-07-30)


### Fixed

* **ratings:** resolve the title kind when the request omits type ([25c97bc](https://github.com/IbbyLabs/XRDB/commit/25c97bc6c244282ff30218df9c9021c05a611b3a))

## [3.29.0](https://github.com/IbbyLabs/XRDB/compare/v3.28.0...v3.29.0) (2026-07-30)


### Added

* **cache:** warm an addon's catalogues on a schedule (FR-114) ([e3d15a2](https://github.com/IbbyLabs/XRDB/commit/e3d15a2701e8651ba75ff21ecb124dde838b49fa))

## [3.28.0](https://github.com/IbbyLabs/XRDB/compare/v3.27.0...v3.28.0) (2026-07-30)


### Added

* **artwork:** allow Kitsu as an artwork source for anime (FR-63) ([e819ded](https://github.com/IbbyLabs/XRDB/commit/e819ded2c8cc6b1ee4083d3c25e0e9020089c492))

## [3.27.0](https://github.com/IbbyLabs/XRDB/compare/v3.26.0...v3.27.0) (2026-07-30)


### Added

* **configurator:** save an open profile as it is edited (FR-71) ([4a0ec50](https://github.com/IbbyLabs/XRDB/commit/4a0ec5030021806a99163e9e34997466fb5a8f1f))

## [3.26.0](https://github.com/IbbyLabs/XRDB/compare/v3.25.0...v3.26.0) (2026-07-30)


### Added

* **ratings:** take the Common Sense age rating from MDBList (FR-107) ([70c9683](https://github.com/IbbyLabs/XRDB/commit/70c9683687269da30511fe6e2207585d829f39b2))

## [3.25.0](https://github.com/IbbyLabs/XRDB/compare/v3.24.0...v3.25.0) (2026-07-30)


### Added

* **artwork:** pick the art provider per kind of title (FR-18) ([db28c59](https://github.com/IbbyLabs/XRDB/commit/db28c5913de4279858a7b84f668349aab7b9fe87))

## [3.24.0](https://github.com/IbbyLabs/XRDB/compare/v3.23.0...v3.24.0) (2026-07-30)


### Added

* **ratings:** anchor the badge row to its edge (FR-99) ([84a6f08](https://github.com/IbbyLabs/XRDB/commit/84a6f0826f3ef8b8ccb5c6c969e1d1bbe4fd4404))


### Fixed

* **ratings:** resolve the anime kind when an anime override is set ([60c18d2](https://github.com/IbbyLabs/XRDB/commit/60c18d2b3c186b457229c72bbd9be46b471544cd))

## [3.23.0](https://github.com/IbbyLabs/XRDB/compare/v3.22.0...v3.23.0) (2026-07-30)


### Added

* **ratings:** glyph marks on the aggregate pills (FR-7, FR-89) ([fb56895](https://github.com/IbbyLabs/XRDB/commit/fb56895f2895cdd7f5ece7fda270af50f025b71d))

## [3.22.0](https://github.com/IbbyLabs/XRDB/compare/v3.21.0...v3.22.0) (2026-07-30)


### Added

* **overlays:** add an info line with age rating, year and genre ([9d4c62f](https://github.com/IbbyLabs/XRDB/commit/9d4c62f00d9f9d3a9064a64e017ceaf278266915))
* **ratings:** allow rating sources per kind of title ([5207312](https://github.com/IbbyLabs/XRDB/commit/5207312e42eccb4a949969e5835ab5a0aa44458b))


### Fixed

* **overlays:** stack the info line above the rating strip ([d0a4b86](https://github.com/IbbyLabs/XRDB/commit/d0a4b863749a99d8cf179d605e969358547ed1c0))
* **ratings:** fetch every source a per-type override may name ([7a52777](https://github.com/IbbyLabs/XRDB/commit/7a52777bb3f2ec557ee6014701bfc5bbd81ad94a))
* **ratings:** key a render by the title kind for per-type overrides ([38370d2](https://github.com/IbbyLabs/XRDB/commit/38370d256ac88315b1e8233b153ea76a814550d5))

## [3.21.0](https://github.com/IbbyLabs/XRDB/compare/v3.20.0...v3.21.0) (2026-07-30)


### Added

* **badges:** raise the provider and quality scale ceiling to 400 ([7d9b5ff](https://github.com/IbbyLabs/XRDB/commit/7d9b5fff20c2038941a0a9b224e5e759f602af29))
* **ratings:** make the score pill accent outline width configurable ([6763295](https://github.com/IbbyLabs/XRDB/commit/67632953e479039b0019237512961c02e676d782))

## [3.20.0](https://github.com/IbbyLabs/XRDB/compare/v3.19.0...v3.20.0) (2026-07-30)


### Added

* **artwork:** add a fallback artwork language (FR-120) ([9ce23a6](https://github.com/IbbyLabs/XRDB/commit/9ce23a6e7e1aa616a541e1c875ede8c3d09ab893))


### Fixed

* **anime:** accept a type token in front of an anime id ([6871f9a](https://github.com/IbbyLabs/XRDB/commit/6871f9aebd1c177664a1130cce8ae69012b0b6d6))
* **anime:** strip the type token before the episode tail split ([261e594](https://github.com/IbbyLabs/XRDB/commit/261e594354e5255a0f84dd4cff2af5d3cab63136))
* **artwork:** accept the scheme and type token in either order ([cde12d6](https://github.com/IbbyLabs/XRDB/commit/cde12d68555e87fcb96b03414ebb875c993c3c35))

## [3.19.0](https://github.com/IbbyLabs/XRDB/compare/v3.18.1...v3.19.0) (2026-07-30)


### Added

* **ratings:** expose badge density and capsule outline ([156b8e4](https://github.com/IbbyLabs/XRDB/commit/156b8e45f650c96b36145738ae47b341af571370))


### Fixed

* **artwork:** resolve a token-prefixed IMDb id as an IMDb id ([575e711](https://github.com/IbbyLabs/XRDB/commit/575e711d1e026427ac052ee2c0c93dcff12e6268))
* **stremio:** emit a semver manifest version (BUG-173) ([1db5d3b](https://github.com/IbbyLabs/XRDB/commit/1db5d3b8afec4548b24a49aae716385e97bdf858))

## [3.18.1](https://github.com/IbbyLabs/XRDB/compare/v3.18.0...v3.18.1) (2026-07-30)


### Fixed

* **configurator:** keep the content type when IMDb lookup finds nothing ([59c446c](https://github.com/IbbyLabs/XRDB/commit/59c446ce9a0fda99e41987e3e89f8215cb15c384))

## [3.18.0](https://github.com/IbbyLabs/XRDB/compare/v3.17.2...v3.18.0) (2026-07-30)


### Added

* **ratings:** add ringScale to resize the rating ring (BUG-164) ([5b89f8a](https://github.com/IbbyLabs/XRDB/commit/5b89f8aecf8a5b666f3c783751caa8cb27daa2ed))
* **ratings:** outline provider logos so they read on any art (BUG-155) ([850c5e3](https://github.com/IbbyLabs/XRDB/commit/850c5e33096ad1ba5d7cdff9a3f54e832f2c999c))


### Fixed

* **artwork:** match images on the base language subtag (BUG-163) ([2d32568](https://github.com/IbbyLabs/XRDB/commit/2d3256844f2d93a95ae637a86fa8e766da3b1f7e))
* **cache:** key ratings and badges by configured order (BUG-167) ([0cd20f5](https://github.com/IbbyLabs/XRDB/commit/0cd20f57db274630aef0ea06ea76720872934908))
* **configurator:** escape the logo outline hint ([a39084d](https://github.com/IbbyLabs/XRDB/commit/a39084d25a29020ac55c50f2b23cfc65afd1f2d5))


### Documentation

* **context:** record rating order, badge caps and language tags ([a1be3fa](https://github.com/IbbyLabs/XRDB/commit/a1be3fa59ffaa6f30d194e42ff5dd4c4f2112bbb))

## [3.17.2](https://github.com/IbbyLabs/XRDB/compare/v3.17.1...v3.17.2) (2026-07-30)


### Fixed

* **artwork:** match the logo language on English originals (BUG-172) ([908846a](https://github.com/IbbyLabs/XRDB/commit/908846abd6239483c681c4a7313ad1bc0c563357))

## [3.17.1](https://github.com/IbbyLabs/XRDB/compare/v3.17.0...v3.17.1) (2026-07-30)


### Fixed

* **artwork:** stop drawing the logo over art that has a title (BUG-171) ([776e91f](https://github.com/IbbyLabs/XRDB/commit/776e91fb5fc5d32df398b7e8f571c2087dd9c92a))
* **logging:** embed tzdata so timestamps use the configured zone ([bdb6a5b](https://github.com/IbbyLabs/XRDB/commit/bdb6a5b43fdc07fe0397be39a1370ccc85b25ff8))

## [3.17.0](https://github.com/IbbyLabs/XRDB/compare/v3.16.1...v3.17.0) (2026-07-30)


### Added

* **logo:** size and place the title logo overlay (FR-126) ([598a680](https://github.com/IbbyLabs/XRDB/commit/598a680193fec8dc5e0e0c54589479b237df2cb3))

## [3.16.1](https://github.com/IbbyLabs/XRDB/compare/v3.16.0...v3.16.1) (2026-07-30)


### Fixed

* **ui:** keep the pill controls when the badge strip is hidden ([a892305](https://github.com/IbbyLabs/XRDB/commit/a892305611f26c1425a09b2b94d2e7ec5c234fea))
* **ui:** name the real cause when search or shuffle fails ([60071a2](https://github.com/IbbyLabs/XRDB/commit/60071a26a62a57d840890b1ff1e44be0f6daf203))
* **ui:** reach the score colour controls without the aggregate bar ([904ba25](https://github.com/IbbyLabs/XRDB/commit/904ba25fd1993e98ff0cc397e36328a367f36598))


### Documentation

* **compose:** correct the minimal pill accent comment ([6717ddc](https://github.com/IbbyLabs/XRDB/commit/6717ddca357c8787c77d0895fa7b7a64af1f5b44))
* **context:** say where the pill controls live ([a62ae38](https://github.com/IbbyLabs/XRDB/commit/a62ae38570b51497f87faedeab748271b484a22c))

## [3.16.0](https://github.com/IbbyLabs/XRDB/compare/v3.15.1...v3.16.0) (2026-07-29)


### Added

* **providers:** size and place the where to watch chips ([6fcd788](https://github.com/IbbyLabs/XRDB/commit/6fcd788f7bc1f94212538bf406c655b7b9f4cb2e))


### Fixed

* **cache:** key the render cache on the provider chip controls ([ccbd5c1](https://github.com/IbbyLabs/XRDB/commit/ccbd5c1c8ccf1fbdf93d830a4a343c9a294aa64b))

## [3.15.1](https://github.com/IbbyLabs/XRDB/compare/v3.15.0...v3.15.1) (2026-07-29)


### Fixed

* **ratings:** trace the pill outline instead of its bounding box ([54d2a2d](https://github.com/IbbyLabs/XRDB/commit/54d2a2df619b22fbbca77fb0e5b920225ef10507))

## [3.15.0](https://github.com/IbbyLabs/XRDB/compare/v3.14.0...v3.15.0) (2026-07-29)


### Added

* **ratings:** outline a label-less score pill in its accent colour ([abd3928](https://github.com/IbbyLabs/XRDB/commit/abd3928771c8d68c337781bf085338d65f3485d6))

## [3.14.0](https://github.com/IbbyLabs/XRDB/compare/v3.13.0...v3.14.0) (2026-07-29)


### Added

* **ratings:** let the score pills take scale, offsets and a position ([f252599](https://github.com/IbbyLabs/XRDB/commit/f252599d001708cd9d27c2e09c2724e0d32138f2))


### Fixed

* **trending:** match a trending title requested by its IMDb id ([c6b31d2](https://github.com/IbbyLabs/XRDB/commit/c6b31d218804a665aabbe8f69142e49ad9b6d203))


### Documentation

* **context:** cover pill fine tuning and trending by tt id ([8948578](https://github.com/IbbyLabs/XRDB/commit/894857816dcc0a74b9787029cd2791dca2fa373c))

## [3.13.0](https://github.com/IbbyLabs/XRDB/compare/v3.12.0...v3.13.0) (2026-07-28)


### Added

* **quality:** always check a quality badge against what the title has ([876dd27](https://github.com/IbbyLabs/XRDB/commit/876dd27aab0d14d7f4488bd3bb92bd6b188f8039))

## [3.12.0](https://github.com/IbbyLabs/XRDB/compare/v3.11.0...v3.12.0) (2026-07-28)


### Added

* **context:** publish a product summary the community bot reads ([ebe0971](https://github.com/IbbyLabs/XRDB/commit/ebe0971f11bbffee13eab536a73d362f883d70d8))


### Fixed

* **context:** stamp a release tag and stop rewriting the timestamp ([a1d7eea](https://github.com/IbbyLabs/XRDB/commit/a1d7eeaf9aa572b7dc98152e0a6157a65c13ddc3))


### Performance

* **quality:** ask the stream addon alongside the artwork fetch ([c38113b](https://github.com/IbbyLabs/XRDB/commit/c38113b0c2938d7a30e256f01cae481d33033978))

## [3.11.0](https://github.com/IbbyLabs/XRDB/compare/v3.10.1...v3.11.0) (2026-07-28)


### Added

* **quality:** draw quality badges only for releases that exist ([0138b68](https://github.com/IbbyLabs/XRDB/commit/0138b68290ccaaef9643781fe5b4c0144bc55fc0))


### Fixed

* **migrate:** v2 streamBadges is the quality check, not streaming chips ([175e6ea](https://github.com/IbbyLabs/XRDB/commit/175e6ead6417abb80a9ac042ac0eb92ea059b9f5))
* **quality:** read the stream description when detecting qualities ([5df51e9](https://github.com/IbbyLabs/XRDB/commit/5df51e954f3e78bf6d1df47c74f63f3ef7c1cf5b))


### Documentation

* **configurator:** say quality badges are not detected from the title ([008d09c](https://github.com/IbbyLabs/XRDB/commit/008d09c27516c0f51c51671bd6cec4521375ea5c))

## [3.10.1](https://github.com/IbbyLabs/XRDB/compare/v3.10.0...v3.10.1) (2026-07-27)


### Fixed

* **tmdb:** resolve a duplicate IMDb id to the right record ([5d4f392](https://github.com/IbbyLabs/XRDB/commit/5d4f392f9c86ac4c0a355c3c2233d2db24709102))

## [3.10.0](https://github.com/IbbyLabs/XRDB/compare/v3.9.1...v3.10.0) (2026-07-27)


### Added

* **artwork:** add an original-language option and missing codes ([9632b2a](https://github.com/IbbyLabs/XRDB/commit/9632b2a98590e23cf8cac267589b3bb58dd6f8b2))


### Fixed

* **cache:** cap the TTL of a render missing a rating badge ([7e7d7ae](https://github.com/IbbyLabs/XRDB/commit/7e7d7ae2c54e14873cc403a49fb9dbce8763ec54))
* **cache:** only a throttled source shortens a render's TTL ([a861ed0](https://github.com/IbbyLabs/XRDB/commit/a861ed0967b369c8498a825ae00bd8c5910c9444))

## [3.9.1](https://github.com/IbbyLabs/XRDB/compare/v3.9.0...v3.9.1) (2026-07-27)


### Fixed

* **provider:** stop Fanart serving a movie record for a series (BUG-168) ([17e9e6b](https://github.com/IbbyLabs/XRDB/commit/17e9e6b233aec2331fff0b939f094edade3fef24))
* **provider:** verify Fanart records by TMDB id, not title (BUG-168) ([773cf2b](https://github.com/IbbyLabs/XRDB/commit/773cf2bfe0cab6060529645dca1b3363bb1b88db))

## [3.9.0](https://github.com/IbbyLabs/XRDB/compare/v3.8.3...v3.9.0) (2026-07-27)


### Added

* **compose:** draw the genre badge the way v2 did ([be7f3c2](https://github.com/IbbyLabs/XRDB/commit/be7f3c242f1e2e7e486d325cd45bd9b85b0b092c))

## [3.8.3](https://github.com/IbbyLabs/XRDB/compare/v3.8.2...v3.8.3) (2026-07-27)


### Performance

* **compose:** cache each source's ratings per title ([01d1195](https://github.com/IbbyLabs/XRDB/commit/01d11952ec32f44b5a2d34b151a55b4d48c56d9a))
* **provider:** stop retrying a source that has spent its quota ([c854bc2](https://github.com/IbbyLabs/XRDB/commit/c854bc2c38b3c849cc684ac5c176f5a9d9284ddb))
* **simkl:** resolve a title's SIMKL id once ([b8504f5](https://github.com/IbbyLabs/XRDB/commit/b8504f5749dd7632187d2cd3867c0e67067d55b7))

## [3.8.2](https://github.com/IbbyLabs/XRDB/compare/v3.8.1...v3.8.2) (2026-07-27)


### Performance

* **provider:** stop a rate-limited source from holding up a render ([2520073](https://github.com/IbbyLabs/XRDB/commit/25200736e5dae02ee8c22efbc9568326f2039976))

## [3.8.1](https://github.com/IbbyLabs/XRDB/compare/v3.8.0...v3.8.1) (2026-07-26)


### Fixed

* **provider:** keep credentials out of transport error logs ([5e43f0d](https://github.com/IbbyLabs/XRDB/commit/5e43f0d4446971a759dc8cc8ffc556ff1ffef3f3))


### Performance

* **compose:** only fetch the rating sources a render asked for ([425fcd3](https://github.com/IbbyLabs/XRDB/commit/425fcd3c0e59473143e91453fe37ccc1f1186f42))

## [3.8.0](https://github.com/IbbyLabs/XRDB/compare/v3.7.4...v3.8.0) (2026-07-26)


### Added

* **compose:** add a switch to hide every quality badge ([6a15b4f](https://github.com/IbbyLabs/XRDB/commit/6a15b4fbcc926f8c224c192ac71d1eb301241b39))

## [3.7.4](https://github.com/IbbyLabs/XRDB/compare/v3.7.3...v3.7.4) (2026-07-26)


### Fixed

* **web:** fold badge token aliases when loading a config ([820d83e](https://github.com/IbbyLabs/XRDB/commit/820d83e74599b606d17acc8b80fa39e523eaf5ab))
* **web:** mask the render key in the install URL patterns ([9c6480c](https://github.com/IbbyLabs/XRDB/commit/9c6480cf5b285db432734471835d82d39e1dc8fb))

## [3.7.3](https://github.com/IbbyLabs/XRDB/compare/v3.7.2...v3.7.3) (2026-07-26)


### Fixed

* **web:** build install URLs from the item id, not the IMDb id ([7642298](https://github.com/IbbyLabs/XRDB/commit/76422988aa552b3df5cd6813868619b373845974))

## [3.7.2](https://github.com/IbbyLabs/XRDB/compare/v3.7.1...v3.7.2) (2026-07-26)


### Fixed

* **config:** treat a zero badge cap as no cap ([4af534f](https://github.com/IbbyLabs/XRDB/commit/4af534f986fa8da62780ef7e1f094e06ec33f187))

## [3.7.1](https://github.com/IbbyLabs/XRDB/compare/v3.7.0...v3.7.1) (2026-07-26)


### Fixed

* **compose:** draw a plate behind shaped rating icons ([b34a70a](https://github.com/IbbyLabs/XRDB/commit/b34a70a42522ec909f078f0506b8a8a453c97756))
* **web:** offer every quality badge the renderer draws ([0bcad4f](https://github.com/IbbyLabs/XRDB/commit/0bcad4f5aed2475abda046fef7bb6664145cfbc1))

## [3.7.0](https://github.com/IbbyLabs/XRDB/compare/v3.6.0...v3.7.0) (2026-07-26)


### Added

* **compose:** accept MAL, AniList and Kitsu ids ([855cde2](https://github.com/IbbyLabs/XRDB/commit/855cde2c0ed47f1a2c19a22b0c2f4fb074d73be1))

## [3.6.0](https://github.com/IbbyLabs/XRDB/compare/v3.5.4...v3.6.0) (2026-07-26)


### Added

* **compose:** colour the aggregate rating pill by its score ([d5b8b25](https://github.com/IbbyLabs/XRDB/commit/d5b8b255375194b1b3dd76d34d7b09a74e962b3d))


### Fixed

* **compose:** give the square and clean genre styles their own look ([2eba985](https://github.com/IbbyLabs/XRDB/commit/2eba9852c9853d37517332e61cb9c5c609bf52ee))
* **config:** fall back to the poster surface, not stock defaults ([1bed50c](https://github.com/IbbyLabs/XRDB/commit/1bed50c0f0c340b6d2398883d4cba526ea67ccb1))
* **migrate:** map v2's glass rating style onto pill ([1494b73](https://github.com/IbbyLabs/XRDB/commit/1494b73920d759d0305b7e9e8464bf8a3162cb9c))
* **web:** name the right surfaces in the scope notice ([92764fe](https://github.com/IbbyLabs/XRDB/commit/92764fe26637ac1dce458cf78c3961e39a1c96b7))
* **web:** preview thumbnails as an episode ([58d3817](https://github.com/IbbyLabs/XRDB/commit/58d38176fa2184e5718a5c60120efe4f6f565b4f)), closes [#65](https://github.com/IbbyLabs/XRDB/issues/65)

## [3.5.4](https://github.com/IbbyLabs/XRDB/compare/v3.5.3...v3.5.4) (2026-07-26)


### Fixed

* **compose:** draw the trending badge only for trending titles ([7f2ae1a](https://github.com/IbbyLabs/XRDB/commit/7f2ae1a28802490f66f58a7d421951223cc02fbb))

## [3.5.3](https://github.com/IbbyLabs/XRDB/compare/v3.5.2...v3.5.3) (2026-07-26)


### Fixed

* **config:** read the v2 credential names as a fallback ([f97cdf7](https://github.com/IbbyLabs/XRDB/commit/f97cdf7d5d58c00a445e3ec3d095e545273688a9))

## [3.5.2](https://github.com/IbbyLabs/XRDB/compare/v3.5.1...v3.5.2) (2026-07-25)


### Fixed

* **compose:** resolve non-IMDb ids before asking rating sources ([22f548c](https://github.com/IbbyLabs/XRDB/commit/22f548ca496b76ae48601ce71246f8895bc805ba))
* **server:** surface AIOMetadata credential errors ([c37e755](https://github.com/IbbyLabs/XRDB/commit/c37e7554d5af25b36d69efceb4f8a5ec8e2db4fb))

## [3.5.1](https://github.com/IbbyLabs/XRDB/compare/v3.5.0...v3.5.1) (2026-07-25)


### Fixed

* **compose:** size corner overlays to the canvas ([7d3432e](https://github.com/IbbyLabs/XRDB/commit/7d3432ed3ee3dd9a5177598d4627a3357f63d0c3))
* **web:** make the SIMKL source logo visible on the dark panel ([4608369](https://github.com/IbbyLabs/XRDB/commit/4608369d852d5a317162d585b1cdc980731ee610))

## [3.5.0](https://github.com/IbbyLabs/XRDB/compare/v3.4.0...v3.5.0) (2026-07-25)


### Added

* **compose:** order ratings and size badges to the canvas ([6a0928b](https://github.com/IbbyLabs/XRDB/commit/6a0928b60b8489e324714aee170ff1623b9eeb31))


### Fixed

* **build:** restore the internal/ui/dist placeholder ([5642e76](https://github.com/IbbyLabs/XRDB/commit/5642e76882473ae9de9b296ab0f8163aaf825e45))
* **web:** name the configured quality-badge position in the hint ([612a399](https://github.com/IbbyLabs/XRDB/commit/612a399415b9d25fdb23cfbe1d6276065677f87b))

## [3.4.0](https://github.com/IbbyLabs/XRDB/compare/v3.3.1...v3.4.0) (2026-07-25)


### Added

* **render:** raise the badge scale ceiling and add two stacked toggles ([dce16e1](https://github.com/IbbyLabs/XRDB/commit/dce16e1defcffd2b4a7100b3103482a68c1d01ca)), closes [#8](https://github.com/IbbyLabs/XRDB/issues/8)
* **web:** make the keys page per-user and move server keys into admin ([84cfc48](https://github.com/IbbyLabs/XRDB/commit/84cfc48377eb9b77093695714d713aed0bd39565))


### Fixed

* **web:** point non-admins at their own profile API keys ([e01fd82](https://github.com/IbbyLabs/XRDB/commit/e01fd822ab11485f87663ea009b693b02c9264a5))

## [3.3.1](https://github.com/IbbyLabs/XRDB/compare/v3.3.0...v3.3.1) (2026-07-25)


### Fixed

* **config:** read a v2 badge list as tiles plus its features ([da77888](https://github.com/IbbyLabs/XRDB/commit/da778886262c9a6f78dc3dbe09c70255358e8e00))

## [3.3.0](https://github.com/IbbyLabs/XRDB/compare/v3.2.0...v3.3.0) (2026-07-25)


### Added

* **profile:** encrypt provider keys at rest and check them on save ([e9194a0](https://github.com/IbbyLabs/XRDB/commit/e9194a0e685735baa10cb6f4cd4f1700f4c9f808))
* **profile:** let an owner supply their own provider API keys ([128d8df](https://github.com/IbbyLabs/XRDB/commit/128d8df47ebf476e712b6161d89f055ca64d2e0e))
* **render:** add the no-background and tile rating badge styles ([082c017](https://github.com/IbbyLabs/XRDB/commit/082c0179694af8bab04e4c04a1af3de10050478b))
* **render:** add the stacked rating badge style ([b5afd47](https://github.com/IbbyLabs/XRDB/commit/b5afd47e748f66eda188d4971b08d36b0b28ce15))
* **render:** draw the left, right and top-bottom rating layouts ([92630d4](https://github.com/IbbyLabs/XRDB/commit/92630d45fe8c3f0e9c94559d773b2878feb1c71d))


### Fixed

* **config:** accept the badge placement spellings a v2 config uses ([236de0e](https://github.com/IbbyLabs/XRDB/commit/236de0e2fb2c992a991aae7d2c55db3aaa070f47))
* **config:** honour more v2 rating and badge settings ([2097c86](https://github.com/IbbyLabs/XRDB/commit/2097c8660ff4deac952b8e5223245fa3cd968e06))
* **config:** let an empty rating selection mean no rating badges ([d3764e1](https://github.com/IbbyLabs/XRDB/commit/d3764e199ef4f2dcf78603c1bb3ed1029feee863))
* **config:** map the remaining v2 enum spellings ([9d0d883](https://github.com/IbbyLabs/XRDB/commit/9d0d883540f6f06fcf08958cb1a778e0ffe08a99))
* **migrate:** carry an empty v2 list as an empty selection ([caf0fab](https://github.com/IbbyLabs/XRDB/commit/caf0fabf47d50d05de19ad6398f3bae9952f9291))
* **server:** accept v2-shaped artwork ids ([26efe14](https://github.com/IbbyLabs/XRDB/commit/26efe144b444dd83c705a9b567280a6e0211cc94))
* **server:** capitalize a refused-save message for display ([3dd7f80](https://github.com/IbbyLabs/XRDB/commit/3dd7f807fc7461f6f24ff429cc121a4784b20a87))
* **web:** mark quality badges a higher format already covers ([be96161](https://github.com/IbbyLabs/XRDB/commit/be9616121d0465b382b992e9975cecea33414431))

## [3.2.0](https://github.com/IbbyLabs/XRDB/compare/v3.1.0...v3.2.0) (2026-07-25)


### Added

* **web,server:** convert a v2 config from the configurator ([5624b2d](https://github.com/IbbyLabs/XRDB/commit/5624b2dd216e128e1a60c17097ae3789c951e205))


### Fixed

* **ci:** tag :latest during the release build ([3ba8948](https://github.com/IbbyLabs/XRDB/commit/3ba89484541d7530f5995c8382f2bf00d053dbb3))
* **migrate:** read v2 values that were stored as strings ([878f297](https://github.com/IbbyLabs/XRDB/commit/878f297c931a8cffe62dc0a224c80b42f4833485))

## [3.1.0](https://github.com/IbbyLabs/XRDB/compare/v3.0.0...v3.1.0) (2026-07-25)


### Changed

* Releases are now cut automatically from conventional commits, so the version
  and this changelog no longer need writing by hand ([5dd39c0](https://github.com/IbbyLabs/XRDB/commit/5dd39c0afaa5a673bc66e44089511c98c23b7f84))

## [Unreleased]

<a id="v3-0-0"></a>

## [v3.0.0] - 2026-07-25

v3 is a ground-up rewrite. It is a single Go binary with the configurator
embedded, replacing the v2 stack, and it listens on port **8787** rather than
3000. Profiles do not carry over automatically — see the
[migration guide](docs/migrating-to-v3.md).

### Breaking

- Artwork is served as **JPEG** by default instead of PNG, at a smaller default
  size. A poster is roughly 38 KB rather than 2 MB, which brings it inside
  Stremio's 100 KB limit and under its 50 KB recommendation. Logos stay PNG so
  transparency is preserved. The previous dimensions remain available as the
  `normal`, `large` and `4k` size tiers.
- The container listens on `8787` and stores data under `/data`.
- Forwarded headers (`X-Forwarded-*`, `CF-Connecting-IP`) are now only believed
  from a trusted proxy. The default covers loopback and the private ranges, so
  an ordinary reverse-proxy setup is unaffected; see `XRDB_TRUSTED_PROXIES`.


### Added

- Official rating-provider logos on badges, with pill/square/glass styles and dark/light badge themes
- Six switchable UI themes (Midnight, Violet, Emerald, Ember, Crimson, Slate)
- Title search, trending shuffle, and pinned preview items in the configurator
- Profile aliases (memorable lowercase handles), server-generated IDs, and password-protected editing
- One-click AIOMetadata install plus manual URL patterns (Install tab)
- Cinemeta artwork provider (no key required) and WebP source decoding
- Artwork language / text-preference selection (TMDB + Fanart) and large/4K output sizes
- Per-output-size badge scaling and multi-row badge wrapping
- Admin key gate for the Admin and Integrations pages
- Title search/trending/lookup and AIOMetadata install API endpoints; permissive CORS
- `make dev` one-command local stack; environment reference (`variables.md`), `env.template`, and v2→v3 migration guide
- Stremio addon that can be installed against a saved profile
  (`/stremio/c/{profile}/manifest.json`), with the install URL shown in the
  configurator
- RPDB-compatible artwork URLs, so moving from RPDB is a hostname swap
- Folder-writer mode: writes `poster.jpg`, `fanart.jpg` and `clearlogo.png` next
  to your media for Plex, Jellyfin, Emby and Kodi. Off by default, with a dry
  run and an optional schedule
- Jellyfin image-provider plugin, offering artwork by URL with nothing written
  into the library
- Top-rated film ranking badge, computed locally from the IMDb dataset (opt-in)
- Vote counts alongside rating badges, where the source reports them
- Per-source health at `GET /api/admin/sources`, showing when a rating source is
  degraded and being served from cache
- Cache invalidation: `DELETE /api/admin/cache`, all entries or one
- `Cache-Control` and `ETag` on renders, with `If-None-Match` answered as 304
- A profile version token in artwork URLs, so editing a profile refreshes art in
  clients that cache images regardless of TTL
- Per-client setup guides, a contributing guide, and issue templates

### Fixed

- Anime ratings (MyAnimeList, AniList, Kitsu) never rendered: the pipeline
  passed IMDb/TMDB IDs straight to the anime providers, which only accept
  their own ID space. A new anime ID mapper translates IDs via a disk-cached
  [Fribb/anime-lists](https://github.com/Fribb/anime-lists) dataset with a
  live API fallback — replacing the v2 approach that depended on a single
  third-party mapping host (now offline with a DNS failure)
- Fanart.tv rejected IMDb tt-IDs (every configurator render) and misrouted movie backdrops
- Thumbnails now prefer backdrop artwork over center-cropped posters
- Overlay metadata (age/genre/providers) backfills from TMDB when the artwork source lacks it
- Hydration mismatch from storage reads during first render (React #418)
- Dev-mode builds no longer break on the Go-embed `distDir`
- Rate-limited rating sources are retried with backoff and paced per source,
  instead of silently disappearing from the badge row
- A rating source that breaks or returns nothing now falls back to its last
  known good result rather than dropping its badge

<a id="v3-0-0-beta"></a>

## [v3.0.0-beta] - 2026-06-09

### Added

- Pure-Go image render pipeline (poster, backdrop, thumbnail, logo families)
- SQLite-backed profile store with full CRUD, export, and import
- Two-tier render cache (hot + disk, 72h TTL) with admin visibility
- TMDB provider with mutex-safe concurrency
- Migration tool for importing profiles from previous XRDB installations
- REST API: render, profile management, admin metrics, cache stats
- Next.js 15 configurator with live preview, display config, and profile management
- Admin panel with request metrics, latency percentiles, and cache diagnostics
- Dark OKLCH design system, WCAG AA accessible throughout
- Docker Compose deployment with named volume for data persistence
- Multi-platform Docker images (amd64/arm64) published to GHCR
