## Goal
Seed realistic-looking demo data into the Live DB so I can capture authentic Play Store screenshots of `/home`, `/clips`, `/messages`, `/community`, `/map`, `/vybe-dna`, then clean it up afterward.

## Anti-AI-slop rules
- No "✨ vibes ✨" / em-dash / "Let's dive in" copy
- Lowercase casual captions, typos allowed ("ngl", "fr", "lol", "idk")
- Mix short (3-8 word) and one-line posts; no paragraphs
- Real-sounding usernames: `mayaaa`, `jules.k`, `noah_p`, `riv`, `tinab`, `dex2x` — not `creative_user_42`
- Avatars: real photo-style images from Unsplash (people, not generated)
- Post images: candid phone-shot aesthetic (concert blur, café latte, sunset from car window, dorm mirror selfie, dog on couch) — not studio
- DM thread reads like 2 friends mid-convo, not a tutorial
- Timestamps spread across last 6 days, not all "2m ago"

## What gets seeded

**6 demo profiles** (1 = "you" for the screenshot session, 5 = friends/feed)
- usernames, bios, avatar_url (Unsplash people), small follower counts (40-300)

**8 posts** in the home feed
- 5 image posts, 2 text-only, 1 carousel
- Realistic likes (12-180), comments (2-20), saves
- Backdated `created_at` across last week

**3 clips** for `/clips`
- short vertical video URLs (use existing public sample mp4s or placeholder), with view/like counts

**1 DM conversation** with 8-12 messages
- between "you" and `mayaaa`, mid-thread about weekend plans + a shared post

**2 communities**
- "late night coders" (84 members), "denver coffee" (211 members)
- with 2-3 recent posts each visible in preview

**5 map pins** within a 5-mile radius of a chosen city for `/map`

**VYBE DNA** seed for the demo account so `/vybe-dna` shows a populated personality vector instead of empty state

## Workflow

1. Confirm city/coordinates for the map screen (default: Denver, CO)
2. Write one `supabase--migration` (schema-safe upserts only — no schema changes)
3. Run it against the connected DB
4. Sign into preview as the demo account
5. Capture all 8 screens at 1080×1920 viewport
6. Composite captions + brand band via existing PIL pipeline → `/mnt/documents/play-store-screenshots/`
7. QA each slide
8. Run cleanup migration that deletes all seeded rows by a `demo_seed = true` tag column OR by the known demo profile IDs

## Cleanup safety
Every inserted row gets either:
- a `metadata->>'demo_seed' = 'true'` flag (if jsonb column exists), or
- tracked in a temporary `_demo_seed_ids` table I create + drop

Cleanup script reverses everything in one call. No prod user data touched.

## Open questions before I migrate

1. **City for map pins** — Denver, or somewhere else?
2. **Demo login account** — should I create a fresh `demo@vybehub.app` profile and give you the password, or use an existing test account you already have?
3. **Clip video sources** — OK to use 3 short royalty-free mp4s from Pexels (skater, coffee pour, dog), or do you want to upload your own?
