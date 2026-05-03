## What the videos show

1. **Greeting ticker grammar** — reads "1 **people** leveling up today". Should pluralize correctly.
2. **Username overflow** — `@Bakrix` (and any longer handle) extends past the right edge of the greeting card because the `<h1>` has no `min-w-0` / `truncate` and the gradient `<span>` is inline.
3. **VYBE AI Designer placeholder clipped** — "Tell me how to redesign your VY…". The `<Input>` sits in a flex row next to a Send button without `min-w-0`, so on narrow phones the placeholder text is cut off.

## Reactions verification (no code change)

- Last turn fixed the real bug: portal'd ReactionPicker bubbles were dismissing themselves before `onClick` fired. Now love/haha/wow/sad/angry/care all reach `handleReaction → likes.upsert({ reaction_type })`.
- Round-trip after refresh is already correct:
  - `get_posts_with_counts` RPC returns `reaction_type` per user.
  - `useInfinitePosts.transformPost` and `usePosts` map it onto `Post.reaction_type`.
  - `PostCard` seeds `currentReaction` from `post.reaction_type` so the heart button shows the saved emoji.
- DB shows only `like` + `haha` because no new taps have happened since the picker fix. Will populate as soon as you tap. No further work needed.

## Fixes

### 1. `src/components/home/LiveActivityTicker.tsx`
Pluralize all four messages based on count:
- `1 person is leveling up today` / `N people are leveling up today`
- `1 active chat right now` / `N active chats right now`
- `1 new post in the last 5 min` / `N new posts in the last 5 min`
- `1 reward claimed today` / `N rewards claimed today`

### 2. `src/components/home/WelcomeHeader.tsx`
Stop the username from overflowing the greeting card:
- Wrap greeting + username in a flex row with `min-w-0`.
- Add `truncate` to the username `<span>` and `whitespace-nowrap` to the "Good evening," prefix so only the handle elides with `…` if it's too long.

### 3. `src/components/ai/VYBECommandBar.tsx`
Fix the clipped placeholder:
- Wrap the `<Input>` in a `flex-1 min-w-0` div so it actually shrinks/grows correctly next to the Send button.
- Shorten the placeholder to "Redesign your VYBE…" so even on a 320px viewport it never clips.

## Out of scope
- The faint top‑edge sheen line (`h-px via-white/30`) inside the greeting card is intentional design — leaving it.
- Aurora gradients, status bar gap, wallet, NFC/push — already shipped previously.

## Files Touched
- `src/components/home/LiveActivityTicker.tsx`
- `src/components/home/WelcomeHeader.tsx`
- `src/components/ai/VYBECommandBar.tsx`
