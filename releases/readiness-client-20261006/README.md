# Existing-flow readiness client release

This release branch starts at the last verified live client, `1213702df2e686ba016ba1127237484b2c9d1d4f`, and copies only the verified general client fixes from development `e97f1845ee2a00086a0d4b016497c1a87a874be2`.

Included: brief profile-bootstrap continuity and native foreground auth recovery; profile visits preserve unread conversations; profile headers are independent of count requests with scoped, bounded reads; consolidated count polling stops while inactive; stalled feed/profile/count reads permit explicit retry after 15 seconds; active Clips release media resources on unmount; GPS start/fallback exceptions retire the attempt and permit explicit retry. These repairs do not promise instant network delivery or physical-device performance.

The exact 23 client/source/test changes are visible in the Git diff against the base. There are no package/dependency, server, Rules, IAM, index, provider, authority-setting or account-content changes. Pending safety/parental/export/deletion UI and backend protocols stay off this branch. They remain preserved on development main and must receive their separately coordinated release.

Verify this exact branch with app typecheck, full tests, lint, production/native entry build and scoped browser checks before publishing. Lovable's existing GitHub connection exposes a branch selector; switch only the existing repository connection to this reviewed branch for publication, then verify its selected source commit and delivered web/native manifest. Preserve main and never force-push. A GitHub push alone does not deploy the production website. No actual phone shell rebuild or installed adoption claim follows from a web publication.

Keep the full user-ready/Firebase restoration/performance/security goal active. Next: verify and publish this exact compatible source, confirm actual Play Store profile/post/location/Clips adoption, and complete remaining account/backend/content restoration prerequisites and every existing user flow.
