

## Fix VybeMap Desktop Black Screen + Set Up Live Payments

### 1. VybeMap Desktop Black Screen Fix (Definitive)

**Root cause analysis**: The black screen happens because:
- The outer wrapper uses `relative w-full h-full` but also `minHeight: '100vh'` -- when `h-full` resolves to 0 (parent chain issue), only `minHeight` applies, but the map container uses `absolute inset-0` which needs the parent to have actual computed height
- The `.leaflet-container` CSS forces `position:absolute;inset:0` which can conflict with Leaflet's internal positioning
- The `#0a0a0a` background shows as the "black screen" when tiles fail to render

**Fix in `FriendMap.tsx`**:
- Remove the conflicting `.leaflet-container{position:absolute;inset:0}` CSS override -- Leaflet manages its own container positioning
- Change the outer wrapper to use `fixed inset-0` on both mobile AND desktop (since `hideNav` and `noPadding` are both true, the AppLayout main area just wraps the content -- using fixed bypasses the flex height chain entirely)
- OR better: keep `absolute inset-0` on the map div but ensure the parent uses `h-screen` instead of `h-full` to avoid depending on parent height resolution
- Add `will-change: transform` to force GPU compositing on the map container
- Add a more aggressive invalidateSize retry: use a MutationObserver on the parent in addition to ResizeObserver
- Add a fallback: if after 3 seconds the map container has 0 height, force-set it to `window.innerHeight`

**Specific changes**:
- Outer div: change from `relative w-full h-full` to `absolute inset-0` (since AppLayout's content area with `noPadding` gives `h-full`)
- Remove `.leaflet-container{position:absolute;inset:0}` from the inline styles
- Keep `.leaflet-container{height:100%!important;width:100%!important;background:#0a0a0a}`
- Add a useEffect that checks `mapEl.current?.offsetHeight` after 1s and if 0, sets explicit pixel height

### 2. Live Payments via Stripe

Your current Stripe account ("Vybe Social sandbox") is in **test mode**. To accept real payments:

1. You need to activate your Stripe account at `dashboard.stripe.com` -- go to Settings → Account details and complete the activation checklist (business info, bank account, identity verification)
2. Once activated, you'll get a live secret key (`sk_live_...`) -- you'll need to add that as a secret replacing the current test key
3. You'll also need to create live-mode products/prices (the current `price_1TCQhF...` and `price_1TCp2T...` are test-mode prices)

**I cannot activate your Stripe account programmatically** -- this requires identity verification and bank account setup that only you can do through the Stripe Dashboard.

**Alternative: Polar** -- Your project has Polar connected. Polar is already in live mode (no sandbox/test mode). I can create VYBE Premium products on Polar and wire up the checkout flow so you can start accepting real payments immediately without needing to activate Stripe. However, Polar is a different payment platform from Stripe.

**What I'll do in this implementation**:
- Update the `STRIPE_SECRET_KEY` resolution to validate test vs live mode and warn clearly
- Add a "Go Live" checklist in the owner settings that shows what's needed
- Keep the existing Stripe flow but make it live-ready once the user provides a live key

### Files Modified
- `src/pages/FriendMap.tsx` -- definitive desktop map fix
- `supabase/functions/_shared/stripe-key.ts` -- live mode validation improvements
- `supabase/functions/create-premium-checkout/index.ts` -- live-ready price handling

