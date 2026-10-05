# Squad Maps stability

This checkpoint repairs the existing Squad Maps flow. The original Mapbox 3D globe remains the default. Squad membership never grants location access: highlights apply only to current, independently admitted location shares. The optional flat fallback uses the same checked highlight set.

## Checked contract

`manageMapSquad` replaces direct `map_group_maps` and `map_group_members` reads and writes. Every action verifies the current Auth account incarnation, exact canonical UID/profile pair, active private account binding, and applicable current owner/member access. The callable accepts only the action's declared fields. Read and write quotas are separately bounded at 120 and 30 requests per minute per Auth UID.

| Action | Behavior |
| --- | --- |
| `list` | Current memberships and owner-reviewable previous squads; opaque continuation, at most 20 scanned rows per phase/page. Filtered pages can have no visible items and still carry a continuation. |
| `read` | Current admitted squad and up to 20 scanned roster rows; separate continuation for further members. |
| `matchMembers` | Checks at most 100 explicitly supplied profile IDs. The map supplies people whose location it can already display; matching never introduces another location. |
| `create` | Creates the squad, deterministic owner membership and durable retry receipt atomically. |
| `createInvite` | Owner-only, revision-checked invitation, valid for 24 hours. |
| `previewInvite` / `join` | A signed-in current token holder can review and explicitly join, subject to current owner/account/block checks. Friendship is not required. |
| `leave` | A member leaves against the captured membership revision. Only an actual active-to-left transition decreases the count. Owners use archive. |
| `archive` | The owner closes the squad against its current revision. Reads and invitations stop admitting it; evidence is retained. |
| `recreate` | An owner explicitly reviews prior metadata and creates a new squad ID with only the owner as a member. Old records remain intact. |

Mutations use UUID request IDs with exact body/actor/incarnation fingerprints. Concurrent or uncertain retries do not create duplicate members, squads, or counter transitions. Replays describe current state: an old join cannot undo a later leave, and an old create cannot restore an archived squad. Archived or unavailable responses have null squad and membership; durable membership evidence stays stored without granting access. The exact Firestore creation time of the state and its atomic creation receipt binds the source incarnation, so copied state at a deleted/recreated path cannot revive old access.

Previous raw membership rows cannot prove admission. Owner review uses a fingerprint of the exact legacy document version and produces a separate protected squad, without automatically copying members. The original document is preserved. There is no new 50-member product limit; roster pagination and highlight matching have independent bounded requests.

Member counts represent protected active membership registrations. Blocked or no-longer-valid identities are omitted from visible roster/matches, so visible roster length can be lower. Counts never claim live location sharing. Unsupported or malformed legacy metadata is omitted from review without deleting the raw record; continuation still moves past skipped documents. A durable recreation mapping prevents a second request ID from creating another replacement for the same exact legacy version.

## Client behavior

The sheet offers create, roster, review invitation, join, leave, archive and deliberate legacy recreation. Names and failed drafts survive uncertain saves. Pending controls prevent duplicate actions. Acknowledged creation/join opens the new squad's detail. Selecting a squad explicitly enables its highlight and friends layers; selecting another does not accidentally turn them off.

The invitation link uses `/map#squad-invite=…`. The map captures and removes that fragment from its current URL; invitation preview requires an explicit review and joining requires a separate action. Copying a link does not send a message or notification. Generated invitations remain copyable while fresh same-squad owner admission is confirmed, up to their separately elapsed-time-adjusted actual expiry; refreshing admission does not extend the token lifetime. Hidden/closed views retire the token. Retry storage contains only hashed request bodies and UUIDs, not invitation tokens or names. Invite previews are not query-cache keys, and mutation results are not retained after the sheet is hidden or closed.

List, roster, detail and match reads are scoped to account, profile, session and selection. They use fresh mount/foreground reads, elapsed-time-adjusted access leases, visible errors and retry controls. Current denials retire retained roster pages, details and highlights. Delayed work cannot restore a closed, hidden or departed view. Query roots are excluded from disk persistence. Further pages remain reachable through bounded groups of three pages with a return-to-first control.

The existing friend card also opens the selected conversation instead of the generic inbox. Chat/profile/close work with the viewer's own GPS off; finder explains its location requirement. Chat has duplicate-tap protection, a 15-second deadline, visible retry errors, and account/selection/grant retirement around existing conversation lookup. This does not redesign raw DM creation authority or repair Map Wave.

## Coordinated rollout

No production deployment is implied by these source changes. Deploy the following only after the prior checked account/location prerequisites and the other pending releases in `DEPLOY.md` are reviewed. Old clients using raw squad collections are incompatible with the replacement rules.

1. Provision the two `_map_squad_members` collection indexes in `firestore.indexes.json`: `(owner_uid ASC, account_created_at_ms ASC, status ASC)` and `(squad_id ASC, status ASC)`, both with implicit ascending document-ID order. Preserve all unrelated pending indexes.
2. Provision `expireAt` TTL on `_map_squad_invites` and `_map_squad_cursors`. Invitations expire after 24 hours and cursors after 10 minutes; authority rejects expiration before managed deletion. Do not add TTL to durable squad state, membership, receipt or recreation evidence.
3. Deploy the exact named callable `manageMapSquad` and coordinated Firestore restrictions. Direct client access to `map_group_maps`, `map_group_members`, `_map_squads`, `_map_squad_members`, `_map_squad_invites`, `_map_squad_receipts`, `_map_squad_cursors`, and `_map_squad_recreations` is denied, including raw staff access. Administrative maintenance uses reviewed server tooling.
4. Publish the matching tested `origin/main` through Lovable Share → Publish. A GitHub push alone does not publish `vybehub.app` or the Despia web bundle. Verify owner and invited-member flows after the coordinated cutover.

There are no new secrets, Auth settings, Storage rules, real-provider calls or notification triggers. Do not use a broad Functions deploy. `auth2faRequest` stays excluded under the existing restriction. The demo-only preview wrapper and fixtures must never be deployed.

## Verification and remaining work

See the current `WORKLOG.md` checkpoint for final test counts and browser evidence. Tests must cover exact retry/concurrent transitions, member/owner binding and Auth changes, both block directions, version/incarnation changes, legacy recreation, owner-only actions, roster continuation, raw Rules denial, failed-draft retention and account/view retirement.

The content-pin audit is separately recorded in `MAP_PIN_AUDIT.md`; that document does not implement pin publication, privacy or tap handling. Map Wave's old notification write is also still pending a checked authority repair. Actual GPS, native/background permissions, real providers and complete launch readiness remain separate verification work.
