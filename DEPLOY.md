# DEPLOY — VYBE (`vybehub.app`)

Production web hosting is **Lovable Cloud** with custom domain **`vybehub.app`**.  
Backend is **Supabase** project **`hprmicwhlaaqfgshucec`**.

| Environment | URL |
|-------------|-----|
| Production | https://vybehub.app |
| Lovable preview | https://416714c8-d013-4aff-984d-522418a9bbc7.lovableproject.com |
| Lovable editor | https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7 |

---

## Who deploys what

| Change type | Where to ship it |
|-------------|------------------|
| React UI / `src/` | **Lovable → Share → Publish** (after git sync) |
| Supabase Edge Functions | `npx supabase functions deploy <name>` **or** Lovable Backend deploy |
| DB schema / RLS | Supabase migrations / `db pull` / manual SQL in `supabase/manual/` |
| Play Store / Despia native shell | See `PLAY_STORE_GUIDE.md` (separate from web publish) |

Cursor agents **cannot** click Lovable Publish for you. They can: build locally, push git, deploy Supabase functions, and verify `vybehub.app` after **you** publish.

---

## Standard release (Cursor → production web)

### 1. Handoff & local check

- Update `WORKLOG.md` (goal, files, blockers, next 3 tasks).
- From repo root:

```bash
npm install
npm run build
# optional: npm run lint
```

- For local dev env, use `.env.local` (gitignored). Production `VITE_*` keys are managed in **Lovable Cloud** — do not paste service-role keys into the frontend.

### 2. Sync code to Lovable

Lovable tracks this git repo. Typical flow:

```bash
git add <files>
git commit -m "describe the change"
git push origin <branch>
```

- Confirm the commit appears in Lovable (project linked to same repo).
- If you only edited in Lovable, skip push — Lovable already has those commits.

### 3. Publish web app (required for `vybehub.app`)

In Lovable:

1. Open the [VYBE project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7).
2. **Share → Publish** (production).
3. Wait for build to finish.
4. Confirm custom domain still points at this project: **Project → Settings → Domains** → `vybehub.app`.

Record in `WORKLOG.md`:

- publish date/time
- commit SHA (if known)
- anything you manually verified

### 4. Supabase (only if you changed backend)

**Link once per machine:**

```bash
npx supabase login
npx supabase link --project-ref hprmicwhlaaqfgshucec
```

**Pull remote schema into migrations:**

```bash
npx supabase db pull
```

**Deploy a single edge function** (example):

```bash
npx supabase functions deploy send-reset-email
```

**Secrets** (password reset email, AI, Stripe, etc.): set in **Lovable Cloud → Backend → Secrets**, not in git. Required examples:

- `RESEND_API_KEY` — password reset / transactional email
- `SUPABASE_SERVICE_ROLE_KEY` — edge functions (auto in Lovable)
- `LOVABLE_API_KEY` — AI gateway (auto in Lovable)

After function deploy, smoke-test the flow (e.g. forgot password, upload, AI scan).

### 5. Post-deploy smoke test (`vybehub.app`)

Hard-refresh or use a private window:

- [ ] Landing / login loads
- [ ] Sign in / sign out
- [ ] Forgot password → email or Supabase fallback
- [ ] Create → Post or Camera → capture → publish
- [ ] Feed loads without console errors
- [ ] `/reset-password` link from email (if testing auth)

Optional: test on **Play Store / Despia** app — it loads `vybehub.app` in a WebView; web publish updates the app without a store release **unless** native/Capacitor config changed.

---

## Fast path (Lovable-only edits)

If all work happened in Lovable prompts:

1. **Share → Publish** in Lovable.
2. Run the post-deploy checklist above.
3. Update `WORKLOG.md`.

No local `npm run build` required unless you also pulled the repo in Cursor.

---

## Rollback

**Web (vybehub.app):**

- Lovable: redeploy a previous known-good version from publish/history (if available), **or**
- Revert git commit → push → Publish again.

**Supabase:**

- Prefer a **forward-fix** migration; do not reset production DB.
- Revert a bad edge function: deploy the previous function code from git history.

**Mobile store:**

- Web rollback does not change the store binary; only submit a new store build if native code or `capacitor.config.ts` changed.

---

## Agent checklist (Cursor)

Before saying “deployed”:

1. `WORKLOG.md` updated.
2. `npm run build` passed (if code changed locally).
3. User published via Lovable **or** confirmed publish already happened.
4. Post-deploy smoke items checked (or user confirmed).
5. If functions/SQL changed: deploy/migration steps documented with exact commands run.

If publish credentials are missing, stop and give the user the exact unblock step (usually: **Publish in Lovable** or **Supabase login**).
