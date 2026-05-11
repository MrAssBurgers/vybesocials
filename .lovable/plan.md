Plan to fix the AI features and challenges:

1. Repair challenge refresh
- Remove the stale scheduled challenge jobs that are calling an old backend URL.
- Recreate the challenge refresh jobs against the current Lovable Cloud backend.
- Make refresh reliable even if AI generation is rate-limited by falling back to existing challenge templates.
- Immediately restore active challenges so the Challenges page has today’s daily challenges and this week’s weekly challenges again.

2. Add real challenge cleanup
- Update the challenge cleanup so expired inactive daily/weekly challenges are deleted, not only deactivated.
- Keep current challenges and achievements safe.
- Let dependent old progress/reward rows clean up with the deleted expired challenges to save database space.

3. Fix the AI backend functions
- Audit all AI-facing backend functions used by the app: AI chat, DNA chat, message assist, smart replies, summaries, captions, recommendations, moderation, Vybe Check, AI content detection, themes/backgrounds, and challenge generation.
- Standardize error handling for AI rate limits, credits, auth failures, and malformed AI responses so the UI gets useful errors instead of silent failures.
- Fix identity lookups where functions are using the auth user ID where they should map to the profile ID.
- Keep existing provider-specific safety logic where the app already depends on it, especially Vybe Check’s stricter multimodal safety scanning.

4. Fix frontend AI callers
- Ensure every AI request sends the correct authenticated function headers.
- Replace generic “try again” failures with clear user-facing states for rate limits, missing auth, and unavailable AI.
- Make streaming AI chat/DNA chat finalize cleanly even if the stream ends without content.

5. Validate the fixes
- Test challenge refresh produces active daily/weekly rows.
- Test old challenge deletion reduces stale rows.
- Test Vybe Check with safe and blocked content paths.
- Test core AI chat/message assist paths and confirm backend logs no longer show AI failures.

Key finding: challenges currently have zero active daily/weekly rows, and the scheduled jobs are pointed at the wrong backend, so they report as “scheduled” but never refresh the real app data.