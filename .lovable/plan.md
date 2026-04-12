

## Snapchat-Style Camera UI Revamp, DM Notes Feature, and Online Green Dots

### What we're building

1. **Revamp both camera UIs to match the Snapchat reference screenshot** — right-side vertical tool strip with labels (Flash, Sounds, HD Mode), user avatar top-left, search icon, add friend/scan icons top-right, a collapsible chevron, bottom filter carousel with category tabs (Moments, Favorites, For You, Aesthetic), Memories button, and AI lens button.

2. **Add Instagram/Snapchat-style Notes above the DM conversation list** — horizontally scrollable row of circular avatars with speech bubble "notes" above them. First item is "Your note" (current user), followed by friends' notes. Users can tap their own to set/edit a note, and see others' notes displayed as rounded speech bubbles above their avatar.

3. **Green online dot on avatars in the DM conversation list** — already partially implemented via `OnlineIndicator`, but needs to be consistently shown on the bottom-right of every user's profile picture in the conversation list when they're online.

### Technical Details

**1. Camera UI Revamp (`src/components/camera/Camera.tsx` + `src/components/camera/VybeSnapCamera.tsx`)**

Both camera components will be updated to match the Snapchat layout from the reference:

- **Top bar**: User avatar (top-left), search icon next to it, add-friend and camera-flip icons (top-right). Remove centered "VYBE" branding pill from VybeSnap.
- **Right side vertical strip**: Replace the current scattered controls with a vertical column on the right side showing icon + label pairs: Flash, Sounds, HD Mode, plus a chevron-down to collapse/expand extra tools.
- **Bottom area**: Add a "Memories" button (left of capture), an AI lens circle (between Memories and capture), keep capture button centered, add recent contacts/lenses strip to the right of capture. Add horizontal scrollable category tabs below: Moments, Favorites, For You, Aesthetic, etc.
- **Remove**: The current "Flash On/Off" pill button from VybeSnapCamera bottom, the separate flash/sound/switch buttons from VybeSnapCamera header.

**2. Notes Feature (new component + database table)**

- **New table `user_notes`**: `id uuid PK`, `user_id uuid REFERENCES auth.users NOT NULL`, `content text NOT NULL`, `created_at timestamptz DEFAULT now()`, `expires_at timestamptz DEFAULT now() + interval '24 hours'`. RLS: authenticated users can read notes from their friends, and CRUD their own.
- **New component `src/components/chat/NotesRow.tsx`**: Horizontal scroll row rendered above the conversation list in `ConversationList.tsx`. Shows current user's avatar first ("Your note" / tap to add), then friends with active notes. Each note displays as a rounded dark speech bubble above the avatar, exactly like the Instagram reference.
- **New hook `src/hooks/useNotes.ts`**: Fetch current user's note + friends' notes (join with friendships table), create/update/delete own note.

**3. Online Green Dot Consistency**

The `OnlineIndicator` component is already used in `ConversationContent` at line 584, but it's placed inside the avatar button wrapper. Verify it renders correctly with `className="-bottom-0.5 -right-0.5"` on the outer relative container. For group chats, no dot is shown (correct). The implementation already handles this — just need to confirm the `relative` positioning context is correct on the parent div (line 557 has `relative`), so this should already work. Will audit and fix if the dot isn't visible due to overflow clipping.

### Files to create
- `src/components/chat/NotesRow.tsx` — Notes horizontal scroll component
- `src/hooks/useNotes.ts` — Notes data hook

### Files to modify
- `src/components/camera/Camera.tsx` — Snapchat-style layout with right-side tools, bottom filter tabs
- `src/components/camera/VybeSnapCamera.tsx` — Same Snapchat-style layout
- `src/components/chat/ConversationList.tsx` — Add NotesRow above conversation list, verify online dots

### Database migration
- Create `user_notes` table with RLS policies for authenticated access

