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

1. **The piece.** Upload a screenshot or product photo, or paste the store link: Clara reads the page's product
   photos (schema.org JSON-LD, then `og:image`) and the person picks the clearest one. YouCam **background removal** isolates the garment
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
7. **The full look.** Add the missing half (a bottom for a top, a top for a bottom, a layer) and Clara tries
   the pieces on together by chaining try-ons, reusing the ones it already has. A deterministic outfit verdict
   explains how they work together (color between the pieces, volume, top length against the rise); with a
   single piece, Clara says which colors and cuts to look for.
8. **Hair and makeup.** YouCam **AI Face Analyzer** reads the face shape once; Clara suggests three haircuts
   from YouCam's **AI Hairstyle** catalog with the reason for each, and, if the person wants it, a makeup look
   (blush, eyes, liner, lips) from their undertone, depth and contrast that lets the outfit's color lead. Both
   are tried on a head-and-shoulders crop of the selfie, before/after. The makeup (not the haircut, which never
   blended in) can also be put on the full-body outfit photo: the head is cropped, enlarged, made up and pasted
   back, since the face there is too small for YouCam.
   The person chooses which haircut styles to see and whether to see makeup: Clara never guesses gender.
9. **Compare and save.** "Which one?" ranks the pieces tried in the session; the verdict can be downloaded or
   shared as an image card. With an account, looks (and, with consent, the profile) are saved, and a saved look
   can be reopened, changed (pieces, haircut, makeup) and saved again.

## YouCam APIs used

| API | Feature id | Used for |
| --- | --- | --- |
| AI Facial Color Tones Analyzer | `skin-tone-analysis` | Skin, hair, eye and lip colors → undertone, depth, contrast |
| AI Clothes Virtual Try-On | `cloth-v4` (fallback `cloth`) | The chosen garment, on the user |
| AI Makeup Virtual Try-On | `makeup-vto` (`lip_color`, `blush`, `eye_shadow`, `eye_liner`) | Lipstick rescue and the suggested makeup look |
| AI Photo Background Removal | `sod` | Isolating the garment before measuring its color |
| AI Hairstyle Virtual Try-On | `hair-transfer` (v2.1, preset templates) | The suggested haircuts, keeping the person's hair color |
| AI Face Analyzer | `face-attr-analysis` (`faceShape`, `faceAspectRatio`) | Face shape behind the haircut and blush advice |

All calls follow the V2 pattern: register the file (`POST /s2s/v2.0/file/{feature}`), `PUT` the bytes to the
signed URL, create the task (`POST /s2s/{version}/task/{feature}`, v2.1 for `hair-transfer`) and poll its
status (`GET /s2s/{version}/task/{feature}/{task_id}`). The API key lives only on the server.

## Trust principles (every screen follows them)

