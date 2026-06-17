#!/usr/bin/env node
/**
 * Upload ./export/storage/<bucket>/<path> → Firebase Storage gs://<projectId>.appspot.com/<bucket>/<path>
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS  path to firebase-admin.json
 *   FIREBASE_PROJECT_ID             e.g. vybe-daaab
 *   FIREBASE_STORAGE_BUCKET         optional override (default <projectId>.appspot.com)
 */
import fs from 'node:fs'
import path from 'node:path'
import mime from 'mime'
import admin from 'firebase-admin'

const projectId = process.env.FIREBASE_PROJECT_ID
if (!projectId) { console.error('FIREBASE_PROJECT_ID missing'); process.exit(1) }
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`

admin.initializeApp({ projectId, storageBucket: bucketName })
const bucket = admin.storage().bucket()

const ROOT = path.resolve('./export/storage')
if (!fs.existsSync(ROOT)) { console.error('No ./export/storage — run download first'); process.exit(1) }

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else yield p
  }
}

let ok = 0, fail = 0
for (const srcBucket of fs.readdirSync(ROOT)) {
  const base = path.join(ROOT, srcBucket)
  if (!fs.statSync(base).isDirectory()) continue
  console.log(`\n== ${srcBucket} →`)
  const files = [...walk(base)]
  for (let i = 0; i < files.length; i += 16) {
    await Promise.all(files.slice(i, i + 16).map(async (file) => {
      const rel = path.relative(base, file).split(path.sep).join('/')
      const dest = `${srcBucket}/${rel}`
      try {
        await bucket.upload(file, {
          destination: dest,
          metadata: { contentType: mime.getType(file) || 'application/octet-stream' },
          resumable: false,
        })
        ok++
      } catch (e) { fail++; console.error('  fail', dest, e.message) }
    }))
    process.stdout.write(`  ${ok} uploaded, ${fail} failed\r`)
  }
  console.log('')
}
console.log(`\nDone. ok=${ok} fail=${fail}`)
