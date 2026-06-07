import { useRef, useCallback, useEffect, useState } from 'react';
import {
  getARProfile,
  getARDetectIntervalMs,
  getARDetectWidth,
  markARDisabledForSession,
  type ARProfile,
} from '@/lib/arEngine';

// MediaPipe Face Landmark indices for key facial features
export const FACE_LANDMARKS = {
  noseTip: 1,
  forehead: 10,
  chin: 152,
  leftEye: 159,
  rightEye: 386,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  mouthTop: 13,
  mouthBottom: 14,
  mouthLeft: 61,
  mouthRight: 291,
  leftCheek: 234,
  rightCheek: 454,
  leftBrow: 70,
  rightBrow: 300,
} as const;

export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceDetection {
  landmarks: FaceLandmark[];
  faceWidth: number;
  faceHeight: number;
  centerX: number;
  centerY: number;
  roll: number;
}

/** Synthetic face for color/lighting filters when no face is detected yet. */
export function createFallbackFaceDetection(width: number, height: number): FaceDetection {
  const cx = width * 0.5;
  const cy = height * 0.42;
  const faceWidth = width * 0.36;
  const faceHeight = height * 0.46;
  const landmarks: FaceLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.42, z: 0 }));

  landmarks[FACE_LANDMARKS.leftEyeOuter] = { x: 0.38, y: 0.38, z: 0 };
  landmarks[FACE_LANDMARKS.rightEyeOuter] = { x: 0.62, y: 0.38, z: 0 };
  landmarks[FACE_LANDMARKS.leftEye] = { x: 0.4, y: 0.38, z: 0 };
  landmarks[FACE_LANDMARKS.rightEye] = { x: 0.6, y: 0.38, z: 0 };
  landmarks[FACE_LANDMARKS.forehead] = { x: 0.5, y: 0.28, z: 0 };
  landmarks[FACE_LANDMARKS.chin] = { x: 0.5, y: 0.62, z: 0 };
  landmarks[FACE_LANDMARKS.mouthTop] = { x: 0.5, y: 0.52, z: 0 };
  landmarks[FACE_LANDMARKS.mouthBottom] = { x: 0.5, y: 0.56, z: 0 };
  landmarks[FACE_LANDMARKS.mouthLeft] = { x: 0.44, y: 0.54, z: 0 };
  landmarks[FACE_LANDMARKS.mouthRight] = { x: 0.56, y: 0.54, z: 0 };

  return {
    landmarks,
    faceWidth,
    faceHeight,
    centerX: cx,
    centerY: cy,
    roll: 0,
  };
}

interface UseFaceTrackingOptions {
  enabled?: boolean;
  maxFaces?: number;
}

let faceLandmarkerInstance: any = null;
let initPromise: Promise<any> | null = null;
let initProfile: ARProfile | null = null;

function smoothLandmarks(prev: FaceLandmark[] | null, next: FaceLandmark[], alpha: number): FaceLandmark[] {
  if (!prev || prev.length !== next.length) return next;
  return next.map((lm, i) => ({
    x: prev[i].x * (1 - alpha) + lm.x * alpha,
    y: prev[i].y * (1 - alpha) + lm.y * alpha,
    z: (prev[i].z ?? 0) * (1 - alpha) + (lm.z ?? 0) * alpha,
  }));
}

function smoothDetection(prev: FaceDetection | null, next: FaceDetection, alpha: number): FaceDetection {
  if (!prev) return next;
  return {
    landmarks: smoothLandmarks(prev.landmarks, next.landmarks, alpha),
    faceWidth: prev.faceWidth * (1 - alpha) + next.faceWidth * alpha,
    faceHeight: prev.faceHeight * (1 - alpha) + next.faceHeight * alpha,
    centerX: prev.centerX * (1 - alpha) + next.centerX * alpha,
    centerY: prev.centerY * (1 - alpha) + next.centerY * alpha,
    roll: prev.roll * (1 - alpha) + next.roll * alpha,
  };
}

async function getFaceLandmarker(profile: ARProfile) {
  if (faceLandmarkerInstance && initProfile === profile) return faceLandmarkerInstance;
  if (initPromise && initProfile === profile) return initPromise;

  initProfile = profile;
  initPromise = (async () => {
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const { FaceLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
      );

      const delegates = profile === 'lite' ? (['CPU'] as const) : (['GPU', 'CPU'] as const);
      let landmarker: any = null;

      for (const delegate of delegates) {
        try {
          landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate,
            },
            runningMode: 'VIDEO',
            numFaces: profile === 'lite' ? 1 : 2,
            minFaceDetectionConfidence: profile === 'lite' ? 0.55 : 0.5,
            minTrackingConfidence: profile === 'lite' ? 0.55 : 0.5,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          });
          console.log(`[FaceTracking] Initialized (${profile}, ${delegate})`);
          break;
        } catch (delegateErr) {
          console.warn(`[FaceTracking] ${delegate} failed:`, delegateErr);
        }
      }

      if (!landmarker) throw new Error('All delegates failed');
      faceLandmarkerInstance = landmarker;
      return faceLandmarkerInstance;
    } catch (err) {
      console.error('[FaceTracking] Failed to initialize:', err);
      markARDisabledForSession();
      initPromise = null;
      faceLandmarkerInstance = null;
      return null;
    }
  })();

  return initPromise;
}

