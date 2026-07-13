#!/usr/bin/env node
/**
 * Admin backfill: scan recent DM messages and replay relationship activity.
 * Usage: RELATIONSHIP_ENGINE_WRITE=1 node scripts/relationship-backfill.mjs [--dry-run] [--limit=500]
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 500;

if (!getApps().length) {
  initializeApp();
}
const db = getFirestore();

function pairId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function mapMessageType(messageType, mediaType) {
  const t = String(messageType || 'text').toLowerCase();
  if (t === 'vybe' || t === 'snap') return 'snap_sent';
  if (t === 'voice' || t === 'audio') return 'voice_message';
  if (t === 'text' || t === 'media') return 'message_sent';
  return null;
}

async function main() {
  const messages = await db.collection('messages')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();

  let written = 0;
  let skipped = 0;

  for (const doc of messages.docs) {
    const m = doc.data();
    const senderId = String(m.sender_id || '');
    const convId = String(m.conversation_id || '');
    const parts = convId.split('_').filter(Boolean);
    if (parts.length !== 2 || !senderId) {
      skipped += 1;
      continue;
    }
    const friendId = parts[0] === senderId ? parts[1] : parts[0];
    const eventType = mapMessageType(m.message_type || m.type, m.media_type);
    if (!eventType) {
      skipped += 1;
      continue;
    }
    const id = `${eventType}:${doc.id}:${senderId}`;
    const occurredAt = String(m.created_at || new Date().toISOString());
    if (dryRun) {
      console.log('[dry-run]', id, senderId, friendId, eventType);
      written += 1;
      continue;
    }
    const ref = db.collection('relationship_activity_events').doc(id);
    if ((await ref.get()).exists) {
      skipped += 1;
      continue;
    }
    await ref.set({
      id,
      actor_id: senderId,
      friend_id: friendId,
      event_type: eventType,
      source_id: doc.id,
      points: 0,
      occurred_at: occurredAt,
      created_at: new Date().toISOString(),
      backfill: true,
    });
    written += 1;
  }

  console.log(JSON.stringify({ ok: true, dryRun, written, skipped, scanned: messages.size }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
