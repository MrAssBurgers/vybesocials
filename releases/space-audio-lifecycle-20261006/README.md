# Existing audio room connection lifecycle repair

Leaving an audio room or unmounting its screen previously failed to cancel a pending token request or handshake. Duplicate joins opened overlapping connections, same-role room changes were ignored, and retired-room callbacks could reattach audio and change the current UI. Failed handshakes leaked transport resources. A delayed microphone enable could also finish after the latest mute.

The existing hook now coalesces attempts by room and role, owns the room before its handshake, invalidates all pending work on leave/unmount/replacement, ignores retired callbacks and closes failed or retired connections. Microphone operations run in order and use the server's publish grant; stale results cannot update the replacement room. Terminal disconnection permits a fresh join. No microphone is enabled by joining.

Six initial lifecycle regressions failed against prior source. Twelve focused cases pass; full suite: 4,675 passed, six skipped. Types, build, unchanged bundle budget and native manifest checks pass; lint has five existing warnings and no errors. An isolated Chrome walkthrough importing the actual hook with a synthetic transport confirmed leave-before-token creates zero rooms, duplicate joins create one, and leaving plus retired events keeps one closed room and idle state. Parent workspace screenshot: `outputs/vybe-space-audio-browser-check.png`. No real account, microphone, Firebase resources or records were changed.

This is one necessary restoration step. Production Spaces membership reads/writes, counts and its mismatched Firebase token contract remain unresolved; this does not establish live audio-room readiness. Phone map sharing, Clips performance, source adoption and broader content restoration also remain open.

Publication evidence follows after the tested source is released.
