# Online loading despite cache failures — 2026-10-06

The actual worker could reject installation/activation or prevent scripts, styles, fonts and images from loading when cache storage fails. Successful script and stylesheet responses also waited for cache writes. Ten initial regressions reproduced these defects before repair.

Cache operations are now optional: update installation and obsolete cache cleanup tolerate storage errors; online JavaScript begins without cache access; asset writes run as worker lifetime work registered during fetch dispatch, rather than delaying the response. Styles retain cached display and background refresh. Cached images need no new fetch/write, offline cached scripts remain usable, and the existing180asset FIFO cap remains. Cache names/versions are unchanged. No Auth, account, permissions, media/private cache purge or backend changes.

Final tests4644passed6skipped; build/type/native checks pass; lintfiveexistingwarnings. Initial bundle1103.4KBraw334.9KBgzip. Actual worker on isolated Chrome8398, with all cache operations synthetically failing: installed/active and controlled map route, featurechunk, stylesheet and icon load. Screenshot outputs/vybe-worker-storage-browser-check.png. No production account/Firebase/location access. Own fixture server75516 stopped; source adoption and physicalphone/mapsharing/codec/FPS remain unverified. This bug is not asserted as the cause of the retained old browser version.

Publication pending.