1. **Shows its work.** Each piece of advice comes with its evidence ("your skin hue is 63°, warm, so this
   camel echoes your coloring").
2. **Tries it, doesn't promise it.** Recommendations are shown on the user with the try-on, side by side.
3. **Goals, not defects.** "Balance the silhouette", "mark the waist", "lengthen the line"—never "hide" or
   fruit-shaped body types. Enforced by the rules vocabulary and by a validator on Claude's text.
4. **Admits what it doesn't know.** Borderline values, poor light, arms close to the body or loose clothes
   lower the confidence, widen the ranges and are explained; YouCam errors become "retake the photo like this".
5. **Rescues instead of forbidding.** A different lipstick, the color away from the face, a belt.
6. **Cares for the photos.** In production, unsaved images are processed in memory. YouCam receives the
   photos needed for each feature; Claude receives the garment image for attribute reading and measured
   profile data for the explanation. With an account, Clara keeps only what the person saves (looks, and the
   profile photos only after an explicit opt-in) in a private folder protected by row-level security, and
   "Delete my photos and looks" or "Delete my account" removes it. Provider retention is governed by each
   provider's policy. Local development caches YouCam results in `.cache/youcam` to save API units; use test images.

## Architecture

```
Browser (Next.js client)                 Server (Next.js route handlers)          YouCam API
- photo capture, resize, face crop  ──▶  /api/youcam/{feature}  (upload+task) ──▶  skin-tone-analysis
- MediaPipe pose + segmentation          /api/youcam/{feature}/{taskId} (poll)     cloth-v4 / cloth
  (proportions, locally)                 /api/youcam/image (result proxy)          makeup-vto, sod
- color k-means on the garment           /api/youcam/hair-templates               hair-transfer
- outfit, makeup, haircut rules          /api/garment  (Claude vision)             face-attr-analysis
                                         /api/garment/link (store page → product photos, SSRF-guarded)
- wizard UI, share card             ◀──  /api/verdict  (rules → Claude text)
        │                                /api/account  (DELETE, service role)
        └── supabase-js (RLS) ──▶  Supabase: Auth (email link), Postgres, Storage
```

- `src/lib/youcam/` — server client (`client.ts`), routes helpers, error mapping, dev-only result cache.
- `src/lib/color/` — CIELAB math, color profile, garment color description, dominant colors.
- `src/lib/pose/` — MediaPipe wrapper (browser) and pure proportion measurement.
- `src/lib/verdict/` — color rules, cut rules, outfit rules, rescues, palettes, Claude drafting + validator.
- `src/lib/beauty/` — makeup suggestion, haircut tagging and face-shape rules.
- `src/lib/look.ts` — pieces of a look by slot and the plan to try them on together.
- `src/lib/account/`, `src/lib/supabase/` — sign-in, saved looks and profile (browser, under RLS).
- `supabase/migrations/` — tables, row-level security and the private storage bucket.
- `src/lib/i18n/` — English (default) and Spanish dictionaries.
- `src/components/` — the wizard and its steps.

## Run it locally

Requirements: Node.js 22.12+ (the test runner needs it). `nvm use` selects the project's Node 22 release.

```bash
npm ci
cp .env.example .env.local   # then fill in the keys
npm run dev
```

| Variable | Required | Notes |
| --- | --- | --- |
| `YOUCAM_API_KEY` | yes | YouCam API console → API keys (V2, sent as `Bearer`) |
| `ANTHROPIC_API_KEY` | recommended | Garment reading and verdict text. Without it Clara uses manual chips and template text. |
| `YOUCAM_API_BASE` | no | Defaults to `https://yce-api-01.makeupar.com` |
| `YOUCAM_CACHE` | no | `1` caches YouCam results on disk outside production (always on in `next dev`) to save API units. Production always disables this cache. |
| `NEXT_PUBLIC_SUPABASE_URL` | for accounts | Supabase project URL. Without the Supabase variables Clara has no accounts and stores nothing. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | for accounts | Public key (`sb_publishable_…`; a legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works); RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | for accounts | Server only, used by `DELETE /api/account` to delete the auth user |

`npm install` copies the MediaPipe WASM runtime into `public/mediapipe/`; the pose and face models are in
`public/models/`. Nothing is loaded from third-party CDNs at runtime.

### Accounts (Supabase)

1. Create a Supabase project (the Vercel Marketplace integration also sets the three variables in Vercel).
2. Run the files in `supabase/migrations/` in order (SQL editor, or `supabase db push`).
3. *Authentication → URL Configuration*: set the site URL and add `<site>/auth/callback` as a redirect URL.
   Sign-in is an email link: opened in a new tab of the same browser, it finishes on `/auth/callback` and the
   session reaches the Clara tab, so nothing in progress is lost.
4. Optional, for production: Supabase's built-in email sends only a few messages per hour. Set up custom SMTP
   (for example Resend); that also unlocks the email templates, and adding `{{ .Token }}` to the Magic Link
   template lets people type a 6-digit code in Clara instead of opening the link.

### Tests

```bash
npm test          # vitest: color math, profile, proportions, rules, language validator, i18n coverage
npm run lint
npm run typecheck # generates Next.js route types, then checks TypeScript
npm run build
npm run validate  # all four checks, also run by GitHub Actions
```

The suite also covers request size/format limits, signed image URLs, rejected non-image responses,
task start/polling and the clothes-engine fallback, manual/template mode without Claude, and complete
private-file deletion across storage pages. API integration tests mock providers and do not spend units.
See [the audit report](docs/code-audit.md) for the verification scope and remaining limits.

### Deploy (Vercel)

Import the repository in Vercel, set `YOUCAM_API_KEY` and `ANTHROPIC_API_KEY`, and deploy. Accounts are
optional: add the Supabase variables to turn them on. Uploads are resized in the browser so requests stay under Vercel's body limit, and the
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
- Paid anonymous routes check browser origin and limit each IP to 30 requests per minute per route group,
  per server instance. This is a demo safeguard; a larger public launch needs a shared quota/rate limiter.
- The image proxy only fetches signed task-result URLs, refuses redirects and non-raster content, and bounds
  response size and time. Links remain bearer capabilities until the provider expires the original image.
- An outfit is built by chaining one-category try-ons, so each extra piece is another generation step.
- On the full-body photo, the makeup goes through a crop that is enlarged and pasted back, so the face looks
  softer than in the selfie portrait.
- Store links work when the page publishes its product photos (JSON-LD or `og:image`); pages that only render
  them with JavaScript or block automated requests need a screenshot instead.
