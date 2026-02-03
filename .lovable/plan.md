
  <goals>
    <item>Make display name text color/style consistent everywhere a user name appears (including “View profile” surfaces) using the badge the user has equipped, with staff roles always overriding.</item>
    <item>Fix “giving badges doesn’t work”.</item>
    <item>Lock the Owner badge so it can never be granted/used by anyone except the owner.</item>
    <item>Give Admin/Mod/Wife identity clear, premium colors: Admin neon shiny red, Mod silver, Wife burgundy (both the small role chip and the display-name styling).</item>
    <item>Remove the “View” button from in-app message toasts, and make tapping the notification/toast smoothly mouth-zoom into the correct chat (no dead tap, minimal lag).</item>
    <item>Revamp the Badge Library experience so it looks fresh/clean and supports equipping/pinning in a clear way.</item>
  </goals>

  <what-is-broken-today (based on repo + backend state already inspected)>
    <item><b>Badge awarding uses the wrong ID type</b>: <code>user_badges.user_id</code> currently stores authentication user IDs, but the Admin Badge Manager looks up <code>profiles.id</code> and passes that into <code>award_badge</code>. Result: the badge is inserted for a different ID, so it appears “not granted”.</item>
    <item><b>Role checks are inconsistent</b>: the <code>has_role(auth.uid(), ...)</code> helper is written as if roles are stored by auth user id, but the current <code>user_roles</code> table actually references <code>profiles(id)</code>. This makes “admin-only” policies/functions unreliable and can block staff-only badge operations.</item>
    <item><b>“View” button still appears</b> because it’s coming from the DM toast in <code>useMessageNotifications</code> (Sonner toast action label “View”), not the Notifications page list.</item>
    <item><b>Tap does nothing / lag</b> in toasts because the current toast action uses <code>window.location.href</code> (full navigation) and does not trigger the mouth-zoom transition; also creating/finding the DM conversation can be slow if we always hit the network.</item>
    <item><b>Name styling mismatch persists in some surfaces</b> because many components still render <code>display_name || username</code> as plain text (or via <code>UserIdentity/UserName</code>), bypassing <code>StyledUsername</code>.</item>
    <item><b>“Equipped badge” concept is not wired</b>: the DB has <code>user_badges.is_primary</code>, but <code>get_user_primary_badge</code> currently returns by priority, not by “equipped”, so users can’t reliably choose the style they want.</item>
  </what-is-broken-today>

  <solution-overview>
    <item><b>Unify identity resolution</b>: treat “name styling source-of-truth” as a single backend RPC that returns the correct style for any user by resolving staff roles + equipped badge.</item>
    <item><b>Make all name renderers converge</b>: update <code>UserIdentity</code> / <code>UserName</code> to render <code>StyledUsername</code> internally so most of the app becomes consistent without hunting every single surface.</item>
    <item><b>Fix badge granting at the root</b>: make <code>award_badge</code> accept either a profile id or auth user id and resolve correctly; enforce “exclusive badges” (Owner, Wife) in the function.</item>
    <item><b>Fix role storage + checks</b>: introduce a new roles table keyed by auth user id, migrate existing data, and update <code>has_role</code> + RLS policies to use it.</item>
    <item><b>Notifications</b>: remove toast action button, make the toast itself clickable and trigger mouth-zoom; move the mouth-zoom provider to the app root and optimize “open chat” to prefer cached existing conversation IDs.</item>
    <item><b>Badge visuals</b>: update badge definitions (gradients/effects) and role chips to match your desired Admin/Mod/Wife palette.</item>
    <item><b>Badge Library revamp</b>: redesigned layout with “My Style” (equip), “Pinned” (profile row), and “All Badges” sections, with clean locked states and clear actions.</item>
  </solution-overview>

  <implementation-phases>
    <phase name="Phase 1 — Fix correctness fast (granting + notifications + mismatches)">
      <backend-changes>
        <item>
          <b>Roles: add auth-keyed roles table</b>
          <ul>
            <li>Create <code>public.user_roles_auth</code> keyed by auth user id (no client-side hacks; server validated).</li>
            <li>Migrate existing rows from <code>public.user_roles</code> (profile-id keyed) by mapping <code>profiles.id → profiles.user_id</code>.</li>
            <li>Update <code>public.has_role(_user_id, _role)</code> to check <code>user_roles_auth</code>.</li>
            <li>Update RLS policies that rely on <code>has_role(auth.uid(), ...)</code> (badges/challenges admin policies) so admin tooling works.</li>
          </ul>
        </item>
        <item>
          <b>Fix award_badge</b>
          <ul>
            <li>Update <code>public.award_badge(p_user_id, p_badge_id,...)</code> to accept either <code>profiles.id</code> or auth id:
              <ul>
                <li>If <code>p_user_id</code> matches a profile row, resolve <code>profiles.user_id</code> as the real target auth id.</li>
                <li>Else treat <code>p_user_id</code> as auth id.</li>
              </ul>
            </li>
            <li>Enforce permissions: only admins (via <code>has_role(auth.uid(),'admin')</code>) and the owner can award to others.</li>
            <li>Enforce exclusivity: if badge name/category is Owner, only allow if target is the owner; if “Owner’s Wife”, only allow if target is the configured wife user.</li>
            <li>Return a clear error message when blocked so the UI can show “This badge is exclusive”.</li>
          </ul>
        </item>
        <item>
          <b>Equipped display style: update get_user_primary_badge</b>
          <ul>
            <li>Make the RPC resolve style in this order:
              <ol>
                <li>Owner override (by owner username or a dedicated owner role) → Owner styling always wins.</li>
                <li>Staff roles override (Admin / Moderator / Owner’s Wife) → pick highest staff priority.</li>
                <li>User equipped badge (<code>user_badges.is_primary = true</code>) if set.</li>
                <li>Fallback to highest-priority earned badge.</li>
              </ol>
            </li>
            <li>Respect “staff can’t be disabled”: staff styling ignores <code>show_effect</code> toggles.</li>
          </ul>
        </item>
        <item>
          <b>Retroactive unlock reliability</b>
          <ul>
            <li>Keep using <code>sync_my_challenge_progress()</code> on login (already called by <code>useRetroactiveSync</code>).</li>
            <li>Update the function (if needed) to ensure it resolves the correct profile id even when profiles have legacy rows; and that it always inserts into <code>user_badges</code> with the resolved auth id.</li>
            <li>Add safety: <code>ON CONFLICT (user_id, badge_id) DO NOTHING</code> (already present) + ensure <code>badge_id</code> is never null on new inserts.</li>
          </ul>
        </item>
      </backend-changes>

      <frontend-changes>
        <item>
          <b>Fix AdminBadgeManager awarding</b>
          <ul>
            <li>When searching a user by username, select both <code>profiles.id</code> and <code>profiles.user_id</code>.</li>
            <li>Pass the correct target id to <code>award_badge</code> (prefer <code>profiles.user_id</code> if present; otherwise pass <code>profiles.id</code> and rely on the new resolver in <code>award_badge</code>).</li>
            <li>After awarding/removing: invalidate the recipient’s <code>user-badges</code> + <code>display-style</code> queries so it updates immediately.</li>
          </ul>
        </item>
        <item>
          <b>Global name consistency: upgrade UserIdentity/UserName</b>
          <ul>
            <li>Update <code>src/components/ui/UserIdentity.tsx</code> so the displayed name uses <code>&lt;StyledUsername /&gt;</code> (instead of plain text).</li>
            <li>Update the <code>UserName</code> helper component similarly.</li>
            <li>This single change will automatically fix many “still doesn’t match” surfaces that currently use <code>UserIdentity</code>/<code>UserName</code>.</li>
          </ul>
        </item>
        <item>
          <b>Settings “View profile” mismatch</b>
          <ul>
            <li>In <code>ProfileSection</code>, replace the plain <code>@username</code> header with <code>StyledUsername</code> so the preview matches what others see.</li>
          </ul>
        </item>
        <item>
          <b>Notifications: remove View + make tap mouth-zoom</b>
          <ul>
            <li>In <code>useMessageNotifications</code>:
              <ul>
                <li>Remove the Sonner <code>action: { label: 'View', ... }</code> so the button disappears.</li>
                <li>Make the toast clickable: clicking anywhere on the toast triggers mouth-zoom into the DM.</li>
              </ul>
            </li>
            <li>Move <code>MouthZoomProvider</code> to the app root (wrap the router content) so it’s available from anywhere, including global toasts.</li>
            <li>Optimize lag: in the transition, try to find an existing conversation ID from cached conversations first; only call “create conversation” if none exists.</li>
          </ul>
        </item>
      </frontend-changes>

      <ui-style-changes (quick wins)>
        <item><b>Role chip colors</b>: update <code>ModBadge</code> to use:
          <ul>
            <li>Admin: neon shiny red (stronger red gradient + subtle shine/glow).</li>
            <li>Mod: silver (cool gray gradient, metallic look).</li>
          </ul>
        </item>
        <item><b>Wife badge</b>: update <code>OwnerWifeRingBadge</code> to a burgundy palette (and optionally reduce motion if you want it less “busy”).</item>
      </ui-style-changes>
    </phase>

    <phase name="Phase 2 — True ‘equipped badge’ + clean badge system UX">
      <backend-changes>
        <item>
          <b>Equipping a badge</b>
          <ul>
            <li>Add an RPC or safe update path to set exactly one <code>user_badges.is_primary</code> for a user (and unset others) with proper access control.</li>
            <li>Ensure staff overrides remain non-configurable.</li>
          </ul>
        </item>
      </backend-changes>

      <frontend-changes>
        <item>
          <b>Revamp Badge Library</b> (<code>src/pages/BadgeLibrary.tsx</code>)
          <ul>
            <li>Top “My Identity” card:
              <ul>
                <li>Shows your current styled name preview.</li>
                <li>Shows which badge is equipped (or “Highest priority badge”).</li>
              </ul>
            </li>
            <li>“My Badges” section:
              <ul>
                <li>Earned badges only.</li>
                <li>Actions per badge: Equip (sets primary), Pin (up to 3), Toggle effect (for non-staff badges).</li>
              </ul>
            </li>
            <li>“All Badges” section:
              <ul>
                <li>Cleaner locked cards: show requirement text (unlock_requirement/unlock_threshold) instead of just a lock overlay.</li>
                <li>Highlight staff-exclusive badges (Owner / Wife) as “Exclusive”.</li>
              </ul>
            </li>
            <li>Visual polish: consistent spacing, fewer overlays, better typography, modern empty states.</li>
          </ul>
        </item>
        <item>
          <b>Replace remaining plain-name renderers</b>
          <ul>
            <li>Systematically update high-traffic surfaces still using <code>display_name || username</code> (e.g., conversation list rows, member lists, friend requests, live panels) to render <code>StyledUsername</code> or <code>UserIdentity</code> (now upgraded to styled).</li>
            <li>Where performance matters (large lists), pass preloaded style if already available, or batch-load styles for the visible set.</li>
          </ul>
        </item>
      </frontend-changes>
    </phase>

    <phase name="Phase 3 — Staff colors + exclusivity done ‘right’">
      <backend-changes>
        <item>
          <b>Staff style definition source</b>
          <ul>
            <li>Ensure badges table has definitive rows for Admin/Moderator/Owner/Wife with the exact gradients/effects you want.</li>
            <li>Update the style RPC to pull those rows so changing colors is just data, not code.</li>
          </ul>
        </item>
        <item>
          <b>Hard lock exclusives</b>
          <ul>
            <li>Owner badge cannot be inserted for non-owner in any code path (award RPC + sync RPC).</li>
            <li>Wife badge cannot be inserted for any user except the configured wife user.</li>
          </ul>
        </item>
      </backend-changes>
    </phase>
  </implementation-phases>

  <acceptance-checklist>
    <item>Badge granting from the admin panel works immediately (recipient sees it in their library, and their name styling updates after refresh or instantly via cache invalidation).</item>
    <item>Owner badge cannot be granted to anyone else (attempt shows a clear error).</item>
    <item>Admin = neon shiny red, Mod = silver, Wife = burgundy in both the small badge chip and the display name styling.</item>
    <item>No “View” button on message toasts; tapping the toast mouth-zooms into the correct DM; no dead clicks.</item>
    <item>Name styling matches across: sidebar, settings “view profile” card, profile page header, hover cards, posts, comments, conversation list, notifications list, and message toasts.</item>
    <item>Users who completed challenges in the past get their badge unlocked on login (retroactive sync) and it shows in their library.</item>
  </acceptance-checklist>

  <notes / risks>
    <item>Changing the roles storage to auth-keyed is necessary for secure, reliable admin checks. We will migrate existing role rows so nothing is lost.</item>
    <item>There are legacy profile rows with <code>profiles.user_id</code> missing; the updated functions will be defensive, but long-term we should ensure profile creation/claim always writes <code>user_id</code>.</item>
    <item>To keep UI fast, we’ll prioritize “centralizing name rendering” (UserIdentity/UserName → StyledUsername) and only add batching if we see performance issues in very large lists.</item>
  </notes>
