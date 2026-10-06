# Late native token recovery continuity

Tested source: `932a9cc7ea0cd07e1eb64aecaebb73c7c264e753`. Publication job: `a08ad889-4f8b-4436-87d0-17a84657b305`.

Existing token transport retries previously forgot a native pause when recovery was created or replaced after the pause event. Recovery now checks the same shared foreground phase used by map reads and clip cards. The phase implementation is initialized at entry startup so later lazy imports also retain the existing phase. Hook compatibility, account retirement guards, retry bounds and pending-request coalescing remain intact. No Auth configuration, credential, Rules, Firebase backend, consent, location or content changes.

Two added actual-helper regressions fail before and pass after. Forty focused checks and 4,773 full tests pass, six skipped. App/native build, type checks and bundle limits pass; lint has zero errors and five existing warnings. The actual helper was dynamically imported in a synthetic Chrome check after native pause: reconnect produced zero requests; resume produced one. This did not request a Firebase token, use a production account or certify physical phone recovery/performance.

The hosting UI confirmed “Your website was updated.” Canonical production metadata, pinned runtime dependencies, entry bytes and nine route references match the tested source. The secondary Lovable address redirects to canonical, not an independently served origin. See `verification.json` for exact source, job and publication evidence. Real phone network/sign-in/map/clips, older mounted client adoption, historical content/media restoration and security review remain separate open launch checks.
