# Clara — the second opinion you need before you buy

Clara is an honest AI image advisor. Show her a garment you love from **any** store or Instagram post: she
tries it on you with YouCam AI, judges its **cut** and its **color** separately against your measured
proportions and undertone, explains *why* with visible evidence, and—if it isn't your best option—shows you
how to make it work.

Built for the YouCam hackathon, category **eCommerce VTO** (beauty + fashion in one experience).

## Why

Buying clothes online means deciding alone. A friend is kind but not an expert; a stylist is expert but
expensive and not with you when you shop; color-analysis apps hand you an abstract palette; virtual
try-ons show the garment on you but never give an opinion. Clara starts from the piece *you* chose and
answers "how does this look on me?" with an honest, explained verdict.

- **For shoppers:** fewer regrets, a clear reason behind every recommendation, and a rescue instead of a "no".
- **For stores:** fewer impulse purchases that end in returns, fewer lost sales (the rescue shows how to wear
  the piece instead of discarding it), and a natural cross-sell for makeup and accessories.

## How it works

1. **The piece.** Upload a screenshot or product photo. YouCam **background removal** isolates the garment
   and Clara measures its dominant color (k-means in CIELAB). Claude (vision) pre-fills its type, neckline,
   length and fit as chips the user confirms or corrects.
2. **You.** A selfie and a full-body photo plus your height. YouCam **Facial Color Tones Analyzer** measures
   skin, hair, eye and lip colors; Clara derives undertone (skin hue angle), depth (ITA°) and contrast
   (ΔL* skin vs hair/eyes). Proportions (shoulders vs hips, waist definition, torso vs legs) are measured
   **in the browser** with MediaPipe pose landmarks and the person segmentation mask.
3. **Your profile, with evidence.** Every classification shows the number behind it and a confidence level,
   and every value can be corrected by the user.
4. **Try-on.** YouCam **AI Clothes Virtual Try-On** (`cloth-v4`, falling back to `cloth`) puts the piece on
   your full-body photo, side by side with the original.
5. **Verdict.** Deterministic rules decide *Flatters you / Works with tweaks / Not your best*, separately for
   cut and color, and attach evidence codes. **Claude Opus 5.5** only rewrites that evidence into a short,
   warm opinion; a validator rejects defect-oriented wording and a template fallback always answers.
6. **Make it work.** If the color isn't ideal, YouCam **AI Makeup Virtual Try-On** applies a lipstick in your
   undertone on your own photo (before/after). Cut rescues (belt, tuck, layer, shoes…) and "the same piece
   in your color" come from the same evidence.
7. **Compare and save.** "Which one?" ranks the pieces tried in the session; the verdict can be downloaded or
   shared as an image card.

## YouCam APIs used

| API | Feature id | Used for |
| --- | --- | --- |
| AI Facial Color Tones Analyzer | `skin-tone-analysis` | Skin, hair, eye and lip colors → undertone, depth, contrast |
| AI Clothes Virtual Try-On | `cloth-v4` (fallback `cloth`) | The chosen garment, on the user |
| AI Makeup Virtual Try-On | `makeup-vto` (`lip_color`) | Lipstick rescue on the user's photo |
| AI Photo Background Removal | `sod` | Isolating the garment before measuring its color |

All calls follow the V2 pattern: register the file (`POST /s2s/v2.0/file/{feature}`), `PUT` the bytes to the
signed URL, create the task (`POST /s2s/v2.0/task/{feature}`) and poll its status
(`GET /s2s/v2.0/task/{feature}/{task_id}`). The API key lives only on the server.

## Trust principles (every screen follows them)

1. **Shows its work.** Each piece of advice comes with its evidence ("your skin hue is 63°, warm, so this
   camel echoes your coloring").
2. **Tries it, doesn't promise it.** Recommendations are shown on the user with the try-on, side by side.
3. **Goals, not defects.** "Balance the silhouette", "mark the waist", "lengthen the line"—never "hide" or
   fruit-shaped body types. Enforced by the rules vocabulary and by a validator on Claude's text.
4. **Admits what it doesn't know.** Borderline values, poor light, arms close to the body or loose clothes
   lower the confidence, widen the ranges and are explained; YouCam errors become "retake the photo like this".
5. **Rescues instead of forbidding.** A different lipstick, the color away from the face, a belt.
6. **Cares for the photos.** Images are processed in memory and forwarded to YouCam only; Clara has no
   database and stores nothing. YouCam keeps processed results for 24 hours.

## Architecture

```
Browser (Next.js client)                 Server (Next.js route handlers)          YouCam API
- photo capture, resize, face crop  ──▶  /api/youcam/{feature}  (upload+task) ──▶  skin-tone-analysis
- MediaPipe pose + segmentation          /api/youcam/{feature}/{taskId} (poll)     cloth-v4 / cloth
  (proportions, locally)                 /api/youcam/image (result proxy)          makeup-vto
- color k-means on the garment           /api/garment  (Claude vision)             sod
- wizard UI, share card             ◀──  /api/verdict  (rules → Claude text)
```

- `src/lib/youcam/` — server client (`client.ts`), routes helpers, error mapping, dev-only result cache.
- `src/lib/color/` — CIELAB math, color profile, garment color description, dominant colors.
- `src/lib/pose/` — MediaPipe wrapper (browser) and pure proportion measurement.
- `src/lib/verdict/` — color rules, cut rules, rescues, palettes, Claude drafting + validator.
- `src/lib/i18n/` — English (default) and Spanish dictionaries.
- `src/components/` — the wizard and its steps.

## Run it locally

Requirements: Node.js 20+.

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

| Variable | Required | Notes |
| --- | --- | --- |
| `YOUCAM_API_KEY` | yes | YouCam API console → API keys (V2, sent as `Bearer`) |
| `ANTHROPIC_API_KEY` | recommended | Garment reading and verdict text. Without it Clara uses manual chips and template text. |
| `YOUCAM_API_BASE` | no | Defaults to `https://yce-api-01.makeupar.com` |
| `YOUCAM_CACHE` | no | `1` caches YouCam results on disk (always on in `next dev`) to save API units |

`npm install` copies the MediaPipe WASM runtime into `public/mediapipe/`; the pose and face models are in
`public/models/`. Nothing is loaded from third-party CDNs at runtime.

### Tests

```bash
npm test          # vitest: color math, profile, proportions, rules, language validator, i18n coverage
npm run lint
npm run build
```

### Deploy (Vercel)

Import the repository in Vercel, set `YOUCAM_API_KEY` and `ANTHROPIC_API_KEY`, and deploy. No database or
storage is needed. Uploads are resized in the browser so requests stay under Vercel's body limit, and the
browser polls YouCam task status through short requests, so no function waits for a task to finish.

### Demo garments

Put free-to-use garment photos (no visible brands) in `public/demo/` and list them in
`public/demo/garments.json` as `[{ "src": "/demo/shirt.jpg", "label": "Linen shirt" }]`; they appear as
one-tap examples on the first screen.

## Limitations

- Proportions from a single 2D photo are estimates: Clara shows ranges and confidence and lets the user correct them.
- Seasonal color analysis is debatable; Clara bases its color advice on measured undertone and contrast and
  presents it as style advice.
- The try-on image can alter details of the face or body; the verdict relies on measurements, not on the generated image.
