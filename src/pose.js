// Loads the MediaPipe pose model. Everything runs on the device — video never
// leaves the phone. Prefers a self-hosted copy (npm run vendor) so the app
// works offline once installed, falling back to the public CDN.

const VERSION = '0.10.14';
const SOURCES = [
  {
    module: new URL('../vendor/tasks-vision/vision_bundle.mjs', import.meta.url).href,
    wasm: new URL('../vendor/tasks-vision/wasm', import.meta.url).href,
    model: new URL('../vendor/pose_landmarker_lite.task', import.meta.url).href,
  },
  {
    module: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`,
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`,
    model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
];

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

export async function createPoseDetector() {
  let lastError;
  for (const src of SOURCES) {
    try {
      if (src.module.startsWith(location.origin) && !(await exists(src.model))) continue;
      const { FilesetResolver, PoseLandmarker } = await import(src.module);
      const fileset = await FilesetResolver.forVisionTasks(src.wasm);
      const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: src.model, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      let landmarker;
      try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
      return {
        detect(video, timeMs) {
          const res = landmarker.detectForVideo(video, timeMs);
          return res.landmarks?.[0] || null;
        },
        close() { landmarker.close(); },
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('Could not load the pose model.');
}
