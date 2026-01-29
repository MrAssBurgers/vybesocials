

# Instagram-Style Video Sending in DMs - Implementation Plan

## How Instagram's Video Sending Works

Instagram's DM video sending experience is remarkably polished and feels instant. Here's how it works:

### 1. **Video Selection & Preview**
- When you tap the gallery icon, Instagram shows your camera roll with videos prominently displayed
- Videos show a small duration badge (e.g., "0:45") in the corner
- Tapping a video opens a **full-screen preview editor** before sending
- The preview shows the video playing in a loop with your recipient's avatar/name at the top

### 2. **Pre-Send Editing**
- You can trim the video with a timeline scrubber at the bottom
- Add text overlays, stickers, drawings
- Add music or audio effects
- The "Send" button is prominent and satisfying to tap

### 3. **Optimistic Sending**
- The moment you tap send, the video **immediately appears in the chat**
- A subtle upload progress indicator (thin ring around the thumbnail) shows background upload
- The video bubble shows a blurred preview thumbnail while uploading
- No blocking UI - you can continue chatting while it uploads

### 4. **Playback Experience**
- Video messages appear as **rounded square thumbnails** (not portrait like Reels)
- Tapping plays the video **inline** in the chat (not fullscreen)
- A second tap or long-press opens fullscreen with sound
- Videos auto-mute and loop when playing inline
- Small play/pause icon overlays the center

### 5. **Upload & Compression**
- Instagram compresses videos client-side before upload
- Uses adaptive bitrate based on network conditions
- Uploads in chunks with resume capability
- Typical compression: 720p max, optimized for mobile viewing

---

## Implementation Plan

### Phase 1: Video Preview & Edit Screen

**Create `VideoSendPreview.tsx`**
A full-screen modal that appears after selecting a video:

```text
┌─────────────────────────────────────┐
│  ← Back            Sending to: @amy │
├─────────────────────────────────────┤
│                                     │
│                                     │
│      ┌─────────────────────┐        │
│      │                     │        │
│      │    VIDEO PREVIEW    │        │
│      │    (looping)        │        │
│      │                     │        │
│      └─────────────────────┘        │
│                                     │
│   ────────────────────────────      │
│   [    Video Timeline Scrubber ]    │
│   0:00          ●──────     0:45    │
│                                     │
├─────────────────────────────────────┤
│  [  Add Caption...  ]    [ SEND → ] │
└─────────────────────────────────────┘
```

**Features:**
- Full-screen video preview with looping playback
- Trim controls (start/end handles)
- Optional caption input
- Recipient indicator at top
- Cancel and Send buttons

### Phase 2: Video Compression & Thumbnail Generation

**Create `useVideoProcessor.ts`**
Client-side video processing hook:

- **Compression**: Reduce file size using canvas/video element
- **Thumbnail extraction**: Capture frame at 1s mark
- **Duration detection**: Parse video metadata
- **Progress tracking**: Report compression progress

**Key functions:**
```typescript
interface ProcessedVideo {
  blob: Blob;
  thumbnail: string; // base64 data URL
  duration: number;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

async function processVideo(file: File): Promise<ProcessedVideo>
```

### Phase 3: Optimistic Video Messages

**Update `useInstantSend.ts`**
Add video-specific optimistic sending:

1. **Instant Preview**: Show blurred thumbnail immediately in chat
2. **Progress Ring**: Add upload progress indicator around thumbnail
3. **State Tracking**: Track upload states (processing, uploading, sent, failed)
4. **Retry Logic**: Handle upload failures gracefully

**New message states:**
```typescript
interface OptimisticVideoMessage {
  tempId: string;
  thumbnailUrl: string; // Local blob URL for instant preview
  uploadProgress: number; // 0-100
  status: 'processing' | 'uploading' | 'sent' | 'failed';
}
```

### Phase 4: Chat Video Bubble Component

**Create `VideoBubble.tsx`**
Instagram-style video message component:

```text
┌────────────────────┐
│   ┌────────────┐   │
│   │            │   │
│   │  [▶ PLAY]  │   │  ← Thumbnail with play button
│   │            │   │
│   │      0:45  │   │  ← Duration badge
│   └────────────┘   │
│                    │
│  Optional caption  │
└────────────────────┘
```

**Features:**
- Rounded thumbnail (1:1 or 4:5 aspect ratio, like Instagram DMs)
- Center play icon overlay
- Duration badge in bottom-right
- Inline playback on first tap
- Fullscreen on double-tap
- Upload progress ring while sending

### Phase 5: Inline Video Playback

**Update `MessageBubble` in `ChatView.tsx`**
Add inline video player:

- Single tap: Play/pause inline (muted)
- Double tap or long-press: Open fullscreen with sound
- Auto-pause when scrolled out of view
- Smooth transition from thumbnail to video

### Phase 6: Fullscreen Video Viewer

**Create `VideoMessageViewer.tsx`**
Instagram-style fullscreen viewer:

- Swipe up/down to dismiss
- Sound toggle
- Share button
- Reply button
- Download option
- Sender info overlay

---

## Technical Details

### Files to Create:
1. `src/components/chat/VideoSendPreview.tsx` - Pre-send preview/edit screen
2. `src/components/chat/VideoBubble.tsx` - Chat video message component
3. `src/components/chat/VideoMessageViewer.tsx` - Fullscreen video viewer
4. `src/hooks/useVideoProcessor.ts` - Client-side video compression

### Files to Modify:
1. `src/components/chat/Toybox.tsx` - Hook up video preview flow
2. `src/components/chat/ChatView.tsx` - Integrate VideoBubble, update message input flow
3. `src/hooks/useInstantSend.ts` - Add video-specific optimistic updates with progress

### Database Considerations:
- Store video thumbnail URL in messages (optional `thumbnail_url` column)
- Track video duration (optional `media_duration` column)
- No schema changes required for MVP (use existing `media_url` and `media_type`)

### Performance Optimizations:
- Compress videos client-side before upload (target: 720p, ~5MB for 1 minute)
- Generate thumbnails locally (no server round-trip)
- Use Intersection Observer for lazy video loading
- Preload video when user scrolls near

---

## Summary

This implementation brings Instagram's polished video DM experience to your app:

| Feature | Status |
|---------|--------|
| Video preview before send | ✅ New |
| Trim video before sending | ✅ New |
| Client-side compression | ✅ New |
| Optimistic UI with progress | ✅ Enhanced |
| Inline video playback | ✅ New |
| Fullscreen viewer | ✅ New |
| Duration badges | ✅ New |

The result is a video sending experience that feels instant, gives users control over what they send, and provides smooth playback without leaving the conversation.

