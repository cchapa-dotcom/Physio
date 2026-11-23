# Physio Coach

A pocket physiotherapist for people who can't easily get to a clinic: older adults exercising at home, and busy people who travel a lot. Prop your phone up, do your exercises, and the app watches through the camera. It counts your reps, checks your form and tells you out loud how to correct it.

**Privacy:** pose tracking runs entirely on the phone ([MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)). Video never leaves the device, and history is stored only in the browser.

## What it does

- **7 guided exercises:** Sit to Stand, Bodyweight Squat, Side Arm Raises, Seated Knee Extension, Standing March, Glute Bridge and Heel Raises. Each can be filtered by *Gentle · at home* or *On the go*.
- **Live form correction**, spoken and shown on screen. Examples: "Keep your chest up", "Keep your elbows straight", "Raise both arms evenly", "Sit down slowly — don't drop into the chair", "Hold at the top for 2 seconds", "Remember to switch legs". The joints involved turn amber on the skeleton overlay.
- **Rep counting** with hold timers, tempo checks, and gentle "go a little further" cues for partial reps. Partial reps are not counted.
- **Built for safety and accessibility:**
  - A consent and safety screen before first use.
  - A big red **"Stop – it hurts"** button that ends the session and shows clear guidance, including when to call emergency services.
  - Large tap targets, an extra-large-text option, and dark mode.
  - The screen stays awake during a set, and the set pauses automatically if you leave the app.
- **Progress and sharing:** streaks, session history and a form score. **"Send to my physio"** shares a plain-text log through the phone's share sheet (email, WhatsApp and so on).
- **Works offline** once installed as a PWA ("Add to Home Screen"), so it keeps working on planes and in hotels with bad wifi.
- **Demo mode** (no camera) plays a scripted workout with deliberate mistakes so you can see the coaching. You can also open `?demo` in the URL.

## Run it

```bash
npm install
npm run vendor   # copies the MediaPipe runtime + downloads the pose model into ./vendor (optional; otherwise loaded from CDN)
npm start        # http://localhost:8080
npm test         # 33 unit + end-to-end logic tests
```

Browsers only allow camera access over HTTPS, or on `localhost`. To try it on a phone, deploy the folder to any static HTTPS host, such as GitHub Pages, Netlify or Cloudflare Pages. Run `npm run vendor` first if you want the model self-hosted for offline use.

## How it works

```
camera ─► MediaPipe pose (33 landmarks, on-device)
        ─► exercise.measure()   joint angles: knee, hip, trunk lean, arm abduction, heel lift…
        ─► RepEngine            smoothing → progress 0..1 → rest/moving/peak/returning state machine
                                per-frame form checks (must persist ≥5 frames to filter jitter)
                                per-rep checks (hold time, tempo, alternating legs, full extension)
        ─► Coach                voice + on-screen cues, throttled so corrections aren't repeated constantly
```

| File | Purpose |
|---|---|
| `src/exercises.js` | Exercise library: setup instructions, thresholds, and form rules with their cues. Add new exercises here. |
| `src/engine.js` | Generic rep counter and fault tracker (no DOM, fully unit-tested) |
| `src/demo.js` | Synthetic skeleton generator, used by demo mode and the tests |
| `src/pose.js` | MediaPipe loader (self-hosted first, CDN fallback; GPU with CPU fallback) |
| `src/coach.js` | Speech synthesis and cue throttling |
| `src/app.js` | UI screens and session loop |
| `sw.js` | Offline caching |

## Limitations and next steps

- Thresholds are sensible defaults, not clinically validated. The next step is to tune them against recorded sessions, ideally reviewed by a physiotherapist.
- Uses a single 2D camera view, so movements that happen across the camera's line of sight (such as knees caving inward in a side view) can't be judged.
- Ideas: clinician-assigned programmes and remote dashboards, per-user range-of-motion calibration, a fall-detection alert to a family member, more exercises (balance, wall push-ups, neck and back mobility), and other languages.

> Not a medical device. Physio Coach supports, and does not replace, advice from a qualified healthcare professional.
