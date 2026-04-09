
## Phase Implementation Plan

### 1. Friend Map (Opt-in Location Sharing)
- **Database**: Create `user_locations` table with lat/lng, accuracy, last_updated, and `sharing_enabled` boolean
- **Component**: `FriendMap` page using a lightweight map library (Leaflet via CDN or simple CSS grid map)
- **Privacy**: Opt-in toggle in settings, fuzzy locations (round to ~1km), auto-expire after 8 hours
- **Route**: `/map` accessible from sidebar/nav

### 2. Group Chat Improvements
- **Database**: Add `group_name`, `group_avatar_url`, `pinned_message_id` columns to conversations table; create `conversation_admins` table
- **Features**:
  - Group naming & custom avatar upload
  - @mentions with autocomplete dropdown in chat input
  - Pin/unpin messages (admin only)
  - Admin controls (add/remove members, promote admins)

### 3. Creator Analytics Dashboard
- **Component**: `/analytics` page with charts showing:
  - Post performance (likes, comments, shares over time)
  - Follower growth trend
  - Top performing posts
  - Engagement rate
- **Data**: Query existing posts, likes, follows tables — no new tables needed

### 4. Loading & Polish
- **Cache-first rendering**: Show cached query data instantly via React Query's `staleTime`
- **Smooth theme transitions**: Ensure cross-fade on theme switch
- **Eliminate skeleton flash**: Use `placeholderData` in queries

I'll implement these one at a time, starting with database migrations.
