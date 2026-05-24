// Public, no-JWT edge function that returns OG-tagged HTML for link-preview crawlers
// (LinkedIn, iMessage, Slack, Discord, X, Facebook, WhatsApp) and instantly redirects
// human visitors to the in-app route. This is THE growth primitive for share-to-web in
// an SPA — Helmet alone can't satisfy social crawlers because they don't run JS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const APP_ORIGIN = "https://vybehub.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// iOS App Store ID + Android package — when set, share previews surface
// "Open in App" smart banner / intent on mobile (Universal/App Links).
const IOS_APP_ID = Deno.env.get("IOS_APP_STORE_ID") || ""; // e.g. "6499999999"
const ANDROID_PACKAGE = "com.despia.vybe";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage(opts: {
  title: string;
  description: string;
  canonical: string;
  image?: string | null;
  ogType?: "article" | "profile" | "website";
  jsonLd?: Record<string, unknown>;
}): string {
  const { title, description, canonical, image, ogType = "article", jsonLd } = opts;
  const img = image ? `<meta property="og:image" content="${esc(image)}" />
    <meta name="twitter:image" content="${esc(image)}" />` : "";
  const ld = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="${ogType}" />
<meta property="og:site_name" content="VYBE" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
${img}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
${ld}
<meta http-equiv="refresh" content="0; url=${esc(canonical)}" />
<style>body{font-family:system-ui,sans-serif;background:#0B0B10;color:#fff;margin:0;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px}a{color:#8B5CF6}</style>
</head>
<body>
<div>
<h1 style="margin:0 0 8px">${esc(title)}</h1>
<p style="opacity:.7;max-width:480px">${esc(description)}</p>
<p><a href="${esc(canonical)}">Open in VYBE →</a></p>
</div>
<script>location.replace(${JSON.stringify(canonical)});</script>
</body>
</html>`;
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=600",
      "access-control-allow-origin": "*",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "*",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const id = url.searchParams.get("id");
    const username = url.searchParams.get("username");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (type === "post" && id) {
      const { data: post } = await admin
        .from("posts")
        .select("id, caption, media_url, thumbnail_url, type, created_at, author:profiles!author_id(username, display_name, avatar_url)")
        .eq("id", id)
        .maybeSingle();

      if (!post) {
        return html(
          htmlPage({
            title: "Post not found · VYBE",
            description: "This post may have been removed or is private.",
            canonical: `${APP_ORIGIN}/`,
          }),
          404,
        );
      }

      const author = (post as any).author;
      const authorName = author?.display_name || author?.username || "Someone";
      const caption = (post.caption || "").trim();
      const title = caption
        ? `${authorName}: ${caption.slice(0, 80)}${caption.length > 80 ? "…" : ""}`
        : `${authorName} on VYBE`;
      const description = caption
        ? caption.slice(0, 200)
        : `Tap to see ${authorName}'s ${post.type || "post"} on VYBE.`;
      const image = post.thumbnail_url || post.media_url || author?.avatar_url || null;

      return html(
        htmlPage({
          title,
          description,
          canonical: `${APP_ORIGIN}/p/${post.id}`,
          image,
          ogType: "article",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "SocialMediaPosting",
            headline: title,
            datePublished: post.created_at,
            author: { "@type": "Person", name: authorName },
            image: image ? [image] : undefined,
          },
        }),
      );
    }

    if (type === "profile" && (username || id)) {
      const q = admin.from("profiles").select("id, username, display_name, avatar_url, bio, is_private");
      const { data: profile } = username
        ? await q.eq("username", username).maybeSingle()
        : await q.eq("id", id!).maybeSingle();

      if (!profile || profile.is_private) {
        return html(
          htmlPage({
            title: "Profile not found · VYBE",
            description: "This profile may be private or unavailable.",
            canonical: `${APP_ORIGIN}/`,
          }),
          404,
        );
      }

      const name = profile.display_name || profile.username;
      const title = `${name} (@${profile.username}) · VYBE`;
      const description = (profile.bio || `Follow @${profile.username} on VYBE.`).slice(0, 200);

      return html(
        htmlPage({
          title,
          description,
          canonical: `${APP_ORIGIN}/u/${profile.username}`,
          image: profile.avatar_url,
          ogType: "profile",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
              "@type": "Person",
              name,
              alternateName: profile.username,
              image: profile.avatar_url || undefined,
              description: profile.bio || undefined,
            },
          },
        }),
      );
    }

    return html(
      htmlPage({
        title: "VYBE — your vibe, your people",
        description: "VYBE is the social app where your vibe shapes your feed.",
        canonical: `${APP_ORIGIN}/`,
        ogType: "website",
      }),
    );
  } catch (e) {
    console.error("share-preview error", e);
    return html(
      htmlPage({
        title: "VYBE",
        description: "Open this in the VYBE app.",
        canonical: `${APP_ORIGIN}/`,
      }),
      500,
    );
  }
});
