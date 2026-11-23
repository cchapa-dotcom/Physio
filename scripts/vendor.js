// Copies the MediaPipe runtime from node_modules and downloads the pose model
// into ./vendor so the app can be self-hosted and work fully offline.
// Usage: npm install && npm run vendor
import { cp, mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'vendor');
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

await mkdir(path.join(out, 'tasks-vision'), { recursive: true });
const pkg = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision');
await cp(path.join(pkg, 'vision_bundle.mjs'), path.join(out, 'tasks-vision', 'vision_bundle.mjs'));
await cp(path.join(pkg, 'wasm'), path.join(out, 'tasks-vision', 'wasm'), { recursive: true });
console.log('Copied MediaPipe runtime.');

const modelPath = path.join(out, 'pose_landmarker_lite.task');
try {
  await access(modelPath);
  console.log('Model already present.');
} catch {
  const res = await fetch(MODEL);
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
  console.log('Downloaded pose model.');
}
