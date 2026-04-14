

## VYBE Ultimate Experience Upgrade — 10 Changes

All 10 items from the previous plan, with one adjustment: **Item 10 (Performance)** will keep the Daily Brief widget loading eagerly above the fold alongside greeting, stories, and feed.

### Batch 1 — Highest Impact

**1. Fix Empty States (Silent App Killer)**
- Seed For You feed with staff-picked/popular posts for users with 0 following
- Fix `useQuickAddSuggestions.ts` fallback query to always return users
- Add "Post your first VYBE" CTA widget for users with 0 posts
- Add "Find Friends" card in empty DM list
- Files: `useQuickAddSuggestions.ts`, `ConversationList.tsx`, `HomeWidgetRenderer.tsx`, feed hooks

**2. Vibe Check Status System**
- Quick-tap mood/activity selector (listening, gaming, chilling, working out, studying)
- Glowing avatar ring color + emoji visible in DMs, Quick Add, profiles
- Auto-clears after 4 hours
- Files: `StatusPicker.tsx` rewrite, new `AvatarRing.tsx`, `ConversationList.tsx`

**3. Conversation Reactions (iMessage-style)**
- Long-press message → floating emoji row (heart, laugh, wow, sad, fire, 100)
- Reactions appear as small badges below message bubble
- Files: `ChatView.tsx`, `MessageBubble.tsx`, new `MessageReactionBar.tsx`

### Batch 2 — Differentiators

**4. Profile Bento Grid**
- Draggable, resizable blocks: bio, pinned post, music taste, badges, mutual friends, mood widget
- Users design their own profile layout — no other app has this
- Files: `Profile.tsx`, new `ProfileBentoGrid.tsx`, new `ProfileBentoEditor.tsx`

**5. Smart Notification Grouping**
- Group: "Sarah and 12 others liked your post", "3 new friend requests"
- Priority tab for meaningful notifications vs passive ones
- Files: `Notifications.tsx`, `useNotifications.ts`

**6. Immersive Feed Mode**
- Optional toggle on For You tab: snap-to-card full-viewport scroll
- Media fills screen, text posts get frosted card
- Default stays as current list scroll
- Files: `HomeWidgetRenderer.tsx`, new `ImmersiveFeedMode.tsx`

### Batch 3 — Polish

**7. Spotlight Search**
- Full-screen overlay with tabs: People, Posts, Sounds, Communities
- AI natural language search using existing Lovable AI integration
- Files: `HeaderSearch.tsx` rewrite, new `SpotlightSearch.tsx`

**8. Interactive Story Templates**
- Polls, Q&A, "this or that," music rating, countdown timers
- Customizable colors per template
- Files: `StoriesBar.tsx`, new `StoryTemplates.tsx`, new `InteractiveStoryViewer.tsx`

**9. Onboarding "Design Your VYBE"**
- After current onboarding: 3-tap flow to pick color accent, background style, vibe (dark/light/auto)
- Leverages existing `AIVybeDesigner.tsx`
- Files: `Onboarding.tsx`

**10. Performance: Lazy-Load Below-Fold Widgets**
- Eagerly load: Greeting + Daily Brief + Stories + Feed tabs (above the fold)
- Lazy-mount everything else (XP bar, discovery cards, battle pass, creator analytics) via `IntersectionObserver`
- ~40% faster first paint
- Files: `HomeWidgetRenderer.tsx`

### What Stays the Same
- All customization features (themes, backgrounds, widgets, jiggle mode)
- Safety systems (AI content scanning, parental controls, age gating)
- Colorful, expressive brand identity
- All existing hooks and backend infrastructure

