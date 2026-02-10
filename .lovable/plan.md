
# Owner Settings Revamp

## What's Changing

The current Owner Settings page (`AdminSettings.tsx`) and the duplicated owner block in `DeveloperSection.tsx` will be consolidated into a single, polished, all-in-one Owner Settings page. Right now there are redundant components (`SecretsManagerSection`, `StripeSettingsSection`) and the settings page in `DeveloperSection.tsx` also renders its own copy. This revamp unifies everything into one clean experience with a proper setup wizard feel.

## New Design: Single-Page Command Center

The new `AdminSettings.tsx` will be a single scrollable page with a clear top-to-bottom flow -- like a setup checklist. Each section shows a live status indicator so you know instantly what's configured and what's missing.

### Layout

```text
+------------------------------------------+
|  [Crown] Owner Command Center            |
|  Platform-wide configuration             |
+------------------------------------------+
|                                          |
|  SYSTEM STATUS BAR                       |
|  [Stripe: Active] [Secret Key: Set]      |
|  [Webhook: Not Set] [Mode: Test]         |
|                                          |
+------------------------------------------+
|  SECTION 1: Payment Processing           |
|  +--------------------------------------+|
|  | Enable Stripe         [====toggle]   ||
|  | Mode            [Test v]             ||
|  | Publishable Key [pk_test_...] [eye]  ||
|  +--------------------------------------+|
|                                          |
|  SECTION 2: Server-Side Keys             |
|  +--------------------------------------+|
|  | Stripe Secret Key    [Set]  [Update] ||
|  | Webhook Secret       [---]  [Set]    ||
|  +--------------------------------------+|
|                                          |
|  SECTION 3: Validation & Sync            |
|  +--------------------------------------+|
|  | [Run Full Validation]                ||
|  | Last validated: 2 min ago            ||
|  | Results: All checks passed           ||
|  +--------------------------------------+|
|                                          |
|  [======== Save All Settings =========]  |
+------------------------------------------+
```

## Key Improvements

1. **Status dashboard at the top** -- Colored badges showing the live state of every key/config. At a glance you see what's done and what needs attention.

2. **Unified save flow** -- Stripe config (enable/mode/publishable key) saves to the `stripe_config` table. Secret keys save via the `manage-secrets` edge function. Both happen in one smooth flow. After saving, auto-validation runs and results display inline.

3. **Auto-validation on save** -- After saving, the `validate-stripe-config` edge function runs automatically. Results (secret key mode match, key presence) display below in a checklist format showing green/red for each check.

4. **DevTools sync** -- After any save, the query cache is invalidated for `admin-stripe-config`, `admin-secret-statuses`, and `stripe-config-status` so the DevTools panel (`ProductionDebugPanel`) picks up changes instantly without a manual refresh.

5. **Remove duplication** -- The Owner Settings block currently embedded inside `DeveloperSection.tsx` (lines 68-105) will be replaced with a simple link/button to `/admin-settings`, removing the duplicate `SecretsManagerSection` and `StripeSettingsSection` renders from the settings page.

## Technical Details

### Files Modified

**`src/pages/AdminSettings.tsx`** -- Complete rewrite:
- Merge all Stripe config + secrets management into one page
- Top status bar with live badges for: Stripe enabled/disabled, mode, secret key, webhook secret, publishable key
- Section 1: Payment toggle, mode selector, publishable key input (all from `stripe_config`)
- Section 2: Secret key rows using `manage-secrets` edge function (inline edit with save)
- Section 3: Validation panel -- button to run `validate-stripe-config`, shows results as a checklist
- Single "Save Settings" button at bottom for Stripe config; secrets save individually inline
- After any save, invalidate all related query keys so DevTools + rest of app see changes immediately
- Uses `useQuery` + `useMutation` from TanStack for clean data flow

**`src/components/settings/DeveloperSection.tsx`** -- Remove the owner settings block (lines 68-105) and replace with a navigation button:
- Show a "Owner Command Center" card with a button linking to `/admin-settings`
- Remove imports of `SecretsManagerSection` and `StripeSettingsSection`

**`src/components/admin/settings/SecretsManagerSection.tsx`** -- Delete (no longer needed, logic moves into AdminSettings)

**`src/components/admin/settings/StripeSettingsSection.tsx`** -- Delete (no longer needed, logic moves into AdminSettings)

### Edge Functions (No Changes Needed)
- `manage-secrets` -- Already works correctly (list + set actions)
- `validate-stripe-config` -- Already validates and returns status
- `check-debug-secrets` -- Already reads from both env + app_secrets
- `_shared/stripe-key.ts` -- Already resolves keys with DB fallback

### Data Flow on Save
1. Owner changes settings and clicks Save
2. Stripe config (enabled, mode, publishable key) saves to `stripe_config` table
3. If any secret key fields were edited, they save via `manage-secrets` edge function
4. `validate-stripe-config` runs automatically post-save
5. Results display inline as a validation checklist
6. Query cache invalidated -- DevTools panel, any subscription checks, and all Stripe-related queries update instantly
7. All backend functions already read from `app_secrets` table via `getStripeSecretKey()`, so changes are live for all users immediately
