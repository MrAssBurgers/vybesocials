

## Announcement Media Upload — Images, Videos, and GIF Conversion

### What changes

Replace the "paste image URL" field in announcement creation/editing with a proper file upload from device. Support images, videos, and an option to convert uploaded videos into auto-looping GIFs. Reorder the modal layout so media sits between the title and description.

### Database Migration

Add a `media_type` column to `announcements` to distinguish between image, video, and gif:

```sql
ALTER TABLE public.announcements ADD COLUMN media_type TEXT DEFAULT 'image';
```

### Storage Bucket

Create an `announcements` storage bucket (private, with RLS for admin/mod upload and public read):

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('announcements', 'announcements', true, 52428800, 
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm']);
```

RLS policies: authenticated users with admin/moderator role can upload; anyone can read.

### 1. Create `useAnnouncementUpload` hook

New hook in `src/hooks/useAnnouncementUpload.ts`:
- Accept a `File` from device
- Upload to `announcements/{timestamp}-{filename}` in storage
- Return the public URL
- Detect media type from file MIME (image/video)

### 2. Update `CreateAnnouncementDialog`

- Replace URL text input with a file picker button (camera/gallery icon)
- Accept image and video files
- Show upload progress and preview (image thumbnail or video player)
- Add a "Convert to GIF" toggle/checkbox that appears when a video is selected
- When "Convert to GIF" is enabled, use an edge function or client-side `gifshot`/canvas approach to extract frames and create a GIF
- Pass `media_type` ('image' | 'video' | 'gif') alongside `image_url` to the mutation

### 3. Update `EditAnnouncementDialog`

- Same file upload UI as Create dialog
- Show existing media with option to replace or remove
- Support the same GIF conversion toggle for videos

### 4. Update `useCreateAnnouncement` and `useUpdateAnnouncement`

- Accept `media_type` parameter
- Include `media_type` in insert/update calls

### 5. Update `Announcement` interface

Add `media_type` field:
```typescript
export interface Announcement {
  // ...existing
  media_type: 'image' | 'video' | 'gif' | null;
}
```

### 6. Update `AnnouncementModal` — Reorder layout

Change the open letter layout to: **Title → Media → Description**

- For `image`: Show `<img>` (as now)
- For `video`: Show `<video>` with controls, muted autoplay
- For `gif`: Show `<img>` with the GIF URL (auto-loops natively) or `<video loop muted autoplay playsinline>` if stored as mp4

### 7. Update `AdminAnnouncementsSection`

- Show video/gif thumbnails in the list (use `<video>` element for videos, `<img>` for gif/image)

### 8. GIF Conversion — Client-Side Approach

Use the `gifshot` library to convert video to GIF on the client:
- When user toggles "Convert to GIF", extract frames from the video using canvas
- Generate a GIF blob and upload it to the `announcements` bucket
- Store as `media_type: 'gif'`

### Files Summary

| File | Action |
|------|--------|
| Migration SQL | Add `media_type` column, create `announcements` storage bucket + RLS |
| `src/hooks/useAnnouncementUpload.ts` | Create — file upload to storage |
| `src/hooks/useAnnouncements.ts` | Edit — add `media_type` to interface and mutations |
| `src/components/announcements/CreateAnnouncementDialog.tsx` | Edit — file picker, preview, GIF toggle |
| `src/components/announcements/EditAnnouncementDialog.tsx` | Edit — same upload UI |
| `src/components/announcements/AnnouncementModal.tsx` | Edit — reorder to Title→Media→Description, render video/gif |
| `src/components/admin/sections/AdminAnnouncementsSection.tsx` | Edit — video/gif thumbnails |
| `package.json` | Add `gifshot` dependency |

