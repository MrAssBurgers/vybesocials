# Signed-in profile bootstrap release

This release restores checked profile loading for an already-signed-in account. Its Functions source is commit `e77a0681162274bdbc037aa032704023afb270f7`; the release adds no product code. Existing unique migrated profiles keep their ID and content. Ambiguous ownership requires review.

Deployed on 2026-10-05: both named Functions are `ACTIVE` with artifact hash `5c78c3454ea577f7b5a3724330904f485b67a8b1`. The live Firestore release points to `projects/vybe-daaab/rulesets/4583d3f4-8f6c-42fa-80b9-c2d0cc1dc41e`, with the exact tested candidate hash below. Empty public requests to both Functions return callable `401 UNAUTHENTICATED`. The Rules CLI reported a duplicate-release 409; an independent authenticated GET established that the tested ruleset was already active, so no blind repeat or baseline overwrite was performed. The user's phone retry remains the account-specific verification step.

## Exact resources

- `ensureAccountProfile` and the strict replacement `claimProfileByEmail`, in `us-central1` for Firebase project `vybe-daaab`.
- The adjacent `firestore.rules`, prepared from the actual deployed ruleset `projects/vybe-daaab/rulesets/e301c95c-44b4-4d06-97a5-e268cd3711d2`, SHA-256 `857eca934725e9cf94be42af601cf7a1c7a742960f84e9fe1f7cfb154dc045a3`.
- No index, TTL, provider secret, account setting, Auth provider, Storage rule or frontend publish.

The candidate SHA-256 is `f421cde69d505389a1665404601e5ba32f8cc5e5815fd00b49ac7b204b544d69`. The change is limited to canonical account/role identity helpers, server-written `user_auth_index`, immutable profile identity/email, server-only profile creation, the recursive profile child-rule fix and explicit private account namespaces. Other collection blocks retain the deployed baseline. Public profile reading and existing unrelated feature policies remain at that baseline; this is not the repository's complete pending Rules rollout.

## Validation

The selected Functions compiled. The actual-baseline Rules comparison passed 96 checks; two unbound migrated staff operations require checked setup, and all corresponding bound operations passed. A real Auth/Firestore emulator walkthrough passed six backend groups and 40 Rules checks, including original profile preservation, exact retry, current content, conflict rejection, protected namespace denial, owner editing and migrated DM/feed access. Earlier full account/profile regressions and 4,357 client tests passed at the source checkpoint.

## Release commands

From the repository root, deploy the two named Functions first, then recheck that the live Rules baseline has not changed before releasing the tested Rules:

```powershell
node ../qa-tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --only functions:ensureAccountProfile,functions:claimProfileByEmail --project vybe-daaab --config firebase.profile-bootstrap.json --non-interactive
node ../qa-tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --only firestore:rules --project vybe-daaab --config firebase.profile-bootstrap.json --non-interactive
```

Use the authenticated official Firebase CLI; never pass tokens on the command line. Do not deploy the whole default Rules file or all Functions. Record completion, deployed ruleset/hash and public callable rejection in `WORKLOG.md`. Reachability alone does not verify the user's profile or phone persistence. The user should retry in the existing signed-in phone session.

Changed-UID recovery remains separately gated by independently reviewed private evidence and explicit user confirmation. Do not approve recovery records or retire identities under this normal-owner release; the wider `requireAdmin` consumer rollout remains pending. Fresh email-code sign-in has its separate matching-service requirements in [SIGN_IN_RECOVERY.md](../../docs/SIGN_IN_RECOVERY.md), including the existing `auth2faRequest` restriction.

Rollback must preserve durable bindings and receipts. Do not restore the historical ownership-changing claiming endpoint or reenable raw profile/index ownership writes.
