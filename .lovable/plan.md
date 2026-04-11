

## Plan: Remove IntroFlow Splash Screen

### What Changes
Remove the multi-slide intro flow ("Welcome to VYBE", "Built Different", "Built for the Community") that appears before the login/signup form for first-time visitors. Users will go straight to the Landing page with the auth form.

### Files to Edit

**`src/pages/Landing.tsx`**
- Remove `IntroFlow` and `hasSeenIntro` imports
- Remove `showIntro` state and the `useEffect` that determines whether to show intro
- Remove the conditional rendering that shows `IntroFlow` before the landing content
- Always render the auth form directly

**`src/components/intro/IntroFlow.tsx`**
- Keep the file (exports like `markIntroSeen` may be used elsewhere) but no longer called from Landing

### Steps
1. Strip IntroFlow logic from Landing.tsx (state, effect, conditional render)
2. Verify no other routes depend on the removed intro gate

