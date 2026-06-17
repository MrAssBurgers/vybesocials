/**
 * OpenAI Speech-to-Text (Whisper) — Phase 1 video audio transcription.
 */

export async function transcribeAudioWithOpenAI(
  apiKey: string,
  audioBuffer: Buffer,
  mimeType = 'audio/mpeg',
): Promise<string> {
  if (!audioBuffer.length) return '';

  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('webm') ? 'webm' : 'mp3';
  const bytes = new Uint8Array(audioBuffer);
  const blob = new Blob([bytes], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `audio.${ext}`);
  form.append('model', 'whisper-1');
  form.append('response_format', 'text');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[openaiStt]', res.status, body.slice(0, 300));
    throw new Error(`OpenAI transcription failed: ${res.status}`);
  }

  return (await res.text()).trim();
}
