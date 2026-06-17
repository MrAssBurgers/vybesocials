// Lists all storage objects across all buckets and returns 1-hour signed URLs.
// Gated by a shared MIGRATION_EXPORT_TOKEN secret. One-shot migration tool.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-migration-token',
}

const SIGNED_TTL = 60 * 60 // 1 hour
const PAGE_SIZE = 500

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = req.headers.get('x-migration-token')
  if (!token || token !== Deno.env.get('MIGRATION_EXPORT_TOKEN')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const bucketFilter = url.searchParams.get('bucket') // optional: single bucket
  const prefix = url.searchParams.get('prefix') ?? ''
  const cursor = parseInt(url.searchParams.get('cursor') ?? '0', 10)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10), PAGE_SIZE)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // 1) list buckets
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets()
    if (bErr) throw bErr
    const targets = bucketFilter ? buckets.filter(b => b.name === bucketFilter) : buckets

    if (url.searchParams.get('mode') === 'buckets') {
      return new Response(JSON.stringify({ buckets: targets.map(b => ({ name: b.name, public: b.public })) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!bucketFilter) {
      return new Response(JSON.stringify({
        error: 'specify ?bucket=NAME (use ?mode=buckets to list)',
        buckets: targets.map(b => b.name),
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2) recursively walk the bucket using a stack — paginated single response
    const objects: { path: string; size: number; signedUrl: string }[] = []
    const stack: string[] = [prefix]
    let scanned = 0

    while (stack.length && objects.length < limit) {
      const dir = stack.shift()!
      let offset = 0
      while (objects.length < limit) {
        const { data: entries, error } = await supabase.storage.from(bucketFilter)
          .list(dir, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
        if (error) throw error
        if (!entries || entries.length === 0) break
        for (const e of entries) {
          const full = dir ? `${dir}/${e.name}` : e.name
          if (e.id === null || e.metadata === null) {
            stack.push(full)
          } else {
            scanned++
            if (scanned <= cursor) continue
            const { data: signed } = await supabase.storage.from(bucketFilter)
              .createSignedUrl(full, SIGNED_TTL)
            if (signed?.signedUrl) {
              objects.push({ path: full, size: e.metadata?.size ?? 0, signedUrl: signed.signedUrl })
              if (objects.length >= limit) break
            }
          }
        }
        if (entries.length < 100) break
        offset += 100
      }
    }

    return new Response(JSON.stringify({
      bucket: bucketFilter,
      count: objects.length,
      nextCursor: objects.length >= limit ? cursor + objects.length : null,
      objects,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
