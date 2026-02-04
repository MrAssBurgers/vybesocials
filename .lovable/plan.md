

# Comprehensive Fix & Enhancement Plan

This plan addresses 15+ issues and enhancements across the VYBE app, organized into logical sections.

---

## Section 1: Notification & Animation Fixes

### 1.1 Fix DM Notification Hold Outline Glitch
**Problem:** When holding the in-app DM notification, the outline goes to the middle of the notification instead of staying around the edge.

**Solution:** Replace the outline behavior with a scale-down effect on press.

**File:** `src/components/notifications/MessageNotificationToast.tsx`
- Remove any `outline` or `ring` classes that shift during press
- Ensure the pressed state only uses `scale: 0.97` (already implemented)
- Add `outline: none !important` to override any inherited styles
- Wrap with a static container that doesn't animate to prevent outline shift

### 1.2 Add Send Message "Fly Away" Animation
**Problem:** No cool animation when sending a message.

**Solution:** Create a "bubble fly" animation where the text creates a bubble that flies to the message position.

**File:** `src/components/chat/ChatView.tsx`
- Add state `flyingMessage` to track the message being sent
- On send, capture the input position and animate a bubble from input to message list
- Use Framer Motion's `useAnimate` for programmatic animation
- After animation completes (150-200ms), add to messages array

---

## Section 2: Typing Indicator & Presence Fixes

### 2.1 Fix Typing Indicator Animation
**Problem:** The "Typing..." text animates up/down repeatedly instead of just the dots animating.

**Solution:** Remove the AnimatePresence wrapper that causes the whole text to animate.

**File:** `src/components/chat/SnapchatFeedback.tsx` (LivePresenceBar component)
- Change from AnimatePresence that re-renders on text change
- Make "typing" static text and only animate the dots separately
- Use a simpler approach: static "typing" text with CSS-animated dots

**Current (problematic):**
```tsx
<AnimatePresence mode="wait">
  <motion.span key={getStatusText()} ...>
    {getStatusText()}
  </motion.span>
</AnimatePresence>
```

**Fixed approach:**
```tsx
{isTyping ? (
  <span className="text-primary text-xs font-medium">
    typing<TypingDots />
  </span>
) : (
  <motion.span ...>{getStatusText()}</motion.span>
)}
```

### 2.2 Fix Active User PFP Size & Separation
**Problem:** When someone is active in chat, their pfp size doesn't match the sent message pfp and isn't cleanly separated.

**File:** `src/components/chat/ChatPresenceIndicator.tsx`
- Increase avatar size from `h-7 w-7` to `h-8 w-8` to match message bubbles
- Add more gap between the typing bubble and avatar
- Add visual separation with a subtle border/shadow

---

## Section 3: Incoming Message Animation

### 3.1 Add "Pop Into Existence" Animation for Incoming Messages
**Problem:** No cool animation when someone sends a message.

**Solution:** Create a transformation animation where the typing indicator morphs into the actual message.

**File:** `src/components/chat/ChatView.tsx`
- Track `incomingMessageId` state
- When a new message arrives from another user:
  1. If they were typing, animate the typing bubble transforming into the message
  2. If not typing, use a "pop" entrance animation (scale from 0.8 to 1 with spring)
- Add `layoutId` for shared element transition between typing and message

**Animation sequence:**
1. Typing bubble shrinks slightly
2. Cross-fade to message bubble at same position
3. Message bubble "settles" with spring animation

---

## Section 4: VYBE Hub Animation Fixes

### 4.1 Fix VYBE Hub Animations
**Problem:** Animations are glitchy and not smooth.

**File:** `src/components/hub/VYBEHub.tsx`
- Replace spring animations with simpler eased tweens
- Add `will-change: transform, opacity` to animated elements
- Reduce animation complexity by removing nested animations
- Use consistent timing: 0.2s for entrance, 0.03s stagger
- Remove the animated gradient border that causes performance issues

---