export function useFaceTracking({ enabled = true, maxFaces = 1 }: UseFaceTrackingOptions = {}) {
  const [faces, setFaces] = useState<FaceDetection[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<ARProfile>('off');

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const enabledRef = useRef(enabled);
  const smoothRef = useRef<FaceDetection[]>([]);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const profileRef = useRef<ARProfile>('off');

  enabledRef.current = enabled;

  useEffect(() => {
    const arProfile = getARProfile();
    setProfile(arProfile);
    profileRef.current = arProfile;

    if (!enabled || arProfile === 'off') {
      setIsLoading(false);
      setIsReady(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getFaceLandmarker(arProfile).then((landmarker) => {
      if (cancelled) return;
      if (!landmarker) {
        setIsReady(false);
        setIsLoading(false);
        return;
      }
      landmarkerRef.current = landmarker;
      setIsReady(true);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const startTracking = useCallback(
    (video: HTMLVideoElement) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      videoRef.current = video;

      const detect = () => {
        if (!enabledRef.current || !landmarkerRef.current || !videoRef.current) return;

        const vid = videoRef.current;
        if (vid.readyState < 2 || vid.paused) {
          rafRef.current = requestAnimationFrame(detect);
          return;
        }

        const now = performance.now();
        const interval = getARDetectIntervalMs(profileRef.current);
        if (now - lastTimeRef.current < interval) {
          rafRef.current = requestAnimationFrame(detect);
          return;
        }
        lastTimeRef.current = now;

        try {
          const detectWidth = getARDetectWidth(profileRef.current);
          let results: any;

          if (detectWidth && vid.videoWidth > 0) {
            if (!detectCanvasRef.current) {
              detectCanvasRef.current = document.createElement('canvas');
              detectCtxRef.current = detectCanvasRef.current.getContext('2d', {
                willReadFrequently: true,
              });
            }
            const dc = detectCanvasRef.current;
            const dctx = detectCtxRef.current;
            if (dctx) {
              const aspect = vid.videoHeight / vid.videoWidth;
              dc.width = detectWidth;
              dc.height = Math.max(1, Math.round(detectWidth * aspect));
              dctx.drawImage(vid, 0, 0, dc.width, dc.height);
              results = landmarkerRef.current.detectForVideo(dc, now);
            } else {
              results = landmarkerRef.current.detectForVideo(vid, now);
            }
          } else {
            results = landmarkerRef.current.detectForVideo(vid, now);
          }

          if (results?.faceLandmarks?.length) {
            const smoothAlpha = profileRef.current === 'lite' ? 0.42 : 0.55;
            const detections: FaceDetection[] = results.faceLandmarks
              .slice(0, maxFaces)
              .map((landmarks: FaceLandmark[], idx: number) => {
                const leftEye = landmarks[FACE_LANDMARKS.leftEyeOuter];
                const rightEye = landmarks[FACE_LANDMARKS.rightEyeOuter];
                const chin = landmarks[FACE_LANDMARKS.chin];
                const forehead = landmarks[FACE_LANDMARKS.forehead];

                const w = vid.videoWidth;
                const h = vid.videoHeight;

                const raw: FaceDetection = {
                  landmarks,
                  faceWidth: Math.abs(rightEye.x - leftEye.x) * w * 2.2,
                  faceHeight: Math.abs(chin.y - forehead.y) * h * 1.2,
                  centerX: ((leftEye.x + rightEye.x) / 2) * w,
                  centerY: ((forehead.y + chin.y) / 2) * h,
                  roll: Math.atan2(
                    (rightEye.y - leftEye.y) * h,
                    (rightEye.x - leftEye.x) * w,
                  ),
                };
                const prev = smoothRef.current[idx];
                return smoothDetection(prev ?? null, raw, smoothAlpha);
              });

            smoothRef.current = detections;
            setFaces(detections);
          } else {
            smoothRef.current = [];
            setFaces([]);
          }
        } catch {
          // transient — retry next frame
        }

        rafRef.current = requestAnimationFrame(detect);
      };

      rafRef.current = requestAnimationFrame(detect);
    },
    [maxFaces],
  );

  const stopTracking = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    videoRef.current = null;
    smoothRef.current = [];
    setFaces([]);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { faces, isReady, isLoading, profile, startTracking, stopTracking };
}
