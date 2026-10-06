# Mobile clips and map sharing repair — 2026-10-06

Source published: `1c4fa84719fed33a3c5610d348e1f6796415ce22`.
Lovable deployment: `633ae55f-21f0-4561-9cfd-8d217f10903e`.

Both https://vybehub.app and https://vybesocials.lovable.app independently serve that exact manifest commit, built `2026-10-06T04:57:55.781Z`, entry `/assets/app-BqdEEKxw.js`, SHA256 `9c1c729cb0ff03e9d9b5495c132f2556949d60f26964a0aa93706c26509744eb`. Matching Shorts, MobileShortCard and ShortCard chunks are reachable on both domains with matching hashes and the new visibility handling. Fresh GPS retirement/interval markers are verified in the entry. Local proof: `work/mobile-lifecycle-public-proof.json`.

The existing cards now have a single guarded autoplay path and pause when backgrounded. Foreground resumes the active clip through the existing sound policy; explicit pause/mute is retained. Profile data rerenders do not restart playback, while the checked post account/view context still retires pending work.

GPS callbacks are scoped to their watch/fallback start. A retired denial or position cannot replace resumed state. Approved foreground map sharing obtains fresh stationary samples every45s before the existing two-minute server expiry. There is an11s request retirement deadline, no overlapping fresh request, no background acquisition, and no periodic request after a permission denial. This does not enable sharing or change grants, expiration, Firebase configuration, Rules or backend services.

Four new regression cases failed before repair. Final focused38 tests and full474 files/4496 tests pass,6 skipped. Build, native manifest checks, types and lint pass (5 existing warnings). Entry budget1099.2KBraw/333.7KBgzip remains within1125/335 limits. Logs: `work/mobile-lifecycle-{before,focused,full,build,types,lint}.log`.

Manual isolated browser QA uses the actual MobileShortCard and location hook with a local2s synthetic MP4 and stubbed account/GPS/service. Video readyState4, no media error, background pause and one request on resume verified. Retired GPS denial ignored, periodic fresh sample observed and synthetic receipt confirmed. Screenshot: `outputs/vybe-mobile-lifecycle-verified.png` in the task workspace. This is not physical-phone codec/FPS/GPS/permission or production sharing proof. QA8395/session30707 stopped intentionally; retained previews/emulators unchanged.

Actual signed-in IAB reload and fresh-entry navigation retain @bakrix and load Home/posts, but still mount older `/assets/app-CGCcULTp.js`. Chrome reload similarly mounts `/assets/app-5p_yKDY_.js`. Those observations are not explained or declared repaired by the new public manifest. Phone auth/network-request-failed, mounted adoption, real clip sources, mobile location sharing and full readiness remain open. No account storage/cache/worker purge or permission mutation was performed.
