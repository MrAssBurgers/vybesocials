

## AdSense Approval: Make the Site Ready for Resubmission

### The Problem

Google rejected for two reasons:
1. **"Ads on screens without publisher-content"** — Already fixed (ads disabled)
2. **"Low value content"** — Google's crawler only sees the login page. All actual content (posts, feeds, profiles) is behind authentication. To Google, this is a single-page login form with no indexable content.

### What Google Needs to See

- Substantial, publicly accessible content pages
- Clear site purpose and navigation
- Contact information and legal pages (already exist: Privacy, Terms, Cookie Policy, Guidelines)
- An "About" page explaining what VYBE is
- A proper landing page with content preview (not just a login form)

### Changes

**1. Create `/about` page** — `src/pages/About.tsx`

A public, content-rich page explaining VYBE: what it is, key features (social feed, stories, clips, communities, messaging, creator tools), how it works, and the team/mission. This gives Google a real content page to crawl. Links to Privacy, Terms, Guidelines, Contact.

**2. Create `/contact` page** — `src/pages/Contact.tsx`

A simple page with the support email (`vybesocial.info@gmail.com`), a brief FAQ section covering common questions (account issues, content policy, creator program, data requests). Google values accessible contact information.

**3. Enhance Landing page** — `src/pages/Landing.tsx`

Add a public content section **above** the login form: a hero section with feature highlights, screenshots/descriptions of the platform, social proof, and links to About, Privacy, Terms, Contact, Guidelines. This transforms the landing page from "just a login form" to a proper homepage with crawlable content.

**4. Add routes** — `src/App.tsx`

Register `/about` and `/contact` as public routes (no auth required).

**5. Add `robots.txt`** — `public/robots.txt`

Allow Google to crawl all public pages. Include sitemap reference.

**6. Add `sitemap.xml`** — `public/sitemap.xml`

List all public URLs: `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/guidelines`, `/cookies`. This helps Google discover and index all content pages.

**7. Update footer links** — `src/pages/Landing.tsx`

Add About and Contact to the existing footer links (Privacy, Terms, Guidelines).

### Files Summary

**New files (4)**:
1. `src/pages/About.tsx` — Feature-rich about page
2. `src/pages/Contact.tsx` — Contact info + FAQ
3. `public/robots.txt` — Crawler permissions
4. `public/sitemap.xml` — URL index for Google

**Modified files (2)**:
1. `src/pages/Landing.tsx` — Add hero content section + footer links
2. `src/App.tsx` — Register public routes

No database changes.

