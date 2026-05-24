// Public dynamic sitemap: lists recent public posts and profiles for crawlers.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BASE = 'https://vybehub.app';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const urls: string[] = [];

  // Recent public posts (cap to 2000 for sitemap size guidance)
  const { data: posts } = await supabase
    .from('posts')
    .select('id, updated_at, created_at, visibility')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(2000);

  for (const p of posts ?? []) {
    const lastmod = (p.updated_at ?? p.created_at ?? '').slice(0, 10);
    urls.push(
      `  <url><loc>${BASE}/p/${xmlEscape(p.id)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    );
  }

  // Public profiles (cap 5000)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('username, updated_at')
    .not('username', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5000);

  for (const u of profiles ?? []) {
    if (!u.username) continue;
    const lastmod = (u.updated_at ?? '').slice(0, 10);
    urls.push(
      `  <url><loc>${BASE}/u/${xmlEscape(u.username)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.5</priority></url>`,
    );
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

  return new Response(xml, {
    headers: {
      ...cors,
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
});
