
# Plan: Instagram-Style Share Flow and Reels-Style Shared Clips

## Overview
This plan transforms the share sheet to use Instagram's bottom send button pattern (instead of a popup modal) and redesigns how shared clips appear in DMs to match Instagram Reels' visual style.

---

## Part 1: Share Sheet - Bottom Send Button

### Current Behavior
- User clicks a friend avatar
- A modal popup appears asking "Send to [name]?"
- User must click "Send" in the popup to confirm

### New Behavior (Instagram-Style)
- User clicks a friend avatar to select/deselect them (with visual selection ring)
- A "Send" button appears fixed at the bottom of the sheet
- Multiple friends can be selected before sending
- Button shows selected count (e.g., "Send to 2 people")

### Changes to `src/components/share/ShareSheet.tsx`

1. **Replace popup modal with inline selection**:
   - Remove `showConfirm` state and confirmation modal JSX
   - Add selection ring around selected friend avatars
   - Toggle selection on click instead of opening modal

2. **Add bottom Send bar**:
   - Fixed position at bottom of sheet
   - Animates in when at least one friend is selected
   - Shows "Send" with airplane icon
   - Displays count when multiple selected

3. **Update friend button visuals**:
   - Add blue/primary ring when selected
   - Keep sent checkmark for already-sent friends
   - Animate selection state changes

---

## Part 2: Reels-Style Shared Clips in DMs

### Current Behavior
- Shared clips appear as 4:5 aspect ratio cards
- Simple thumbnail with play button overlay
- Title text at bottom

### New Behavior (Instagram Reels-Style)
- Taller 9:16 aspect ratio (like actual Reels)
- Creator avatar + username overlay at top-left
- Gradient overlays top and bottom
- "Reels" or "Clip" label badge
- View count or caption preview
- Rounded corners with subtle shadow

### Changes to `src/components/chat/SharedPostBubble.tsx`

1. **Change aspect ratio**: Update from `aspect-[4/5]` to `aspect-[9/16]` with fixed width

2. **Add creator info overlay**:
   - Fetch post author data (avatar, username)
   - Display at top-left with small avatar + username
   - Semi-transparent background for readability

3. **Add "Clip" badge**: Small badge in top-right corner

4. **Improve gradient overlays**:
   - Top gradient for creator info visibility
   - Bottom gradient for title/caption

5. **Enhanced styling**:
   - More prominent play button
   - Subtle glow/shadow effect
   - Smoother animations on tap

---

## Technical Details

### ShareSheet State Changes
```
// Remove these
- showConfirm: boolean
- selectedFriend: QuickFriend | null

// Add these  
- selectedFriends: Set<string> (track multiple selections)

// Friend click handler
handleFriendToggle(friend) {
  if (friend.sent) return;
  setSelectedFriends(prev => {
    const next = new Set(prev);
    if (next.has(friend.id)) next.delete(friend.id);
    else next.add(friend.id);
    return next;
  });
}

// Send handler
handleSendToSelected() {
  selectedFriends.forEach(friendId => sendToFriend(friendId));
}
```

### SharedPostBubble Data Fetching
```
// Extended post data query
SELECT 
  posts.id, 
  posts.media_url, 
  posts.thumbnail_url, 
  posts.caption,
  posts.type,
  profiles.id as author_id,
  profiles.username as author_username,
  profiles.avatar_url as author_avatar
FROM posts
JOIN profiles ON posts.author_id = profiles.id
WHERE posts.id = $postId
```

---

## Visual Mockups

### Share Sheet Bottom Bar
```text
+----------------------------------+
|          Share                   |
+----------------------------------+
|  [Search friends...]             |
+----------------------------------+
|  (o)    (o)    (●)    (o)       |  <- Selected friend has ring
|  Amy    Ben   Carla   Dan        |
+----------------------------------+
|  [Story] [Link] [More] [Save]   |
+----------------------------------+
|                                  |
|   +-------------------------+    |
|   |   Send to Carla    →   |    |  <- Animated in
|   +-------------------------+    |
+----------------------------------+
```

### Reels-Style DM Bubble
```text
+------------------+
| ◯ @username      |  <- Creator info
|                  |
|                  |
|        ▶        |  <- Play button
|                  |
|                  |
| Caption text...  |  <- Title
+------------------+
  (9:16 aspect)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/share/ShareSheet.tsx` | Replace popup modal with bottom send bar, multi-select support |
| `src/components/chat/SharedPostBubble.tsx` | Reels-style layout with 9:16 ratio, creator overlay |

---

## Testing Checklist

- Share a clip and verify friend selection works with visual ring
- Verify Send button appears/disappears based on selection
- Verify sending to multiple friends works
- Check shared clip appears with Reels-style layout in DM
- Verify creator info shows correctly on shared clips
- Test tap navigation on shared clips still works
