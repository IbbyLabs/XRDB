# Changelog

All notable changes to XRDB are documented here.

## [3.60.5](https://github.com/IbbyLabs/XRDB/compare/v3.60.4...v3.60.5) (2026-08-03)


### Fixed

* **cache:** read the disk bounds under the lock (BUG-201) ([09fa760](https://github.com/IbbyLabs/XRDB/commit/09fa7601b92cc98098274800bc0b84120a651760))

## [3.60.4](https://github.com/IbbyLabs/XRDB/compare/v3.60.3...v3.60.4) (2026-08-03)


### Fixed

* **ratings:** SIMKL scores are already out of ten (BUG-209) ([4065c8a](https://github.com/IbbyLabs/XRDB/commit/4065c8a559e775458d89b597b3d5e55543e1246b))

## [3.60.3](https://github.com/IbbyLabs/XRDB/compare/v3.60.2...v3.60.3) (2026-08-03)


### Fixed

* **ratings:** skip the artwork provider that answered (BUG-208) ([d420638](https://github.com/IbbyLabs/XRDB/commit/d420638fb97e7ce140cee40bd168efbac2d3ddea))

## [3.60.2](https://github.com/IbbyLabs/XRDB/compare/v3.60.1...v3.60.2) (2026-08-03)


### Fixed

* **logging:** count owner-key governor skips and reword the drop warn ([6cdb7a7](https://github.com/IbbyLabs/XRDB/commit/6cdb7a76b057a5de96247c8e00ed3bc5e4c7b70c))
* **ratings:** decode SIMKL genres in either shape (BUG-207) ([60d9284](https://github.com/IbbyLabs/XRDB/commit/60d92842da906d9f42a08246bfdfe76bc68f5eba))

## [3.60.1](https://github.com/IbbyLabs/XRDB/compare/v3.60.0...v3.60.1) (2026-08-03)


### Fixed

* **ratings:** stop an owner key re-pacing the shared MDBList governor ([73c911a](https://github.com/IbbyLabs/XRDB/commit/73c911a7efa15a6309b2302321062481e35661b9))
* **render:** log degraded sources and never cache a degraded render ([fe02b9d](https://github.com/IbbyLabs/XRDB/commit/fe02b9de724bb6bba9274692e262276c088ce9f0))

## [3.60.0](https://github.com/IbbyLabs/XRDB/compare/v3.59.6...v3.60.0) (2026-08-03)


### Added

* **ratings:** score-dependent RT and Metacritic marks (FR-137) ([8aa1726](https://github.com/IbbyLabs/XRDB/commit/8aa1726bb4f21760f0ef74e7aa25c1cb738467ea))


### Fixed

* **configurator:** remove the Image URL field (BUG-205) ([092f572](https://github.com/IbbyLabs/XRDB/commit/092f572ba1f772c67026c5c007944e29acd56568))

## [3.59.6](https://github.com/IbbyLabs/XRDB/compare/v3.59.5...v3.59.6) (2026-08-03)


### Fixed

* **animemap:** merge partial id mappings across sources (BUG-206) ([0058c96](https://github.com/IbbyLabs/XRDB/commit/0058c96c88550915bd7248f02bcbf5c1d80dfe68))

## [3.59.5](https://github.com/IbbyLabs/XRDB/compare/v3.59.4...v3.59.5) (2026-08-03)


### Fixed

* **configurator:** copy the image URL as an absolute address (BUG-204) ([3e9c868](https://github.com/IbbyLabs/XRDB/commit/3e9c868be3966de770d042b5a9e74b860b516b7f))
* **configurator:** thumbnail preview fills its box (BUG-203) ([b58f75b](https://github.com/IbbyLabs/XRDB/commit/b58f75b2e77f49bd903e5a14cce317b50eb51470))

## [3.59.4](https://github.com/IbbyLabs/XRDB/compare/v3.59.3...v3.59.4) (2026-08-03)


### Fixed

* **genre:** trim measures the nudged row, not the anchor (BUG-197) ([5104ae1](https://github.com/IbbyLabs/XRDB/commit/5104ae19c633746aeab045287c073a31322d5b3c))

## [3.59.3](https://github.com/IbbyLabs/XRDB/compare/v3.59.2...v3.59.3) (2026-08-03)


### Fixed

* **render:** serialise access to shared font faces (BUG-200) ([e58661c](https://github.com/IbbyLabs/XRDB/commit/e58661c7bd36387d49663108ea98b398b60033dd))

## [3.59.2](https://github.com/IbbyLabs/XRDB/compare/v3.59.1...v3.59.2) (2026-08-03)


### Fixed

* **configurator:** source-tint hint points at Tile, not Glass (FR-155) ([e0e1671](https://github.com/IbbyLabs/XRDB/commit/e0e1671bca7a06358e2d01b746da0efb2a52ef1d))
* **ratings:** clamp the per-style badge Y offset to the canvas (BUG-199) ([cabb923](https://github.com/IbbyLabs/XRDB/commit/cabb92355ebb3beacd6d04dcbf83941ad1974387))

## [3.59.1](https://github.com/IbbyLabs/XRDB/compare/v3.59.0...v3.59.1) (2026-08-03)


### Fixed

* **genre:** render glass, square, pill, clean distinctly (BUG-194) ([50d241a](https://github.com/IbbyLabs/XRDB/commit/50d241a10f7dea31f7afb640ac7f15a6b1922894))

## [3.59.0](https://github.com/IbbyLabs/XRDB/compare/v3.58.0...v3.59.0) (2026-08-03)


### Added

* **ratings:** replace rating marks with branded logos (BUG-192) ([b92b479](https://github.com/IbbyLabs/XRDB/commit/b92b479ff871d2f82448cdc770c627baaa781280))


### Fixed

* **ratings:** leave Roger Ebert as-is for the draw-path work ([ab4d4a4](https://github.com/IbbyLabs/XRDB/commit/ab4d4a451829f27bdf2ebcbd0d9ef02591d8bd56))

## [3.58.0](https://github.com/IbbyLabs/XRDB/compare/v3.57.1...v3.58.0) (2026-08-02)


### Added

* **ratings:** name degraded sources in a response header (BUG-196) ([dcb7b13](https://github.com/IbbyLabs/XRDB/commit/dcb7b137439bff66653c43849ba2de64b4c4392a))

## [3.57.1](https://github.com/IbbyLabs/XRDB/compare/v3.57.0...v3.57.1) (2026-08-02)


### Fixed

* **compose:** score-pill body tint needs a resolved accent ([6f7c83e](https://github.com/IbbyLabs/XRDB/commit/6f7c83e071fb635b791193da07caddaa438d4ddc))

## [3.57.0](https://github.com/IbbyLabs/XRDB/compare/v3.56.0...v3.57.0) (2026-08-02)


### Added

* **configurator:** tint the score-pill body with the accent (FR-146) ([2c36fe2](https://github.com/IbbyLabs/XRDB/commit/2c36fe2c0f32abf50231d876b6d629912aea8c10))

## [3.56.0](https://github.com/IbbyLabs/XRDB/compare/v3.55.2...v3.56.0) (2026-08-02)


### Added

* **configurator:** widen badge offset range to 1200px (FR-152) ([6e9aac8](https://github.com/IbbyLabs/XRDB/commit/6e9aac88a5f702188a0912b7009e1b06fb8d26a5))


### Fixed

* **configurator:** render the fine-tuning group headings (FR-150) ([daa05a5](https://github.com/IbbyLabs/XRDB/commit/daa05a5285737a51b0e18441969a38a63e74fe0c))

## [3.55.2](https://github.com/IbbyLabs/XRDB/compare/v3.55.1...v3.55.2) (2026-08-02)


### Fixed

* **ratings:** keep a brand mark's colours on a filled plate (BUG-193) ([eb34419](https://github.com/IbbyLabs/XRDB/commit/eb34419c10080285922b1a19b7ee80946efb4f29))

## [3.55.1](https://github.com/IbbyLabs/XRDB/compare/v3.55.0...v3.55.1) (2026-08-02)


### Fixed

* **ratings:** draw branded rating logos from one shared source (BUG-192) ([5390644](https://github.com/IbbyLabs/XRDB/commit/53906447db6f6bbf6faee18925fbf6c56b99e146))

## [3.55.0](https://github.com/IbbyLabs/XRDB/compare/v3.54.2...v3.55.0) (2026-08-02)


### Added

* **badges:** add a control to hide the rating accent stripe (FR-144) ([d5a88d8](https://github.com/IbbyLabs/XRDB/commit/d5a88d82975e94ba50d41b107750351a93f44d4e))
* **badges:** scale and offset on the remaining corner badges (FR-143) ([5ae4745](https://github.com/IbbyLabs/XRDB/commit/5ae4745ab877f5fb36375f22e66509cb44fb91d4))
* **configurator:** let each media type pick its own rating sources ([130ab33](https://github.com/IbbyLabs/XRDB/commit/130ab33ccd866d43768cff5373730823080e0e0e))
* **genre:** lead with the family genre so the trim keeps it (FR-145) ([5cb17bc](https://github.com/IbbyLabs/XRDB/commit/5cb17bce9d5d5086585c4c1a878ca441f2d03320))
* **info-line:** add horizontal and vertical offset controls ([1d2db97](https://github.com/IbbyLabs/XRDB/commit/1d2db97b5d7eeefde2dd9b8e822c21b7bd2af60a))


### Fixed

* **configurator:** fold the quality badge detail when badges are hidden ([43c923c](https://github.com/IbbyLabs/XRDB/commit/43c923c354dbd5e05921f9b0d73c04be06a0bb72))
* **configurator:** show the info line scale control when it is enabled ([ef7b204](https://github.com/IbbyLabs/XRDB/commit/ef7b2046d106e2c2b2a16d24301050f03998b4ac))

## [3.54.2](https://github.com/IbbyLabs/XRDB/compare/v3.54.1...v3.54.2) (2026-08-02)


### Fixed

* **layout:** reserve an offset badge where it is drawn (BUG-191) ([cc21582](https://github.com/IbbyLabs/XRDB/commit/cc215822efeb60972b165fc3494803e8afe501cc))
* **layout:** shift the ratings band with the strip offset (BUG-191) ([3aee00a](https://github.com/IbbyLabs/XRDB/commit/3aee00a58b048e05675e9e9f44e62848270904a1))

## [3.54.1](https://github.com/IbbyLabs/XRDB/compare/v3.54.0...v3.54.1) (2026-08-02)


### Fixed

* **logging:** redact every provider credential from the access log ([c5ae5e3](https://github.com/IbbyLabs/XRDB/commit/c5ae5e3bd123d000a488ea99408d2f98afdc830c))
* **logging:** redact signature and session parameters too ([1745029](https://github.com/IbbyLabs/XRDB/commit/1745029ef9f1d7bd2ddd4be9b7f12e2886d1fedf))
* **ratings:** stop a cancelled request holding a source out (BUG-190) ([fe9c1c6](https://github.com/IbbyLabs/XRDB/commit/fe9c1c65cb9ea2baedd38b9bf8b64576f4598ea6))

## [3.54.0](https://github.com/IbbyLabs/XRDB/compare/v3.53.0...v3.54.0) (2026-08-02)


### Added

* **genre:** add short genre names behind a toggle (FR-142) ([c33c619](https://github.com/IbbyLabs/XRDB/commit/c33c6191ccdccc1434271a2d8ddcf7464e201252))


### Fixed

* **configurator:** derive the render payload from the defaults (BUG-188) ([5a24f5e](https://github.com/IbbyLabs/XRDB/commit/5a24f5eb0f45802d34c82be5da265f15ab10b22c))
* **layout:** trim the genre strip beside the ring (BUG-189) ([e7232e2](https://github.com/IbbyLabs/XRDB/commit/e7232e2603eeeccc5ad376e30a16f0d11c26778e))


### Documentation

* name the proxy network when XRDB is on more than one ([24809ac](https://github.com/IbbyLabs/XRDB/commit/24809acdbb3c4f1547a3d8f4547697a01a160f26))

## [3.53.0](https://github.com/IbbyLabs/XRDB/compare/v3.52.1...v3.53.0) (2026-08-02)


### Added

* **genre:** split case off the label, add a count dial (FR-141) ([8538962](https://github.com/IbbyLabs/XRDB/commit/8538962cbb1cd228e01f65fb7e663f3118aac040))


### Fixed

* **genre:** keep the label case when the fit check trims (FR-141) ([b1a906f](https://github.com/IbbyLabs/XRDB/commit/b1a906f6bcd27f34a6046647b25b4a4856697e30))
* **genre:** let the label control decide what the plate says (FR-142) ([f01a378](https://github.com/IbbyLabs/XRDB/commit/f01a3787c9c6e9e627ddf2f862d184f3106d17e2))
* **genre:** restore the fit gate lost from b551c83 (FR-142) ([5df6b52](https://github.com/IbbyLabs/XRDB/commit/5df6b522fa38255c65681a195ccbb879fe5bd86a))
* **genre:** run the fit check wherever the list is shown (FR-142) ([b551c83](https://github.com/IbbyLabs/XRDB/commit/b551c834b70989f2d7ddb85f4c266c1d1da8e3a2))

## [3.52.1](https://github.com/IbbyLabs/XRDB/compare/v3.52.0...v3.52.1) (2026-08-02)


### Fixed

* **badges:** keep a nudged genre badge inside the frame (BUG-187) ([ed77421](https://github.com/IbbyLabs/XRDB/commit/ed77421c9dd0980601fbd7eeac694ed0f539a03e))
* **genre:** count a coverage entry once when renders race (BUG-186) ([cb3ef01](https://github.com/IbbyLabs/XRDB/commit/cb3ef0188e50d13a698baacd660f3ffd14aabfa5))
* **genre:** fit the list on the default badge mode (BUG-187) ([11b18fc](https://github.com/IbbyLabs/XRDB/commit/11b18fce9e63cd1e09c7d60593beead5692fa1ae))
* **genre:** hold the glyph coverage cache to a byte budget (BUG-186) ([fbf106e](https://github.com/IbbyLabs/XRDB/commit/fbf106e5ca933d78fcfb67d2641a2b9bc7db1219))


### Performance

* **genre:** cache glyph coverage across outline offsets (BUG-186) ([c0dda32](https://github.com/IbbyLabs/XRDB/commit/c0dda32582a916f421566cb6121a7a9d32f8ec5c))

## [3.52.0](https://github.com/IbbyLabs/XRDB/compare/v3.51.0...v3.52.0) (2026-08-01)


### Added

* **badges:** add a rating badge border width control (FR-140) ([1f5007a](https://github.com/IbbyLabs/XRDB/commit/1f5007a8c119b39e50068d50094f65c01f9e101a))
* **badges:** drop badges rather than shrink past legibility (FR-136) ([e4270b0](https://github.com/IbbyLabs/XRDB/commit/e4270b06a24d3c7e3e2a986b40a366cd82121a5d))
* **badges:** fill the icon plate with the source's colour (FR-135) ([4576dee](https://github.com/IbbyLabs/XRDB/commit/4576dee03d3eca203864f115713f083396018865))


### Fixed

* **badges:** measure the wrapped strip when trimming (FR-136) ([bdcfc90](https://github.com/IbbyLabs/XRDB/commit/bdcfc90eecd20f1024013b80f9e2bd3caeb23e2d))
* **badges:** silhouette a brand mark on a filled plate (FR-135) ([a3aec40](https://github.com/IbbyLabs/XRDB/commit/a3aec401d2229484ff170db3561f622594dd36f9))

## [3.51.0](https://github.com/IbbyLabs/XRDB/compare/v3.50.2...v3.51.0) (2026-08-01)


### Added

* **badges:** drop genres that would run off the artwork (FR-138) ([a1bf4e9](https://github.com/IbbyLabs/XRDB/commit/a1bf4e93708cae9f593925653ff3960ae4611fc8))
* **badges:** expose the rating badge background opacity (FR-134) ([67f4ae2](https://github.com/IbbyLabs/XRDB/commit/67f4ae2c1f4f6fa36084fdf1eb0b35eb1b59e6ef))


### Fixed

* **badges:** composite the score pill's drop shadow (FR-134) ([ae1322e](https://github.com/IbbyLabs/XRDB/commit/ae1322ecafa0ef2034e5698bb0118a80d2cf77db))
* **badges:** reach the score pills with the background opacity (FR-134) ([ce9474c](https://github.com/IbbyLabs/XRDB/commit/ce9474c00080f83db515f669f8e1614485a5340d))
* **configurator:** name the genre border states instead of a -1 width ([1066ee0](https://github.com/IbbyLabs/XRDB/commit/1066ee079584776e4417f0c86df7738f29558b6e))

## [3.50.2](https://github.com/IbbyLabs/XRDB/compare/v3.50.1...v3.50.2) (2026-08-01)


### Fixed

* **badges:** colour the genre label and plate border by family (BUG-185) ([6dcd197](https://github.com/IbbyLabs/XRDB/commit/6dcd197012a39621526fb01c91ad7c6c18cb2856))
* **badges:** match the tile border to the shared plate (BUG-184) ([21f95a0](https://github.com/IbbyLabs/XRDB/commit/21f95a065734cf9d2837d524555d0e5f0e1c0797))

## [3.50.1](https://github.com/IbbyLabs/XRDB/compare/v3.50.0...v3.50.1) (2026-08-01)


### Fixed

* **badges:** draw three stored controls (BUG-179, BUG-180, BUG-181) ([b756d70](https://github.com/IbbyLabs/XRDB/commit/b756d70d990536d58fa8d98b786b355082ce99c3))
* **badges:** honour the edge inset and tile border (BUG-182, BUG-184) ([8cb9c78](https://github.com/IbbyLabs/XRDB/commit/8cb9c783e7c959624439feb2f6fe275f3888fe97))
* **configurator:** show only the live strip controls (BUG-183) ([b7373f1](https://github.com/IbbyLabs/XRDB/commit/b7373f171289657378639c7449647b2a47aa5c69))

## [3.50.0](https://github.com/IbbyLabs/XRDB/compare/v3.49.5...v3.50.0) (2026-08-01)


### Added

* **badges:** let the genre pill border take the accent colour ([12de1c3](https://github.com/IbbyLabs/XRDB/commit/12de1c37037a22c3908c64c9f7ba5073bea4402b))
* **badges:** outline the age rating plain style (FR-133) ([b8dd5cc](https://github.com/IbbyLabs/XRDB/commit/b8dd5cc81e58379ad8973c9083b28a53b8e8d608))


### Fixed

* **badges:** draw the icon plate border around the shape (BUG-177) ([a41ff16](https://github.com/IbbyLabs/XRDB/commit/a41ff16df0ba7160ab7c47d2d3df0871c28b9681))
* **badges:** make glass selectable and honour opacity (BUG-178) ([bb39b07](https://github.com/IbbyLabs/XRDB/commit/bb39b071abe7ef4c502823e250129780af4f99ac))
* **badges:** tint a grey source mark rather than draw it as-is (BUG-176) ([3f6df19](https://github.com/IbbyLabs/XRDB/commit/3f6df19749d9492ef5cdb2fdf6af9f5e621439bf))
* **compose:** make badge fill/border/outline exposure consistent ([df8a2bc](https://github.com/IbbyLabs/XRDB/commit/df8a2bcc1cba19703af3c0ebaffd8485f08a6dd1))
* **configurator:** name the genre colour and stripe controls apart ([5f3b1d9](https://github.com/IbbyLabs/XRDB/commit/5f3b1d93fd139d94a5823701e7b136831af6d87a))
* **configurator:** say what the artwork URL is for ([1501fc2](https://github.com/IbbyLabs/XRDB/commit/1501fc2aac66bba1fec1f1c644fa77263d80971f))
* **configurator:** show the genre accent colour on the pill style too ([59740f8](https://github.com/IbbyLabs/XRDB/commit/59740f86dcaae1fb2b2c9a6e4ed64014e445522c))
* **logo:** check the surface being drawn for a baked-in title ([b81e86d](https://github.com/IbbyLabs/XRDB/commit/b81e86da0b5426634d768fdc0f07bb1a99e1fd75))


### Performance

* **ratings:** keep a title's ratings for a day, not six hours ([a992dcb](https://github.com/IbbyLabs/XRDB/commit/a992dcb1b6541c7d2e61d43f2e08b3850715cb5a))
* **ratings:** refuse a paced source rather than queue past the timeout ([368086d](https://github.com/IbbyLabs/XRDB/commit/368086d3fc8d2b7d9415ebfecce7f916b00499a1))

## [3.49.5](https://github.com/IbbyLabs/XRDB/compare/v3.49.4...v3.49.5) (2026-08-01)


### Fixed

* **ratings:** back off further each time a source keeps failing ([1e77c0c](https://github.com/IbbyLabs/XRDB/commit/1e77c0c1cf248ab6f6d549492415285407b13dd4))

## [3.49.4](https://github.com/IbbyLabs/XRDB/compare/v3.49.3...v3.49.4) (2026-08-01)


### Fixed

* **ratings:** hold out a source that keeps failing ([62fc2a7](https://github.com/IbbyLabs/XRDB/commit/62fc2a713e4700a7edddac100d06a59469489cf2))


### Documentation

* **changelog:** record that the 3.49.2 ratings change was reverted ([b71dd8d](https://github.com/IbbyLabs/XRDB/commit/b71dd8df1a29e40a7a035178e35ad9a2d1a1fee9))

## [3.49.3](https://github.com/IbbyLabs/XRDB/compare/v3.49.2...v3.49.3) (2026-08-01)


### Reverted

* **ratings:** the owner-supplied key change released in 3.49.2 is reverted ([46278bd](https://github.com/IbbyLabs/XRDB/commit/46278bd)). Exempting owner-keyed requests from the shared rate budget removed the throttle in front of MDBList, and requests then timed out instead of being paced, so ratings went missing. 3.49.3 restores the 3.49.1 behaviour. Do not run 3.49.2.


### Documentation

* **render:** trim the renderVersion note to the fact ([f939794](https://github.com/IbbyLabs/XRDB/commit/f939794c4b2d2c089caf745f68df298dc44bec82))

## [3.49.2](https://github.com/IbbyLabs/XRDB/compare/v3.49.1...v3.49.2) (2026-08-01)


### Fixed

* **ratings:** keep owner-supplied keys out of the shared rate budget ([4647235](https://github.com/IbbyLabs/XRDB/commit/4647235aa459e0d1e895c0ef6d30415dd6e8718a))

## [3.49.1](https://github.com/IbbyLabs/XRDB/compare/v3.49.0...v3.49.1) (2026-08-01)


### Performance

* **render:** fail art fetches fast and pool their connections ([52e13aa](https://github.com/IbbyLabs/XRDB/commit/52e13aa6e9c4945143a7413463d86cbcb19daefd))

## [3.49.0](https://github.com/IbbyLabs/XRDB/compare/v3.48.0...v3.49.0) (2026-08-01)


### Added

* **logo:** add an emboss style that lights the mark's own edges ([0c7aacd](https://github.com/IbbyLabs/XRDB/commit/0c7aacd18e8a82062eb8a5843b7e8d1bb14e32e6))
* **logo:** add shadow offset, colour and style controls ([273e6a0](https://github.com/IbbyLabs/XRDB/commit/273e6a08b924bdc2a0535de5e3061ce34f3d3ab5))


### Fixed

* **logo:** make the shadow styles tell each other apart ([e5c5a8e](https://github.com/IbbyLabs/XRDB/commit/e5c5a8e430fe788941d92cab7368c281a1973d8f))
* **provider:** pace MDBList from its reported daily allowance ([4b4fb29](https://github.com/IbbyLabs/XRDB/commit/4b4fb29715600983cfc522bf44f0741cd0c04975))

## [3.48.0](https://github.com/IbbyLabs/XRDB/compare/v3.47.1...v3.48.0) (2026-08-01)


### Added

* **logo:** cast the title shadow from the glyphs, not a box ([19abdaf](https://github.com/IbbyLabs/XRDB/commit/19abdaff77826a234a5892047ae01b61aa49ec56))

## [3.47.1](https://github.com/IbbyLabs/XRDB/compare/v3.47.0...v3.47.1) (2026-08-01)


### Fixed

* **logo:** fade the title scrim out towards the artwork edges ([2b9b3f7](https://github.com/IbbyLabs/XRDB/commit/2b9b3f72495bbbbc0d82e95d6a13423e137c0928))

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