## Section 5: Color Film/Glow Issue

### 5.1 Remove Unwanted Color Film/Glow on Display Names and Logo
**Problem:** There's a color film over display names, VYBE logo, and onboarding elements on mobile/tablet.

**Root cause:** The `StyledDisplayName` component applies `filter: contrast(1.1) brightness(1.08)` for the shine effect, which creates a glow. Additionally, the VYBE logo uses CSS drop-shadow filters.

**Files to modify:**
- `src/components/badges/StyledDisplayName.tsx` - Remove or reduce the filter effects
- `src/components/ui/VYBELogo.tsx` - Reduce or remove drop-shadow filter intensity
- `src/index.css` - Check for any global glow effects being applied

**Fix for StyledDisplayName:**
```tsx
// Remove the filter that causes the glow
const shinyStyle = {
  ...style,
  textShadow: '0 1px 2px rgba(255,255,255,0.4)', // Keep subtle shine
  // Remove: filter: 'contrast(1.1) brightness(1.08)'
};
```

**Fix for VYBELogo:**
- Reduce filter intensity from `drop-shadow(0 0 4px ...)` to `drop-shadow(0 0 2px ...)`
- Only apply on hover, not by default

---

## Section 6: Vybe Snap Complete Revamp

### 6.1 Fix Camera Inversion (Still Showing Opposite Side)
**Problem:** The camera still shows the opposite side despite previous fix attempts.

**Root cause:** The canvas mirroring is applied but may not be working correctly on all devices.

**File:** `src/components/chat/SnapCamera.tsx`
- Apply `scaleX(-1)` transform to the video preview consistently
- Ensure the captured image is NOT mirrored (what user sees = what is captured)
- Add debug logging to verify camera facing mode

### 6.2 Revamp Vybe Snap UI (Modern, Clean Design)
**File:** `src/components/chat/SnapCamera.tsx`
- Redesign the camera UI with a cleaner, more modern look:
  - Frosted glass controls at bottom
  - Cleaner capture button (ring animation on tap)
  - Minimalist icons (no cluttered toolbars)
  - Better text editing overlay with Snapchat-style fullscreen input
- Improve text presets with better visual distinction
- Add color picker as a swipeable carousel

### 6.3 Vybe Snap Opened Status Sync
**Problem:** When a vybe is opened, it should show "Opened" status like Snapchat.

**Files:**
- `src/components/chat/VybeViewer.tsx` - Already has `onViewed` callback
- `src/hooks/useMessages.ts` - Add mutation to mark vybe as viewed
- `src/components/chat/ConversationList.tsx` - Show "Opened" instead of preview text

**Database consideration:** May need to add `viewed_at` column to messages or use existing metadata.

### 6.4 Prevent Vybe Re-Opening After Viewed
**Problem:** After refreshing or switching chats, already-viewed vybes can be re-opened.

**Solution:**
- Store viewed state in database (not just local state)
- On page load, check if vybe was already viewed
- If viewed, show "Opened" indicator instead of playable vybe

**File:** `src/components/chat/ChatView.tsx`
- Pass `isViewed` prop to VybeViewer based on message.viewed_at

### 6.5 Cleaner Vybe Snap Appearance in Chat
**Problem:** Vybe snaps don't look nice when sent.

**File:** `src/components/chat/ChatView.tsx` (message rendering)
- Add special rendering for `media_type === 'vybe'`:
  - Rounded preview with gradient border
  - "VYBE" badge with sparkle icon
  - Tap-to-view overlay with play icon
  - Status indicator (Sent/Opened)

---

## Section 7: Content Safety & Age Restrictions

### 7.1 Enhanced Sensitivity Settings in Onboarding
**Problem:** Need clearer sensitivity options with age-based restrictions.

**Files:**
- `src/components/onboarding/SensitivitySettings.tsx` - Revamp with 3 clear tiers
- `src/pages/Onboarding.tsx` - Add age collection step

