import { memo } from 'react';

/** Lightweight theme blobs behind boot splash — visible before React aurora mounts. */
export const SplashAmbientBubbles = memo(function SplashAmbientBubbles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="vybe-splash-ambient-mesh absolute inset-0" />
      {[
        { id: 'a', top: '14%', left: '16%', size: 420, dur: 58 },
        { id: 'b', top: '68%', left: '74%', size: 520, dur: 72 },
        { id: 'c', top: '42%', left: '48%', size: 360, dur: 64 },
      ].map((blob) => (
        <div
          key={blob.id}
          className={`vybe-splash-ambient-blob vybe-splash-ambient-blob--${blob.id}`}
          style={{
            top: blob.top,
            left: blob.left,
            width: blob.size,
            height: blob.size,
            ['--blob-dur' as string]: `${blob.dur}s`,
          }}
        />
      ))}
    </div>
  );
});
