# [1.15.0](https://github.com/WhatYouGoBy/ping/compare/v1.14.1...v1.15.0) (2026-10-07)


### Features

* **deploy:** run the container as a backend-only sync API ([1b87dbb](https://github.com/WhatYouGoBy/ping/commit/1b87dbbb981d62def4fcf8790f8a313d8727b5ad))

## [1.14.1](https://github.com/WhatYouGoBy/ping/compare/v1.14.0...v1.14.1) (2026-10-07)


### Bug Fixes

* **sync:** apply the enable toggle immediately ([88f4960](https://github.com/WhatYouGoBy/ping/commit/88f496061486732ece0857c1f599914ebeb9e791))

# [1.14.0](https://github.com/WhatYouGoBy/ping/compare/v1.13.0...v1.14.0) (2026-10-07)


### Features

* **sync:** allow a build-time sync server URL override ([5305634](https://github.com/WhatYouGoBy/ping/commit/5305634f3499327211f1c5585c4a445e0ee848e9))

# [1.13.0](https://github.com/WhatYouGoBy/ping/compare/v1.12.0...v1.13.0) (2026-10-07)


### Features

* **sync:** add Node sync backend with SQLite match storage ([b5e430b](https://github.com/WhatYouGoBy/ping/commit/b5e430b2765df69a6623a85acfee8a3b9e6f35b6))
* **sync:** client sync engine and settings UI ([f7d053e](https://github.com/WhatYouGoBy/ping/commit/f7d053e4abb468bb3dab04776c27584df5f7e97a))
* **sync:** store schema v2 with tombstones and offline-first merge ([f66196e](https://github.com/WhatYouGoBy/ping/commit/f66196e9b10b3025223fe6027836f88771496312))

# [1.12.0](https://github.com/rgrund-inform/ping/compare/v1.11.0...v1.12.0) (2026-09-23)


### Features

* add quick mode, a round-robin that records winners not scores ([8a18d84](https://github.com/rgrund-inform/ping/commit/8a18d84a3942b8283cf3f1ebb39505095460a990))
* offer the last tournament's players when starting another today ([0b7682d](https://github.com/rgrund-inform/ping/commit/0b7682df507446e3415a79c7e3e5d93d57e30632))

# [1.11.0](https://github.com/rgrund-inform/ping/compare/v1.10.0...v1.11.0) (2026-09-04)


### Features

* include a results summary in shared links and add link previews ([df09b71](https://github.com/rgrund-inform/ping/commit/df09b715971442e4b59a29ecd647ffb88346f540))

# [1.10.0](https://github.com/rgrund-inform/ping/compare/v1.9.1...v1.10.0) (2026-09-04)


### Features

* show results overview when sharing and warn on re-import ([f0e1e0a](https://github.com/rgrund-inform/ping/commit/f0e1e0a5557d7157aa706d0210cb6fb05e91495c))

## [1.9.1](https://github.com/rgrund-inform/ping/compare/v1.9.0...v1.9.1) (2026-09-04)


### Performance Improvements

* delta-encode match timestamps in share links (format v2) ([9b913b0](https://github.com/rgrund-inform/ping/commit/9b913b079283ea86287888a05de414e8b3430adb))

# [1.9.0](https://github.com/rgrund-inform/ping/compare/v1.8.0...v1.9.0) (2026-08-27)


### Bug Fixes

* make head-to-head table on player page sortable ([81433a3](https://github.com/rgrund-inform/ping/commit/81433a3c2963e4ca9be1ad5d8d36e81ae3c6c758))


### Features

* rank round-robin standings by head-to-head before point difference ([fcb5574](https://github.com/rgrund-inform/ping/commit/fcb55749a0f37eb58eb610034dfc8133ad0216cf))
* share tournaments via link or QR code instead of file export ([6238284](https://github.com/rgrund-inform/ping/commit/623828433453ef9258adf85d98944a6baf256dce))

# [1.8.0](https://github.com/rgrund-inform/ping/compare/v1.7.0...v1.8.0) (2026-07-31)


### Features

* show a what's-new changelog overview after an update ([55e0bef](https://github.com/rgrund-inform/ping/commit/55e0bef56221afa14d67a7d33bd7d5d80ae83c12))

# [1.7.0](https://github.com/rgrund-inform/ping/compare/v1.6.0...v1.7.0) (2026-07-31)


### Features

* smart-shuffle initial round-robin order and randomise serve side ([d6c88d6](https://github.com/rgrund-inform/ping/commit/d6c88d643acad2c956ae32e47c44ce20561e1e40))

# [1.6.0](https://github.com/rgrund-inform/ping/compare/v1.5.1...v1.6.0) (2026-07-15)


### Features

* add smart shuffle that evenly spaces each player's matches ([75b9bc2](https://github.com/rgrund-inform/ping/commit/75b9bc262ece46b94385bfdb9e3abe352587cd3e))

## [1.5.1](https://github.com/rgrund-inform/ping/compare/v1.5.0...v1.5.1) (2026-06-11)


### Bug Fixes

* harden tournament import against player-identity bugs ([2573880](https://github.com/rgrund-inform/ping/commit/2573880794ca5aa2a28d34ecfbf3b98108c7b963))

# [1.5.0](https://github.com/rgrund-inform/ping/compare/v1.4.0...v1.5.0) (2026-06-11)


### Features

* shuffle upcoming matches on a tournament's Next tab ([20dc5f7](https://github.com/rgrund-inform/ping/commit/20dc5f7e4603708688d9d828a06ac54ede103e10))

# [1.4.0](https://github.com/rgrund-inform/ping/compare/v1.3.0...v1.4.0) (2026-06-11)


### Features

* import and export individual tournaments ([ca7ab63](https://github.com/rgrund-inform/ping/commit/ca7ab6357a228b2733cf48a1f3ae40153bc8890a))

# [1.3.0](https://github.com/rgrund-inform/ping/compare/v1.2.0...v1.3.0) (2026-05-27)


### Features

* import and export the local database as JSON ([0c51813](https://github.com/rgrund-inform/ping/commit/0c518139a767b6c0184e78050b10f55155d62687))

# [1.2.0](https://github.com/rgrund-inform/ping/compare/v1.1.0...v1.2.0) (2026-05-27)


### Features

* allow editing already-recorded match scores ([a16b43a](https://github.com/rgrund-inform/ping/commit/a16b43ac9b6f0d4611250c8323dacc4416f3212c))

# [1.1.0](https://github.com/rgrund-inform/ping/compare/v1.0.0...v1.1.0) (2026-05-07)


### Features

* show app version in footer and lock completed matches ([32d73a1](https://github.com/rgrund-inform/ping/commit/32d73a1ad3f0fa1ecbde8904848466fbbcd435c1))

# 1.0.0 (2026-05-07)


### Features

* add player statistics views and semantic-release ([18d55cf](https://github.com/rgrund-inform/ping/commit/18d55cf51e649e9959b414b61f9b22311d41c483))
