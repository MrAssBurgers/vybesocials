# Mobile Firebase token transport recovery

Firebase Auth can restore an account while its first token request fails. The account observer previously waited for another SDK token event, so failed map and media reads could remain unavailable even after connectivity returned.

The observer now retries that failed enrichment after 2 and 8 seconds, with immediate foreground/online/native-resume recovery. Only two automatic attempts run. Healthy sessions do not install recovery listeners or download the helper. Hidden, offline and native-paused views do not request recovery. Account intent, observer generation and the exact SDK user guard every acknowledgement; account changes and unsubscription retire recovery. A successful same-account refresh emits the existing payload-free token-ready event, allowing only failed foreground map/media reads to retry. No new sign-in, location consent or sharing grant is created.

Auth fallback errors now use concise app-facing text; timeout codes and behavior remain unchanged. Firebase Auth configuration, Rules, Functions and production records are unchanged.

Verification: the native-resume integration regression failed before the fix and passes afterwards; seven controller cases cover bounded retries, lifecycle exclusions and coalescing. Full suite: 4,652 passed, six skipped. Type checking, build, native-shell checks and bundle budget pass; lint has five existing warnings. In the isolated browser fixture, restoring synthetic connectivity and resuming the app recovered an actual map read and resolved/played actual test media. Screenshot: `outputs/vybe-mobile-transport-browser-check.png` in the parent workspace. This fixture tests the production hooks/controller with a synthetic account and transport, without real GPS or credentials.

A clip also played in the retained production desktop session (readyState 4, no MediaError). That session still used older `app-CGCcULTp.js`; physical-phone source adoption, native location sharing, codecs and frame rate remain unverified. This release is a recovery fix, not evidence that all reported mobile problems are resolved.

Publication evidence is appended after the exact tested commit is published.
