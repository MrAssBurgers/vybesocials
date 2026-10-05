import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { HttpsError } from 'firebase-functions/v2/https';

export const SOUND_MAX_BYTES = 20 * 1024 * 1024;
export const SOUND_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4'];
function demuxer(bytes: Buffer, contentType: string) {
  const ascii = (start: number, length: number) => bytes.subarray(start, start + length).toString('ascii');
  if (contentType === 'audio/wav' && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav';
  if (contentType === 'audio/ogg' && ascii(0, 4) === 'OggS') return 'ogg';
  if (contentType === 'audio/mp4' && ascii(4, 4) === 'ftyp') return 'mov';
  if (contentType === 'audio/mpeg' && (ascii(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0))) return 'mp3';
  if (contentType === 'audio/aac' && bytes[0] === 255 && (bytes[1] & 0xf6) === 0xf0) return 'aac';
  throw new HttpsError('invalid-argument', 'The file contents do not match a supported audio format.');
}

/** Decode real samples; never accept the browser's duration or a filename as proof. */
export async function inspectSound(bytes: Buffer, contentType: string): Promise<{ bytes: Buffer; duration: number }> {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16 || bytes.length > SOUND_MAX_BYTES || !SOUND_TYPES.includes(contentType)) throw new HttpsError('invalid-argument', 'Choose an audio file up to 20 MiB.');
  const format = demuxer(bytes, contentType);
  const binary = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;
  if (!binary) throw new HttpsError('unavailable', 'Audio checking is unavailable. Please retry.');
  const directory = await mkdtemp(join(tmpdir(), 'vybe-sound-'));
  try {
    const inputPath = join(directory, 'input'); await writeFile(inputPath, bytes, { flag: 'wx' });
    const pcm = await new Promise<Buffer>((resolveOutput, reject) => {
      const args = ['-nostdin', '-hide_banner', '-loglevel', 'info', '-max_alloc', '33554432', '-threads', '1', '-protocol_whitelist', 'file,pipe',
        '-probesize', '1048576', '-analyzeduration', '2000000', '-f', format,
        ...(format === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []),
        '-i', inputPath, '-map', '0:a:0', '-vn', '-sn', '-dn', '-t', '61', '-threads', '1', '-ac', '2', '-ar', '44100', '-f', 's16le', 'pipe:1'];
      const child = spawn(binary, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = []; let length = 0, diagnostic = '', settled = false;
      let failure: HttpsError | undefined;
      const fail = (message: string) => { if (settled || failure) return; failure = new HttpsError('invalid-argument', message); clearTimeout(timer); child.kill('SIGKILL'); };
      const timer = setTimeout(() => fail('Audio checking timed out. Choose a shorter or simpler recording.'), 25000);
      child.stdout.on('data', (chunk: Buffer) => { length += chunk.length; if (length > 61 * 44100 * 4) fail('The sound exceeds 60 seconds.'); else chunks.push(chunk); });
      child.stderr.on('data', (chunk: Buffer) => { if (diagnostic.length < 65536) diagnostic += chunk.toString('utf8').slice(0, 65536 - diagnostic.length); else fail('The audio container could not be checked.'); });
      child.on('error', () => fail('Audio checking could not start. Please retry.'));
      child.on('close', code => {
        if (settled) return; settled = true; clearTimeout(timer);
        if (failure) { reject(failure); return; }
        // Video containers/streams are not audio uploads. Diagnostic text can
        // only reject a file; it cannot attest a duration or approve bytes.
        if (code !== 0 || /Stream #[^\r\n]*Video:/.test(diagnostic) || length < 4410 * 4 || length > 60 * 44100 * 4 || length % 4 !== 0) {
          reject(new HttpsError('invalid-argument', 'Choose a valid audio-only recording between 0.1 and 60 seconds.')); return;
        }
        resolveOutput(Buffer.concat(chunks, length));
      });
    });
    const header = Buffer.alloc(44); header.write('RIFF', 0); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(44100, 24);
    header.writeUInt32LE(44100 * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    return { bytes: Buffer.concat([header, pcm]), duration: pcm.length / (44100 * 4) };
  } finally {
    // This freshly created directory contains only our literal input filename.
    if (dirname(resolve(directory)) === resolve(tmpdir()) && basename(directory).startsWith('vybe-sound-')) await rm(directory, { recursive: true, force: true });
  }
}
