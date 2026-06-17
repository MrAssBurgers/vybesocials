#!/usr/bin/env node
/**
 * Download all Lovable Cloud storage files via the migration-export-storage edge function.
 *
 * Env required:
 *   SUPABASE_URL              e.g. https://agtcyxjxgkdyoxwxkjth.supabase.co
 *   SUPABASE_ANON_KEY         publishable anon key (any valid one)
 *   MIGRATION_EXPORT_TOKEN    matches the secret set on the edge function
 *
 * Output: ./export/storage/<bucket>/<path>
 */
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

const { SUPABASE_URL, SUPABASE_ANON_KEY, MIGRATION_EXPORT_TOKEN } = process.env
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !MIGRATION_EXPORT_TOKEN) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / MIGRATION_EXPORT_TOKEN')
  process.exit(1)
}

const FN = `${SUPABASE_URL}/functions/v1/migration-export-storage`
const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'x-migration-token': MIGRATION_EXPORT_TOKEN,
}
const OUT = path.resolve('./export/storage')
fs.mkdirSync(OUT, { recursive: true })

async function listBuckets() {
  const r = await fetch(`${FN}?mode=buckets`, { headers })
  if (!r.ok) throw new Error(`listBuckets ${r.status} ${await r.text()}`)
  const { buckets } = await r.json()
  return buckets
}

async function downloadOne(bucket, obj) {
  const dest = path.join(OUT, bucket, obj.path)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (fs.existsSync(dest) && fs.statSync(dest).size === obj.size) return 'skip'
  const r = await fetch(obj.signedUrl)
  if (!r.ok) throw new Error(`GET ${obj.path} ${r.status}`)
  await pipeline(r.body, fs.createWriteStream(dest))
  return 'ok'
}

async function processBucket(bucket) {
  console.log(`\n== bucket: ${bucket} ==`)
  let cursor = 0, total = 0, downloaded = 0
  while (true) {
    const r = await fetch(`${FN}?bucket=${encodeURIComponent(bucket)}&cursor=${cursor}&limit=200`, { headers })
    if (!r.ok) throw new Error(`page ${r.status} ${await r.text()}`)
    const { objects, nextCursor } = await r.json()
    if (!objects.length) break
    const results = await Promise.allSettled(objects.map(o => downloadOne(bucket, o)))
    for (const x of results) {
      if (x.status === 'fulfilled') { total++; if (x.value === 'ok') downloaded++ }
      else console.error('  err', x.reason?.message ?? x.reason)
    }
    process.stdout.write(`  ${total} listed, ${downloaded} fetched\r`)
    if (!nextCursor) break
    cursor = nextCursor
  }
  console.log(`\n  done: ${total} files (${downloaded} newly downloaded)`)
}

const buckets = await listBuckets()
console.log('Found buckets:', buckets.map(b => b.name).join(', '))
for (const b of buckets) await processBucket(b.name)
console.log('\nAll done →', OUT)
