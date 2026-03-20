import { useRef, useEffect, useCallback, memo } from 'react';
import { FaceDetection, FACE_LANDMARKS } from '@/hooks/useFaceTracking';
import { ARFilterDef, ParticleSystem } from '@/lib/arFilters';

interface AROverlayCanvasProps {
  faces: FaceDetection[];
  filter: ARFilterDef | null;
  videoWidth: number;
  videoHeight: number;
  mirrored?: boolean;
}

/**
 * GPU-accelerated canvas overlay that renders AR effects
 * on top of detected face landmarks.
 */
export const AROverlayCanvas = memo(function AROverlayCanvas({
  faces,
  filter,
  videoWidth,
  videoHeight,
  mirrored = false,
}: AROverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<ParticleSystem | null>(null);
  const rafRef = useRef<number>(0);
  const facesRef = useRef(faces);
  const filterRef = useRef(filter);
  facesRef.current = faces;
  filterRef.current = filter;

  // Initialize particle system
  useEffect(() => {
    if (!particlesRef.current) {
      particlesRef.current = new ParticleSystem();
    }
    return () => {
      particlesRef.current = null;
    };
  }, []);

  // Guard helper: returns true if all values are finite numbers
  const isFinite = (...vals: number[]) => vals.every(v => Number.isFinite(v) && !Number.isNaN(v));

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const currentFaces = facesRef.current;
    const currentFilter = filterRef.current;

    canvas.width = videoWidth;
    canvas.height = videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentFilter || currentFaces.length === 0) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }

    // Mirror context if front camera
    if (mirrored) {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    for (const face of currentFaces) {
      const lm = face.landmarks;

      // Apply color grading overlay
      if (currentFilter.colorGrade) {
        ctx.save();
        ctx.globalAlpha = currentFilter.colorGrade.opacity;
        ctx.fillStyle = currentFilter.colorGrade.color;
        ctx.globalCompositeOperation = currentFilter.colorGrade.blendMode as GlobalCompositeOperation || 'overlay';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Draw mask overlays on face landmarks
      if (currentFilter.masks) {
        for (const mask of currentFilter.masks) {
          ctx.save();

          let x = 0, y = 0, w = face.faceWidth, h = face.faceHeight;

          switch (mask.anchor) {
            case 'eyes': {
              const le = lm[FACE_LANDMARKS.leftEyeOuter];
              const re = lm[FACE_LANDMARKS.rightEyeOuter];
              x = le.x * canvas.width;
              y = ((le.y + re.y) / 2) * canvas.height;
              w = Math.abs(re.x - le.x) * canvas.width * 1.6;
              h = w * 0.4;
              x -= w * 0.1; // offset left
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

          // Apply rotation
          ctx.translate(face.centerX, face.centerY);
          ctx.rotate(face.roll);
          ctx.translate(-face.centerX, -face.centerY);

          // Scale adjustment
          const sx = (mask.scale || 1);
          const offsetX = mask.offsetX || 0;
          const offsetY = mask.offsetY || 0;

          // Draw the mask shape
          ctx.globalAlpha = mask.opacity ?? 0.8;

          if (mask.type === 'glow') {
            const gradient = ctx.createRadialGradient(
              x + w / 2 + offsetX, y + h / 2 + offsetY, 0,
              x + w / 2 + offsetX, y + h / 2 + offsetY, w * sx * 0.6
            );
            gradient.addColorStop(0, mask.color + 'cc');
            gradient.addColorStop(0.5, mask.color + '44');
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.fillRect(
              x + offsetX - w * 0.3, y + offsetY - h * 0.3,
              w * sx * 1.6, h * sx * 1.6
            );
          } else if (mask.type === 'solid') {
            ctx.fillStyle = mask.color;
            ctx.beginPath();
            ctx.ellipse(
              x + w / 2 + offsetX, y + h / 2 + offsetY,
              w * sx / 2, h * sx / 2, 0, 0, Math.PI * 2
            );
            ctx.fill();
          } else if (mask.type === 'outline') {
            ctx.strokeStyle = mask.color;
            ctx.lineWidth = mask.lineWidth || 3;
            ctx.beginPath();
            ctx.ellipse(
              x + w / 2 + offsetX, y + h / 2 + offsetY,
              w * sx / 2, h * sx / 2, 0, 0, Math.PI * 2
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

      // Spawn and render particles
      if (currentFilter.particles && particlesRef.current) {
        const ps = particlesRef.current;
        const pc = currentFilter.particles;

        // Spawn from configured anchor
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

      // Draw lighting effects
      if (currentFilter.lighting) {
        ctx.save();
        const lg = currentFilter.lighting;
        const gradient = ctx.createRadialGradient(
          face.centerX + (lg.offsetX || 0),
          face.centerY + (lg.offsetY || 0),
          0,
          face.centerX,
          face.centerY,
          face.faceWidth * (lg.radius || 1)
        );
        gradient.addColorStop(0, lg.color + (lg.intensity ? Math.round(lg.intensity * 255).toString(16).padStart(2, '0') : '33'));
        gradient.addColorStop(1, 'transparent');
        ctx.globalCompositeOperation = lg.blendMode as GlobalCompositeOperation || 'screen';
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    if (mirrored) {
      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(render);
  }, [videoWidth, videoHeight, mirrored]);

  // Start/stop render loop
  useEffect(() => {
    if (filter && faces.length > 0) {
      rafRef.current = requestAnimationFrame(render);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [filter, faces.length > 0, render]);

  if (!filter) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ objectFit: 'cover', zIndex: 15 }}
    />
  );
});
