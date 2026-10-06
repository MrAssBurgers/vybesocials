# Existing shared theme recovery

Production is missing manageSharedTheme, generateThemeCode and useThemeCode. The published client and the inspected e14563a browser both use these checked services. This release restores existing theme browsing, saved themes and import codes; it adds no new client feature and migrates no historical data.

## Exact release scope

The Firestore baseline is ruleset a6562e3f-6851-4dbf-ae09-d3f59802a134, SHA256 83f4ec0377629326c5f463d27ca6f760482a7913bacd7b564555264085b41029. The candidate in this directory has SHA256 8c9ac23dca7994c7093d1168998366588b0ca2e39ab753f9facd3e9581ef069b. Only shared_themes, saved_themes and theme_likes access changes: checked services own writes and audience decisions; raw owner reads remain. Owner/staff metadata updates and deletes retain their checked restrictions. Private theme authority, code, receipt and cursor leaves are explicitly denied. Other production rules are retained exactly. Storage is unchanged.

resources.json lists only the public theme ordering index, two owner/reference indexes and _shared_theme_cursors.expireAt TTL. The three index and one TTL operations were submitted once; their exact handles remain in work/shared-theme-resource-operations.json. Do not restart pending operations or deploy the complete root index manifest. Cursor expiration is enforced by the service independently of cleanup; durable operation/code receipts have no TTL.

Release the exact candidate only after verifying the baseline hash and resource operation completion. Deploy only functions:manageSharedTheme, functions:generateThemeCode and functions:useThemeCode in vybe-daaab. No broad Functions or shared Rules deployment. These handlers already declare CPU0.083 and concurrency1 with no secrets. No Auth configuration, provider call, theme creation, code redemption or user preference change is part of verification.

## Verification

Functions build passes. Real emulator backend tests pass24 groups; separate fresh-project pagination tests pass8 groups. Exact candidate Rules pass102 assertions. Full suite passes474 files/4496 tests,6 skipped; app/native build and unchanged bundle budget pass1099.2KBraw/333.7KBgzip; lint passes with5 existing warnings. The initial combined backend/listing invocation failed because intentional malformed negative-test records were left in the same emulator project; the listing rerun used a separate project without changing production logic or concealing malformed data.

Logs: work/theme-recovery-{functions,backend,listing-isolated,rules,full,build,lint}.log. Production release and signed-in read verification remain pending at this checkpoint. Historical malformed/unsupported themes and all retained content are not automatically declared restored.

Browser release adoption also remains unresolved: browser-visible manifests differ from independent requests to the same URLs. No account storage, cache, worker or permission was cleared, and the cause is not assumed. Full phone map/clip/auth and broader app readiness remain active.
