import { useRef, useEffect, useCallback, memo, forwardRef, useImperativeHandle } from 'react';
import { FaceDetection, FACE_LANDMARKS } from '@/hooks/useFaceTracking';
import { ARFilterDef, ParticleSystem } from '@/lib/arFilters';
import { getPrimaryHex } from '@/lib/themeColor';

interface AROverlayCanvasProps {
  faces: FaceDetection[];
  filter: ARFilterDef | null;
  videoWidth: number;
  videoHeight: number;
  mirrored?: boolean;
  /** True when AR is active but no face locked yet — show search reticle. */
  scanning?: boolean;
}

/**
 * GPU-accelerated canvas overlay that renders AR effects on face landmarks.
 */
export const AROverlayCanvas = memo(
  forwardRef<HTMLCanvasElement, AROverlayCanvasProps>(function AROverlayCanvas(
    { faces, filter, videoWidth, videoHeight, mirrored = false, scanning = false },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<ParticleSystem | null>(null);
    const rafRef = useRef<number>(0);
    const facesRef = useRef(faces);
    const filterRef = useRef(filter);
    const scanningRef = useRef(scanning);
    const dimsRef = useRef({ w: 0, h: 0 });
    const scanPhaseRef = useRef(0);

    facesRef.current = faces;
    filterRef.current = filter;
    scanningRef.current = scanning;

    useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement);

    useEffect(() => {
      if (!particlesRef.current) {
        particlesRef.current = new ParticleSystem();
      }
      return () => {
        particlesRef.current = null;
      };
    }, []);

    const isFinite = (...vals: number[]) => vals.every((v) => Number.isFinite(v) && !Number.isNaN(v));

    const drawScanReticle = useCallback(
      (ctx: CanvasRenderingContext2D, w: number, h: number, phase: number) => {
        const primary = getPrimaryHex();
        const cx = w / 2;
        const cy = h * 0.42;
        const pulse = 0.5 + 0.5 * Math.sin(phase * 0.08);
        const r = Math.min(w, h) * (0.22 + pulse * 0.04);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(phase * 0.02);

        ctx.strokeStyle = primary + Math.round((0.35 + pulse * 0.25) * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        const corner = r * 0.72;
        const len = r * 0.22;
        ctx.lineWidth = 3;
        ctx.strokeStyle = primary + Math.round((0.55 + pulse * 0.35) * 255).toString(16).padStart(2, '0');
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(sx * corner, sy * (corner - len));
          ctx.lineTo(sx * corner, sy * corner);
          ctx.lineTo(sx * (corner - len), sy * corner);
          ctx.stroke();
        }

        ctx.fillStyle = primary + Math.round((0.5 + pulse * 0.4) * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(0, 0, 3 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      },
      [],
    );

    const render = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const currentFaces = facesRef.current;
      const currentFilter = filterRef.current;
      const isScanning = scanningRef.current;

      if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        dimsRef.current = { w: videoWidth, h: videoHeight };
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      scanPhaseRef.current += 1;

      if (!currentFilter) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      if (isScanning && currentFaces.length === 0) {
        drawScanReticle(ctx, canvas.width, canvas.height, scanPhaseRef.current);
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      if (currentFaces.length === 0) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      if (mirrored) {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      for (const face of currentFaces) {
        const lm = face.landmarks;

        if (currentFilter.colorGrade) {
          ctx.save();
          ctx.globalAlpha = currentFilter.colorGrade.opacity;
          ctx.fillStyle = currentFilter.colorGrade.color;
          ctx.globalCompositeOperation =
            (currentFilter.colorGrade.blendMode as GlobalCompositeOperation) || 'overlay';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }

        if (currentFilter.masks) {
          for (const mask of currentFilter.masks) {
            ctx.save();

            let x = 0;
            let y = 0;
            let w = face.faceWidth;
            let h = face.faceHeight;

            switch (mask.anchor) {
              case 'eyes': {
                const le = lm[FACE_LANDMARKS.leftEyeOuter];
                const re = lm[FACE_LANDMARKS.rightEyeOuter];
                x = le.x * canvas.width;
                y = ((le.y + re.y) / 2) * canvas.height;
                w = Math.abs(re.x - le.x) * canvas.width * 1.6;
                h = w * 0.4;
                x -= w * 0.1;
                y -= h * 0.5;
                break;
              }
              case 'mouth': {
                const mt = lm[FACE_LANDMARKS.mouthTop];
                const mb = lm[FACE_LANDMARKS.mouthBottom];
                const ml = lm[FACE_LANDMARKS.mouthLeft];
                const mr = lm[FACE_LANDMARKS.mouthRight];
                x = ml.x * canvas.width;
                y = mt.y * canvas.height;
                w = (mr.x - ml.x) * canvas.width * 1.3;
                h = (mb.y - mt.y) * canvas.height * 2;
                x -= w * 0.1;
                y -= h * 0.15;
                break;
              }
              case 'forehead': {
                const fh = lm[FACE_LANDMARKS.forehead];
                x = face.centerX - face.faceWidth * 0.5;
                y = fh.y * canvas.height - face.faceHeight * 0.15;
                w = face.faceWidth;
                h = face.faceHeight * 0.3;
                break;
              }
              case 'fullFace':
              default: {
                x = face.centerX - face.faceWidth * 0.5;
                y = face.centerY - face.faceHeight * 0.5;
                w = face.faceWidth;
                h = face.faceHeight;
                break;
              }
            }

            ctx.translate(face.centerX, face.centerY);
            ctx.rotate(face.roll);
            ctx.translate(-face.centerX, -face.centerY);

            const sx = mask.scale || 1;
            const offsetX = mask.offsetX || 0;
            const offsetY = mask.offsetY || 0;

            ctx.globalAlpha = mask.opacity ?? 0.8;

            if (mask.type === 'glow') {
              const cx0 = x + w / 2 + offsetX;
              const cy0 = y + h / 2 + offsetY;
              const r0 = Math.max(0.01, w * sx * 0.6);
              if (!isFinite(cx0, cy0, r0)) {
                ctx.restore();
                continue;
              }
              const gradient = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, r0);
              gradient.addColorStop(0, mask.color + 'cc');
              gradient.addColorStop(0.5, mask.color + '44');
              gradient.addColorStop(1, 'transparent');
              ctx.fillStyle = gradient;
              ctx.fillRect(
                x + offsetX - w * 0.3,
                y + offsetY - h * 0.3,
                w * sx * 1.6,
                h * sx * 1.6,
              );
            } else if (mask.type === 'solid') {
              ctx.fillStyle = mask.color;
              ctx.beginPath();
              ctx.ellipse(
                x + w / 2 + offsetX,
                y + h / 2 + offsetY,
                (w * sx) / 2,
                (h * sx) / 2,
                0,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            } else if (mask.type === 'outline') {
              ctx.strokeStyle = mask.color;
              ctx.lineWidth = mask.lineWidth || 3;
              ctx.beginPath();
              ctx.ellipse(
                x + w / 2 + offsetX,
                y + h / 2 + offsetY,
                (w * sx) / 2,
                (h * sx) / 2,
                0,
                0,
                Math.PI * 2,
              );
              ctx.stroke();
            } else if (mask.type === 'emoji') {
              const fontSize = w * sx * 0.8;
              ctx.font = `${fontSize}px serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(mask.emoji || '✨', x + w / 2 + offsetX, y + h / 2 + offsetY);
            }

            ctx.restore();
          }
        }

        if (currentFilter.particles && particlesRef.current) {
          const ps = particlesRef.current;
          const pc = currentFilter.particles;

          let spawnX = face.centerX;
          let spawnY = face.centerY;

          if (pc.anchor === 'eyes') {
            const le = lm[FACE_LANDMARKS.leftEye];
            const re = lm[FACE_LANDMARKS.rightEye];
            spawnX = ((le.x + re.x) / 2) * canvas.width;
            spawnY = ((le.y + re.y) / 2) * canvas.height;
          } else if (pc.anchor === 'forehead') {
            const fh = lm[FACE_LANDMARKS.forehead];
            spawnX = fh.x * canvas.width;
            spawnY = fh.y * canvas.height;
          } else if (pc.anchor === 'mouth') {
            const mt = lm[FACE_LANDMARKS.mouthTop];
            spawnX = mt.x * canvas.width;
            spawnY = mt.y * canvas.height;
          }

          ps.spawn(spawnX, spawnY, face.faceWidth, pc);
          ps.update();
          ps.draw(ctx);
        }

        if (currentFilter.lighting) {
          ctx.save();
          const lg = currentFilter.lighting;
          const lcx = face.centerX + (lg.offsetX || 0);
          const lcy = face.centerY + (lg.offsetY || 0);
          const lr = Math.max(0.01, face.faceWidth * (lg.radius || 1));
          if (isFinite(lcx, lcy, lr, face.centerX, face.centerY)) {
            const gradient = ctx.createRadialGradient(lcx, lcy, 0, face.centerX, face.centerY, lr);
            gradient.addColorStop(
              0,
              lg.color +
                (lg.intensity
                  ? Math.round(lg.intensity * 255)
                      .toString(16)
                      .padStart(2, '0')
                  : '33'),
            );
            gradient.addColorStop(1, 'transparent');
            ctx.globalCompositeOperation = (lg.blendMode as GlobalCompositeOperation) || 'screen';
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.restore();
        }
      }

      if (mirrored) {
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(render);
    }, [videoWidth, videoHeight, mirrored, drawScanReticle]);

    useEffect(() => {
      if (filter) {
        rafRef.current = requestAnimationFrame(render);
      }
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [filter, render]);

    if (!filter) return null;

    return (
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ objectFit: 'cover', zIndex: 15 }}
      />
    );
  }),
);