**New sensitivity tiers:**
1. **Completely Protected** - No mature content, profanity blocked, AI scans everything
2. **Moderately Filtered** - Warnings before mature content, some AI scanning
3. **Unfiltered** - No restrictions (only available to 18+)

### 7.2 Add Age Collection to Onboarding
**File:** `src/pages/Onboarding.tsx`
- Add new step before sensitivity settings
- Collect date of birth (or age range)
- If under 16: Cannot select "Unfiltered" option
- If under 18: "Unfiltered" shows warning

**New component:** `src/components/onboarding/AgeSetup.tsx`
- Date of birth picker
- Age verification with clear explanation

### 7.3 Content Safety Based on User Settings
**Problem:** AI scanning should respect both users' settings in a DM.

**File:** `src/components/chat/DMImageSafetyGate.tsx`
- Check BOTH sender and receiver sensitivity settings
- If either has "Completely Protected": Always scan
- If both have "Unfiltered": Skip scanning
- Show message explaining the safety requirements

**File:** `src/hooks/useDMSettings.ts`
- Add function to get both users' sensitivity preferences
- Return the more restrictive of the two

### 7.4 Video Profanity Detection & Filtering
**Problem:** Videos with profanity should be handled based on user settings.

**Files:**
- `supabase/functions/scan-video-safety/index.ts` - Add profanity detection
- `src/components/clips/OptimizedClipsPlayer.tsx` - Add warning overlay
- `src/pages/Shorts.tsx` - Filter videos based on user settings

**Implementation:**
- For "Completely Protected": Don't show videos flagged with profanity
- For "Moderately Filtered": Show warning dialog before playing
- For "Unfiltered": Show all content

---

## Section 8: Database Changes Needed

### 8.1 New Fields Required
**profiles table:**
- `date_of_birth` - Date field for age verification
- `age_verified` - Boolean to track verification status

**messages table:**
- `viewed_at` - Timestamp for when vybe was opened

### 8.2 New Settings Fields
**profiles table (existing sensitivity_preference update):**
- Ensure values are: 'protected', 'moderate', 'unfiltered'

---

## Implementation Priority

### Phase 1 - Critical UX Fixes (High Priority)
1. Notification hold outline fix
2. Typing indicator animation fix
3. Camera inversion fix
4. Color film/glow removal

### Phase 2 - Animation Enhancements (Medium Priority)
5. Send message fly animation
6. Incoming message pop animation
7. VYBE Hub animation smoothness

### Phase 3 - Vybe Snap Overhaul (Medium Priority)
8. Vybe Snap UI revamp
9. Opened status sync
10. Re-opening prevention
11. Cleaner chat appearance

### Phase 4 - Content Safety System (Lower Priority)
12. Enhanced sensitivity settings
13. Age collection
14. Content safety integration
15. Video profanity filtering

---

## Technical Considerations

### Animation Performance
- Use `will-change: transform, opacity` only on elements that will animate
- Prefer `transform` and `opacity` over other properties
- Use `translateZ(0)` to force GPU acceleration
- Avoid animating multiple properties simultaneously on iOS

### Database Migrations
- Add `date_of_birth` to profiles: `ALTER TABLE profiles ADD COLUMN date_of_birth DATE`
- Add `viewed_at` to messages: `ALTER TABLE messages ADD COLUMN viewed_at TIMESTAMPTZ`

### Cross-User Content Safety
- Query both users' preferences when determining safety scan requirements
- Cache preferences to avoid repeated queries
- Use optimistic UI while checking

---

## Summary

This comprehensive plan addresses:
- **4 animation/UX bugs** (notification, typing, hub, color film)
- **3 new animations** (send, receive, vybe)
- **5 Vybe Snap improvements** (camera, UI, status, prevention, appearance)
- **4 content safety features** (settings, age, scanning, filtering)

Total files to modify: ~15-20
New files to create: 1-2 (AgeSetup component)
Database migrations: 2 columns

