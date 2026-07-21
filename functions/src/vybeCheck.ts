import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { transcribeAudioWithOpenAI } from './_shared/openaiStt.js';
import { runVybeCheckPipeline } from './_shared/vybeCheckPipeline.js';
import type { VybeCheckFrameInput, VybeCheckRequest, VybeCheckStatus } from './_shared/vybeCheckTypes.js';

/** GEMINI required; OpenAI powers moderation + video STT when secret is bound. */
const SECRETS = ['GEMINI_API_KEY', 'OPENAI_API_KEY'] as const;

const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

async function downloadStorageFile(storagePath: string): Promise<string> {
  const bucket = getStorage().bucket();
  const localPath = join(tmpdir(), `vybe-check-${randomUUID()}`);
  const file = bucket.file(storagePath);
  await pipeline(file.createReadStream(), createWriteStream(localPath));
  return localPath;
}

async function extractAudioFromVideo(videoPath: string): Promise<Buffer> {
  const outPath = join(tmpdir(), `vybe-audio-${randomUUID()}.mp3`);
  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .format('mp3')
      .on('error', reject)
      .on('end', () => resolve())
      .save(outPath);
  });
  const buf = await fs.readFile(outPath);
  await fs.unlink(outPath).catch(() => undefined);
  return buf;
}

async function cleanup(path: string) {
  await fs.unlink(path).catch(() => undefined);
}

/** Phase 1 Vybe Check — SafeSearch frames + OpenAI moderation/STT + Gemini borderline. */
export const startVybeCheck = onCall(
  { secrets: [...SECRETS], timeoutSeconds: 300, memory: '1GiB', cpu: 1 },
  async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`vybe_check:${uid}`, 20, 60));

    const body = (request.data || {}) as VybeCheckRequest;
    const contentType = body.content_type || 'video';
    const frames: VybeCheckFrameInput[] = Array.isArray(body.frames) ? body.frames : [];
    const text = body.text || {};
    const checkId = randomUUID();
    const now = new Date().toISOString();

    if (!frames.length && !body.storage_path) {
      const hasText =
        Boolean(text.caption?.trim()) ||
        Boolean((text.hashtags || []).length) ||
        Boolean(text.ocr_text?.trim()) ||
        Boolean(text.transcript?.trim());
      if (!hasText) {
        throw new HttpsError('invalid-argument', 'frames, storage_path, or caption text required');
      }
    }

    await db.collection('vybe_checks').doc(checkId).set({
      user_id: uid,
      content_type: contentType,
      content_id: body.content_id || null,
      storage_path: body.storage_path || null,
      status: 'pending_check' satisfies VybeCheckStatus,
      score: 0,
      categories: [],
      message: 'Vybe Check in progress…',
      frame_count: frames.length,
      frames_scanned: 0,
      created_at: now,
      updated_at: now,
    });

    let transcript = text.transcript || '';
    let localVideoPath: string | undefined;

    try {
      if (!transcript && body.storage_path && process.env.OPENAI_API_KEY) {
        try {
          localVideoPath = await downloadStorageFile(body.storage_path);
          const audioBuf = await extractAudioFromVideo(localVideoPath);
          transcript = await transcribeAudioWithOpenAI(process.env.OPENAI_API_KEY, audioBuf, 'audio/mpeg');
        } catch (err) {
          console.error('[startVybeCheck] audio transcription failed:', err);
        }
      }

      const { record, result } = await runVybeCheckPipeline({
        checkId,
        userId: uid,
        contentType,
        contentId: body.content_id,
        storagePath: body.storage_path,
        frames,
        text,
        transcript,
        geminiApiKey: process.env.GEMINI_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
      });

      await db.collection('vybe_checks').doc(checkId).set(record, { merge: true });
      return result;
    } catch (err) {
      console.error('[startVybeCheck]', err);
      await db.collection('vybe_checks').doc(checkId).set(
        {
          status: 'needs_review',
          message: 'Vybe Check encountered an error — queued for review.',
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
      throw new HttpsError('internal', err instanceof Error ? err.message : 'Vybe Check failed');
    } finally {
      if (localVideoPath) await cleanup(localVideoPath);
    }
  },
);

/** Poll Vybe Check status by ID. */
export const getVybeCheckStatus = onCall(async (request) => {
  const uid = requireAuth(request);
  const { check_id } = (request.data || {}) as { check_id?: string };
  if (!check_id) throw new HttpsError('invalid-argument', 'check_id required');

  const snap = await db.collection('vybe_checks').doc(check_id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Vybe Check not found');
  const data = snap.data() as { user_id?: string };
  if (data.user_id !== uid) throw new HttpsError('permission-denied', 'Not your check');

  return { check_id, ...snap.data() };
});
