

## Announcement System Revamp — Letter-Style Modal

### What changes

Replace the top banner announcement with a centered modal "letter" that appears on the home screen. Add image support to announcements. Redesign the admin panel creation form to support images.

### Database Migration

Add `image_url` column (nullable text) to the `announcements` table so announcements can optionally include an image.

### 1. Replace `AnnouncementBanner` with `AnnouncementModal`

**Delete**: `src/components/announcements/AnnouncementBanner.tsx`
**Create**: `src/components/announcements/AnnouncementModal.tsx`

- **Closed state**: A floating rounded-square pill centered on the home screen with a mail emoji (📬) and "New Announcement!" text. X button in top-right corner to dismiss without reading. Entrance animation: scale up from 0 with a slight bounce + fade in.
- **Open state (tap "Open")**: Expands into a full letter-style modal with:
  - Title at the top (bold, large)
  - Optional image below the title (rounded corners, fills width)
  - Description/content below the image (or directly below title if no image)
  - "Posted by @username" footer
  - Close/dismiss button
- Smooth framer-motion transitions between closed pill → open letter
- Backdrop overlay when open

### 2. Update `Home.tsx`

Replace `<AnnouncementBanner />` import and usage with `<AnnouncementModal />`.

### 3. Update `useAnnouncements` hook

- Add `image_url` to the `Announcement` interface
- Include `image_url` in the select query (already uses `*` so it auto-includes, just update the type)

### 4. Update `useCreateAnnouncement`

Accept optional `image_url` parameter and pass it to the insert.

### 5. Redesign `CreateAnnouncementDialog`

- Add an image URL input field (text input for URL, or upload button)
- Preview the image if provided
- Pass `image_url` to the mutation

### 6. Redesign `AdminAnnouncementsSection`

- Show image thumbnails in the announcement list
- Show image preview in each announcement card
- Add edit capability: clicking an announcement opens an edit dialog where admin can change title, content, and image_url
- Add a new `EditAnnouncementDialog` component

### 7. Storage bucket (optional enhancement)

If you want image upload instead of URL paste, we'd need a Supabase storage bucket. For now, we'll support URL-based images which is simpler and still fully functional.

### Files Summary

| File | Action |
|------|--------|
| Migration SQL | Add `image_url` column to `announcements` |
| `src/components/announcements/AnnouncementBanner.tsx` | Delete |
| `src/components/announcements/AnnouncementModal.tsx` | Create — letter-style centered modal |
| `src/components/announcements/CreateAnnouncementDialog.tsx` | Edit — add image URL field |
| `src/components/announcements/EditAnnouncementDialog.tsx` | Create — edit existing announcements |
| `src/components/admin/sections/AdminAnnouncementsSection.tsx` | Edit — show images, add edit button |
| `src/hooks/useAnnouncements.ts` | Edit — add image_url to types and mutations |
| `src/pages/Home.tsx` | Edit — swap Banner for Modal |

