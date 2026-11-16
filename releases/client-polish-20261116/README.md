# Client maintenance release

Prepared directly on public main bcb504f9f83dd2145b8b839661fc08b7a44feea3 in a separate checkout. This contains only the reviewed client repairs below. The broader unpublished backend/Rules/protocol audit remains in its original checkout and is not part of this release.

- Login approval resolves only through the existing checked callable. Client-writable broadcasts cannot supply approval status or credentials. Polling is single-flight across visibility events and parent redraws, validates string credentials and retires old challenges/views.
- Clips captions/progress and video-list padding use the same measured bottom inset as navigation.
- Reconnect probes belong to the current foreground session, coalesce events, abort/retire on pause/cleanup and use bounded waits. Native mode checks the public web origin instead of cached localhost. The status banner keeps one announcement and owns its recovery timer.
- The mobile Settings title uses the theme foreground, addressing the dark title observed on the phone.

No Functions, Rules, indexes, Firebase/provider/Auth configuration, dependency versions or native binaries changed. The approval callable name and poll body are unchanged; anonymous production OPTIONS204 and a random nonexistent-challenge poll200/not_found confirm existing transport compatibility. No real approval, account or challenge was used for that check. This does not certify every existing backend service or complete server-side session admission.

Exact release-tree validation:5472tests pass/sixdefaultskips/zero failures,558reportedfiles,233.36seconds. Focused client checks49pass. Types, zero-warning lint, production build, CSS/boot/native-package/bundle checks pass. Entryapp-CHCALP8A.js859.9KBraw/262.5KBgzip under unchanged1125/335limits;711native manifest assets. The initial whole run had one EditPostDialog test failure: its mocked read skipped the real hook's module preload, delaying the error under suite load. The fixture now retains that preload, with the same rejected-save/draft assertions; the complete rerun passes. No editor runtime or backend protocol was changed for this fixture correction.

Actual Android Chrome previews were rerun against this checkout's real source/CSS:10connection cases pass (explicit simulated network/native inputs and query-effect counters, plus one real public anonymous asset read); corrected Clips spacing clears navigation at simulated0/20/34px insets without horizontal overflow. They do not update or certify the installed Despia client. Settings' new foreground must still be observed after publication. Private real-account screenshots and APK/log files are excluded.

`verification-local.json` records the exact source/runtime identity and checks. Local build metadata names its parent because it was built before committing. Publication requires a fast-forward main push, exact Lovable sync/readiness and one publish, followed by independent public source/runtime/entry/route/native-asset checks and actual phone adoption. No publication or global-launch completion is implied by this preparation record. Full security/provider/calls/media/load acceptance remains active.
