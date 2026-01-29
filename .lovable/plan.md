
# VYBE Stability & Sound Design Polish Plan

## Overview
This plan addresses 5 key areas:
1. **Toast notification z-index fix** - Move toasts in front of other UI layers
2. **DM chat scroll fix** - Ensure bottom nav doesn't block chat messages
3. **Navigation transition fix** - Remove glitchy black delays when switching tabs
4. **Premium sound design refinement** - Polish notification & call sounds
5. **Custom ringtone upload feature** - Allow users to upload custom tones

---

## 1. Toast/Notification Z-Index Fix

**Problem**: Toast notifications appear behind other UI elements (screenshot shows toast behind sidebar).

**Root Cause**: Sonner toaster doesn't have an explicit z-index set, while other elements like the BottomNav use `z-index: 5002` and overlays use `z-[9999]`.

**Solution**:
- Update `src/components/ui/sonner.tsx` to include explicit positioning with `z-[99998]` (just below tutorial overlay)
- Add `position` prop set to `"top-center"` for better mobile visibility

**Files to modify**:
- `src/components/ui/sonner.tsx`

---

## 2. DM Chat Scroll / Bottom Nav Fix

**Problem**: Messages at the bottom of the chat get hidden behind the bottom navigation bar on mobile.

**Root Cause**: The ChatView message input area has `pb-[max(0.75rem,env(safe-area-inset-bottom))]` but doesn't account for the bottom nav height on mobile when not in full-screen mode.

**Solution**:
- Add extra bottom padding to the message container when bottom nav is visible
- The messages container needs padding so the last message scrolls above the nav
- Update the MessageInputArea to have proper safe-area handling

**Files to modify**:
- `src/components/chat/ChatView.tsx` - Add bottom padding accounting for bottom nav

---

## 3. Navigation Transition Fix (Remove Glitchy Black)

**Problem**: When switching tabs, there's a noticeable black flash/glitchy transition.

**Root Cause**: 
- `AnimatePresence` with `mode="wait"` causes a fade-to-opacity-0 before the new route fades in
- The `min-h-screen` wrapper combined with opacity:0 creates the "black" flash effect
- Lazy loading adds additional delay

**Solution**:
- Change AnimatePresence mode from `"wait"` to `"sync"` for overlapping transitions
- Remove exit animation entirely (only animate in, not out)
- Add `initial={false}` to prevent initial animation on first load
- Reduce lazy loading by prefetching common routes
- Ensure background color persists during transition

**Files to modify**:
- `src/components/layout/AnimatedRoutes.tsx`

---

## 4. Premium Sound Design Refinement

**Problem**: Some sounds need polish to feel soft, satisfying, and premium (no harsh tones).

**Current State**: Already has a good foundation in `premiumSounds.ts` with WebAudio synthesis.

**Enhancements**:

### Refined Sound Profiles:
| Sound | Current | Enhancement |
|-------|---------|-------------|
| Message Receive | Quick pop | Lower frequencies, warmer tone, slight reverb feel |
| Notification | Crystal chime | Softer attack, more "glass tap" feel |
| Message Send | Tick | Quieter, more subtle whoosh |
| Call Ring | Ascending arpeggio | Lower volume peaks, more harmonic |
| UI Tap | Quick click | Nearly silent, just tactile |

### Technical Changes:
- Lower base frequencies (shift down ~100Hz across the board)
- Increase fade-in time (attack) from 8ms to 15ms
- Reduce peak volumes by 20-30%
- Add subtle detuning for warmth
- Longer decay tails for smoothness

**Files to modify**:
- `src/lib/premiumSounds.ts` - Refine all sound configurations

---

## 5. Custom Ringtone Upload Feature

**New Feature**: Allow users to upload custom audio files for message tones and call ringtones.

### Database Schema:
```sql
CREATE TABLE user_custom_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sound_type TEXT NOT NULL CHECK (sound_type IN ('message_tone', 'call_ringtone')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  duration_seconds NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, sound_type)
);

-- RLS policies
ALTER TABLE user_custom_sounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sounds" ON user_custom_sounds FOR ALL 
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Storage:
- Create new bucket: `custom-sounds` (private, user-scoped)

### UI Components:
New `CustomRingtoneUploader.tsx` with:
- File input accepting MP3, WAV, M4A
- Audio waveform preview (using WebAudio for visualization)
- Duration validation (message: 5s max, ringtone: 15s max)
- Trim controls with start/end sliders
- Preview playback button
- Save/cancel actions

### Settings Integration:
Update `NotificationSoundSection.tsx`:
- Add "Custom Tones" expandable section
- Show current custom tone name if set
- Upload button for each category
- "Reset to default" option

### Sound Playback Updates:
Update `premiumSounds.ts`:
- Check localStorage for custom sound preferences
- Fetch and cache custom audio files
- Fall back to default if custom fails

**Files to create**:
- `src/components/settings/CustomRingtoneUploader.tsx`
- `src/hooks/useCustomSounds.ts`

**Files to modify**:
- `src/components/settings/NotificationSoundSection.tsx`
- `src/lib/premiumSounds.ts`
- Database migration for `user_custom_sounds` table

---

## Implementation Order

1. **Toast z-index fix** (quick win, immediate impact)
2. **Navigation transition fix** (high visibility improvement)
3. **DM scroll fix** (critical UX issue)
4. **Sound design refinement** (polish)
5. **Custom ringtone upload** (new feature)

---

## Technical Details

### Toast Z-Index Fix (`sonner.tsx`):
```tsx
<Sonner
  position="top-center"
  toastOptions={{
    classNames: {
      toast: "... z-[99998] ..."
    }
  }}
  style={{ zIndex: 99998 }}
  {...props}
/>
```

### Navigation Transition Fix (`AnimatedRoutes.tsx`):
```tsx
<AnimatePresence mode="sync" initial={false}>
  <motion.div
    key={getRouteKey()}
    initial={{ opacity: 0.6 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.1, ease: 'linear' }}
    className="min-h-screen bg-background"
  >
```

### Chat Padding Fix (`ChatView.tsx`):
```tsx
// In the messages container
<div className="... pb-20 md:pb-4 ...">
```

### Sound Refinement Example (`premiumSounds.ts`):
```typescript
notification: {
  frequencies: [880, 1047, 1319, 1568], // Lower frequencies
  durations: [0.15, 0.12, 0.10, 0.18],
  volumes: [0.08, 0.06, 0.05, 0.04], // 30% quieter
  delays: [0, 0.05, 0.10, 0.15],
}
```

---

## Expected Outcomes

- Toasts always visible above all UI elements
- Chat messages fully scrollable above bottom nav
- Instant, smooth tab transitions with no black flash
- Softer, more satisfying notification sounds
- Users can personalize their notification experience
