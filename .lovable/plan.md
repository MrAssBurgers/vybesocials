## Plan

I’ll address the tester report with focused app-side changes plus store-listing guidance updates.

### 1. Strengthen the new-user walkthrough
- Update the mobile intro/walkthrough slides so they are more dynamic and feature-focused.
- Cover the report’s key examples: stories/clips, communities, messaging/calls, creator tools, personalization, and safety.
- Keep skip/next/progress behavior intact and maintain the existing VYBE visual style.
- Keep the existing post-onboarding interactive tutorial available from Settings → Help.

### 2. Add an in-app “Rate VYBE” entry
- Add a dedicated “Rate VYBE” action in Settings → Help & Support.
- On Android/native builds, open the Play Store listing for `com.despia.vybe`.
- On web/preview, open the Play Store URL in a new tab.
- Add a small local milestone prompt that can surface after enough app usage, but only once and with dismiss/rate options so it does not spam users.

### 3. Improve the in-app feedback mechanism visibility
- Upgrade Settings → Help & Support so users can clearly:
  - submit feedback,
  - report issues,
  - replay the walkthrough/tutorial,
  - rate the app.
- Improve the Feedback page submission dialog copy/placeholders so users know bug reports, feature ideas, and general suggestions all belong there.

### 4. Update ASO copy guidance
- Update `PLAY_STORE_GUIDE.md` with a stronger short description and full description using relevant searchable terms:
  - social app,
  - short videos/clips,
  - stories,
  - messaging,
  - communities,
  - creator tools,
  - personalization.
- Keep this as guidance/documentation only; I can’t directly update the live Play Store listing from the codebase.

### 5. Add Play Store screenshot guidance
- Add a screenshot checklist/shot list to `PLAY_STORE_GUIDE.md` with feature-focused screenshot concepts and overlay text:
  - Share your VYBE,
  - Chat with friends,
  - Join communities,
  - Discover clips,
  - Customize your profile.

## Technical notes
- Likely files to update:
  - `src/pages/MobileIntro.tsx`
  - `src/components/settings/HelpSection.tsx`
  - `src/pages/Feedback.tsx`
  - `src/App.tsx` or a small new prompt component mounted near existing global overlays
  - `PLAY_STORE_GUIDE.md`
- No backend/database migration is needed because the feedback hub already exists.
- I’ll avoid touching generated integration files and keep changes frontend/documentation-only.