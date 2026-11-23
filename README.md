# kine.

**Physio that sees you.** A physiotherapist prescribes a home programme. The patient's phone camera then guides them through it: it counts every rep, corrects form out loud, and chains each exercise, set and rest automatically.

The app is built for people who can't easily get to a clinic: older adults exercising at home, and busy people who travel a lot.

**Live:** https://cchapa-dotcom.github.io/Physio/

**Privacy:** pose tracking runs on the phone ([MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)). Video is never recorded or uploaded, and there is no server or account.

## How it works

1. **The physio prescribes** (`#/pt`). They pick exercises, set sets, reps, rest and hold time, and add a note per exercise and a message to the patient. Then they tap **Create patient link** to get a link and a QR code.
2. **The patient opens the link** on their phone. They accept the safety notice, and the plan is saved on the device.
3. **Guided session.** The camera stays on for the whole session:
   - an intro card for each exercise (setup, steps, the physio's note, read aloud);
   - automatic "got you" detection, then a 3-2-1 countdown;
   - live rep counting and form corrections;
   - a rest timer (+15 s / skip) before the next set or exercise.
4. **Results go back to the physio.** The patient taps **Send to my physio**, which shares a report link. The physio opens it to see adherence, completion, form scores, sessions stopped for pain, and the most frequent corrections.

Both links are self-contained (base64url JSON in the URL fragment). That keeps the app fully static: it can be hosted anywhere, and no patient data ever touches a server.

## Features

- **7 exercises**, each with camera form checks: Sit to Stand, Squat, Side Arm Raises, Seated Knee Extension, Standing March, Glute Bridge and Heel Raises.
- **Two built-in routines** for people without a prescription: *Steady Strength* (gentle, for balance) and *Hotel Room 12* (for travellers).
- **Safety:** a consent screen, and a **"Stop · it hurts"** button on every set that ends the session, gives guidance, and is flagged in the physio's report.
- **Progress tracking:** weekly target ring, streak, week dots, form scores and session history.
- **Accessibility:** extra-large text option, voice coaching, a screen that stays awake, and auto-pause if you leave the app.
- **Offline:** works without signal once installed as a PWA ("Add to Home Screen").
- **Demo mode** on every plan and exercise, so you can see the full guided flow without a camera.

## Run it

```bash
npm install
npm run vendor   # copies the MediaPipe runtime + downloads the pose model into ./vendor (optional; otherwise loaded from CDN)
npm start        # http://localhost:8080
npm test         # 39 unit + end-to-end logic tests
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
| `src/program.js` | Prescription and report links, session step planning, adherence maths |
| `src/session.js` | Guided session runner (camera, chaining, rest timers, coaching) |
| `src/clinician.js` | Physio plan builder (with QR code) and report viewer |
| `src/exercises.js` | Exercise library: setup instructions, thresholds, and form rules with their cues. Add new exercises here. |
| `src/engine.js` | Generic rep counter and fault tracker (no DOM, fully unit-tested) |
| `src/demo.js` | Synthetic skeleton generator, used by demo mode and the tests |
| `src/pose.js` | MediaPipe loader (self-hosted first, CDN fallback; GPU with CPU fallback) |
| `src/coach.js` | Speech synthesis and cue throttling |
| `src/app.js` | Router and patient screens |
| `src/ui.js`, `styles.css` | Design system: icons, rings, line-art figures |
| `sw.js` | Offline caching |

## Limitations and next steps

- Thresholds are sensible defaults, not clinically validated. The next step is to tune them against recorded sessions, ideally reviewed by a physiotherapist.
- Uses a single 2D camera view, so movements that happen across the camera's line of sight (such as knees caving inward in a side view) can't be judged.
- Next: a small backend for clinician accounts and a live patient dashboard (instead of report links), per-user range-of-motion calibration, a fall-detection alert to a family member, more exercises (balance, wall push-ups, neck and back mobility), and other languages.

> Not a medical device. kine. supports, and does not replace, advice from a qualified healthcare professional.
