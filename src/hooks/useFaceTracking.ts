import { useRef, useCallback, useEffect, useState } from 'react';

// MediaPipe Face Landmark indices for key facial features
export const FACE_LANDMARKS = {
  // Nose tip
  noseTip: 1,
  // Forehead (above nose bridge)
  forehead: 10,
  // Chin
  chin: 152,
  // Left eye center
  leftEye: 159,
  // Right eye center
  rightEye: 386,
  // Left eye outer
  leftEyeOuter: 33,
  // Right eye outer
  rightEyeOuter: 263,
  // Mouth center top
  mouthTop: 13,
  // Mouth center bottom
  mouthBottom: 14,
  // Left mouth corner
  mouthLeft: 61,
  // Right mouth corner
  mouthRight: 291,
  // Left cheek
  leftCheek: 234,
  // Right cheek
  rightCheek: 454,
  // Left eyebrow
  leftBrow: 70,
  // Right eyebrow
  rightBrow: 300,
} as const;

export interface FaceLandmark {
  x: number; // 0-1 normalized
  y: number;
  z: number;
}

export interface FaceDetection {
  landmarks: FaceLandmark[];
  faceWidth: number;   // Approximate face width in pixels
  faceHeight: number;  // Approximate face height in pixels
  centerX: number;     // Face center X in pixels
  centerY: number;     // Face center Y in pixels
  roll: number;        // Head roll in radians
}

interface UseFaceTrackingOptions {
  enabled?: boolean;
  maxFaces?: number;
}

let faceLandmarkerInstance: any = null;
let initPromise: Promise<any> | null = null;

async function getFaceLandmarker() {
  if (faceLandmarkerInstance) return faceLandmarkerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // @ts-ignore - dynamic import for WASM module
      const vision = await import('@mediapipe/tasks-vision');
      const { FaceLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      faceLandmarkerInstance = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 2,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      return faceLandmarkerInstance;
    } catch (err) {
      console.error('[FaceTracking] Failed to initialize:', err);
      initPromise = null;
      return null;
    }
  })();

  return initPromise;
}

export function useFaceTracking({ enabled = true, maxFaces = 1 }: UseFaceTrackingOptions = {}) {
  const [faces, setFaces] = useState<FaceDetection[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Initialize MediaPipe
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setIsLoading(true);

    getFaceLandmarker().then(landmarker => {
      if (cancelled || !landmarker) return;
      landmarkerRef.current = landmarker;
      setIsReady(true);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [enabled]);

  // Detection loop
  const startTracking = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;

    const detect = () => {
      if (!enabledRef.current || !landmarkerRef.current || !videoRef.current) return;

      const vid = videoRef.current;
      if (vid.readyState < 2 || vid.paused) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();
      // Throttle to ~30fps for performance
      if (now - lastTimeRef.current < 33) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      lastTimeRef.current = now;

      try {
        const results = landmarkerRef.current.detectForVideo(vid, now);

        if (results?.faceLandmarks?.length) {
          const detections: FaceDetection[] = results.faceLandmarks
            .slice(0, maxFaces)
            .map((landmarks: FaceLandmark[]) => {
              const leftEye = landmarks[FACE_LANDMARKS.leftEyeOuter];
              const rightEye = landmarks[FACE_LANDMARKS.rightEyeOuter];
              const chin = landmarks[FACE_LANDMARKS.chin];
              const forehead = landmarks[FACE_LANDMARKS.forehead];

              const w = vid.videoWidth;
              const h = vid.videoHeight;

              const faceWidth = Math.abs(rightEye.x - leftEye.x) * w * 2.2;
              const faceHeight = Math.abs(chin.y - forehead.y) * h * 1.2;
              const centerX = (leftEye.x + rightEye.x) / 2 * w;
              const centerY = (forehead.y + chin.y) / 2 * h;

              // Calculate head roll from eye positions
              const roll = Math.atan2(
                (rightEye.y - leftEye.y) * h,
                (rightEye.x - leftEye.x) * w
              );

              return { landmarks, faceWidth, faceHeight, centerX, centerY, roll };
            });

          setFaces(detections);
        } else {
          setFaces([]);
        }
      } catch {
        // Detection can fail transiently — just retry next frame
      }

      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);
  }, [maxFaces]);

  const stopTracking = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    videoRef.current = null;
    setFaces([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { faces, isReady, isLoading, startTracking, stopTracking };
}
