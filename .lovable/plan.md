

## Plan: Move AI Scan to Post-Time + Appeal Flow + Mod Review + Resume Posting

### Current Flow (broken)
1. User takes photo/video → edits → **AI scans immediately** → if blocked, content is discarded
2. No way to appeal, no mod review, no resume

### New Flow
1. User takes photo/video → edits → goes straight to share/compose (NO scan)
2. User clicks "Post" → AI scan runs **at post time**
3. If **passed**: post publishes normally
4. If **blocked**: show "Failed Vybe Check" screen with options to **Edit** or **Appeal**
5. Appeal goes to admin Appeals section (already exists)
6. Mod reviews → approves → user gets a **notification** with a "Continue posting" deep link
7. User taps notification → resumes composer with their saved content

### Changes

**1. Remove pre-scan from Camera flow**
- `Camera.tsx` / `CameraWithSound.tsx`: Remove the `'scanning'` state entirely. After edit, go straight to `'share'`
- `CameraSafetyGate.tsx`: No longer used in camera flow (keep file for potential reuse)

**2. Move scan to post-time in composers**
- `MobilePostComposer.tsx`: Remove the `useEffect` that scans on mount. Instead, in `handleSubmit`, run the safety scan **before** uploading. If blocked, show a "Failed Vybe Check" overlay with Edit/Appeal buttons
- `DesktopCreateStudio.tsx`: Same — move scan from component mount to the publish action
- `CameraShareSheet.tsx`: If this is used for stories/clips, add scan at share time too

**3. "Failed Vybe Check" overlay component**
- New: `src/components/safety/VybeCheckFailed.tsx`
  - Shows the scan result (what was flagged)
  - "Edit Post" button → goes back to editor
  - "Appeal" button → submits to `content_appeals` table with a reference to the draft content
  - Saves draft data (files, caption, tags) to localStorage so it can be resumed

**4. Appeal approval → notification**
- `AdminAppealsSection.tsx`: When mod approves an appeal, insert a notification into the `notifications` table with type `'appeal_approved'` and metadata containing the draft info
- Add `content_id` and `draft_data` columns to `content_appeals` so we can store the pending post's files/caption/tags

**5. Resume posting from notification**
- In the notification tap handler, if type is `'appeal_approved'`, navigate to `/create?resume=<appeal_id>`
- `MobilePostComposer` / upload page: check URL params, load draft from localStorage, pre-populate composer

### Database Migration

```sql
-- Add columns to content_appeals for draft resumption
ALTER TABLE public.content_appeals 
  ADD COLUMN IF NOT EXISTS draft_caption text,
  ADD COLUMN IF NOT EXISTS draft_tags text[],
  ADD COLUMN IF NOT EXISTS draft_media_urls text[],
  ADD COLUMN IF NOT EXISTS content_category text,
  ADD COLUMN IF NOT EXISTS scan_reason text;
```

### Files to Change

| File | Change |
|------|--------|
| `src/components/camera/Camera.tsx` | Remove `scanning` state, skip to `share` after edit |
| `src/components/camera/CameraWithSound.tsx` | Same — remove scanning state |
| `src/components/create/MobilePostComposer.tsx` | Move scan to `handleSubmit`, show VybeCheckFailed on block |
| `src/components/create/DesktopCreateStudio.tsx` | Move scan to publish action |
| `src/components/camera/CameraShareSheet.tsx` | Add scan at share time for stories/clips |
| New: `src/components/safety/VybeCheckFailed.tsx` | Failed scan overlay with Edit/Appeal |
| `src/components/admin/sections/AdminAppealsSection.tsx` | On approve, create notification for user |
| `content_appeals` table | Add draft columns via migration |

