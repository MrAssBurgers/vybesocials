#!/usr/bin/env node
/**
 * Pre-create Firebase Auth users from the exported profiles.json so UIDs are preserved.
 * Users will need to do "Forgot password" once (bcrypt hashes are not exportable from Lovable Cloud).
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS  path to firebase-admin.json
 *   FIREBASE_PROJECT_ID             e.g. vybe-daaab
 *   PROFILES_JSON                   default ./lovable-cloud-export/tables/profiles.json
 */
import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const projectId = process.env.FIREBASE_PROJECT_ID
if (!projectId) { console.error('FIREBASE_PROJECT_ID missing'); process.exit(1) }
admin.initializeApp({ projectId })

const file = process.env.PROFILES_JSON || './lovable-cloud-export/tables/profiles.json'
const profiles = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
console.log(`Loaded ${profiles.length} profiles from ${file}`)

// Firebase importUsers supports batches of 1000.
const chunks = []
for (let i = 0; i < profiles.length; i += 1000) chunks.push(profiles.slice(i, i + 1000))

let ok = 0, fail = 0
for (const [i, chunk] of chunks.entries()) {
  const users = chunk
    .filter(p => p.user_id || p.id)
    .map(p => ({
      uid: String(p.user_id || p.id),
      email: p.email || undefined,
      displayName: p.display_name || p.username || undefined,
      photoURL: p.avatar_url || undefined,
      emailVerified: false,
      disabled: false,
    }))
  try {
    const res = await admin.auth().importUsers(users)
    ok += res.successCount
    fail += res.failureCount
    if (res.errors?.length) {
      for (const e of res.errors.slice(0, 5)) console.error('  err', e.index, e.error.message)
    }
    console.log(`batch ${i + 1}/${chunks.length}: +${res.successCount} ok, ${res.failureCount} fail`)
  } catch (e) { console.error('batch failed', e.message); fail += users.length }
}
console.log(`\nDone. created=${ok} failed=${fail}`)
console.log('Users must use "Forgot password" on first email login; OAuth re-links automatically.')
