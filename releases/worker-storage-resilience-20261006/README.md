# Online loading despite cache failures — 2026-10-06

The actual worker could reject installation/activation or prevent scripts, styles, fonts and images from loading when cache storage fails. Successful script and stylesheet responses also waited for cache writes. Ten initial regressions reproduced these defects before repair.

Cache operations are now optional: update installation and obsolete cache cleanup tolerate storage errors; online JavaScript begins without cache access; asset writes run as worker lifetime work registered during fetch dispatch, rather than delaying the response. Styles retain cached display and background refresh. Cached images need no new fetch/write, offline cached scripts remain usable, and the existing180asset FIFO cap remains. Cache names/versions are unchanged. No Auth, account, permissions, media/private cache purge or backend changes.

Final tests4644passed6skipped; build/type/native checks pass; lintfiveexistingwarnings. Initial bundle1103.4KBraw334.9KBgzip. Actual worker on isolated Chrome8398, with all cache operations synthetically failing: installed/active and controlled map route, featurechunk, stylesheet and icon load. Screenshot outputs/vybe-worker-storage-browser-check.png. No production account/Firebase/location access. Own fixture server75516 stopped; source adoption and physicalphone/mapsharing/codec/FPS remain unverified. This bug is not asserted as the cause of the retained old browser version.

Publication pending.

Published client `67e23961d9965a0777bc0cf98f629635d4011e96`; deployment `63124240-9d8e-4f99-a072-13f994c2b748`; actual publisher confirmed “Your website was updated”. Screenshot `outputs/vybe-worker-storage-published.png` captured before documentation sync; preserve.

Publicsourcev2 `769c54124656d54a740bbf04cd2611c0381a9f4b9ae1cce4116f0f99f012b59c`/2562; built `2026-10-06T11:16:46.622Z`; unchangedentry `/assets/app-DVzShrah.js` SHA256 `9a029dbafed1ff98b581a025ac7169505fe2dc8dc3d4b2c46bdbccdce5e01eff`. Exact metadata/entrybytes/fiveroutes passed; secondary origin redirects to canonical. PublicworkerHTTP200/no-cache and LF-normalizedSHA256 `e21e4f11ecaeaabdb64bb847332778bc1b9c4e73ae3bd0f4d71202defb252d30` match tested source. Log `work/worker-storage-public-check.log`.

Retained signed-in IAB normalreload still loads app-CGCcULTp.js; the cause and physicalphone Auth/map/Clips remain unverified. Sourceadoption is not claimed fixed. Isolated fixture server75516 stopped and tabclosed. Fresh readonly live-function inventory also identifies missing audio-room listener-count functions; their ignored errors and existing membership permissions need the next repair pass. No broad backend deploy or newfeatures.
