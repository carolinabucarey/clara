# Testing Clara

- Live app: https://clara-sigma-swart.vercel.app/
- Demo video (3 minutes, English): https://www.youtube.com/watch?v=5JENJYa0638
- Source: https://github.com/carolinabucarey/clara

## Try the live app

The core experience is available without signing in or supplying an API key.
Use photos you are authorized to process through YouCam. Claude receives the garment image
and measured profile data; the in-app privacy notice explains this.

1. Upload a clear garment photo or screenshot. Alternatively, paste a store's product link;
   if the store blocks automated requests, upload a screenshot instead.
2. Confirm the garment's category, construction and dominant color.
3. Add a front-facing selfie and a full-body photo with your arms slightly away from your body.
   Enter your height. Check the measurements and correct any reading that does not fit.
4. Continue to the verdict. Compare the original and virtual try-on, then inspect the separate
   cut and color verdicts and their evidence.
5. Open the look. Add a complementary piece, try the suggested lipstick or garment recolor,
   and optionally choose hair color and makeup. Compare two alternatives or download a share card.
6. Optional: sign in with an email link to save and reopen looks. Open the sign-in link on the
   same device and browser that requested it. An account is unnecessary for steps 1–5.

Generations take time and consume the project's YouCam units. If a task fails, the app shows
an error and retry option. Generated images are previews; the verdict uses the measured profile.

## Run from source

Requirements: Node.js 22.12+ and npm. The repository includes the pose and face models;
`npm ci` copies the installed MediaPipe WASM runtime into `public/mediapipe/`.

```bash
git clone https://github.com/carolinabucarey/clara.git
cd clara
npm ci
cp .env.example .env.local
```

Set `YOUCAM_API_KEY` to your own YouCam V2 API key in `.env.local`. The real try-ons require it;
credentials are deliberately excluded from source control. Set `ANTHROPIC_API_KEY` for automatic
garment reading and drafted text. Without Claude, manual garment fields and template explanations work.
Supabase is optional; follow the account setup and SQL migrations in the README to enable saving.

```bash
npm run dev
# Open http://localhost:3000
```

For an optimized build, run `npm run build`, then `npm start`. Installation needs access to npm;
the build downloads Google Fonts. WebGL must be available for the browser's MediaPipe measurements.
Local development caches YouCam results on disk; use test photos.

## Integration evidence

These are real provider calls, wired from the UI through the server. The API key stays server-side.

| Feature | YouCam API | Where to inspect |
| --- | --- | --- |
| Garment isolation | `sod` | `analyzeGarment` in `src/lib/flow.ts` |
| Color measurements | `skin-tone-analysis` | `analyzeSelfie` in `src/lib/flow.ts` |
| Clothes and outfit try-on | `cloth-v4`, fallback `cloth` | `tryOn`, `tryOnOver`, `tryOnOutfit` in `src/lib/flow.ts` |
| Makeup | `makeup-vto` | `applyMakeupLook`, `applyLipstick` in `src/lib/flow.ts` |
| Hair color | `hair-color` | `applyHairColor` in `src/lib/flow.ts` |
| Face shape | `face-attr-analysis` | `analyzeFaceShape` in `src/lib/flow.ts` |

`src/lib/youcam/client.ts` registers and uploads files, creates tasks and reads their status.
`src/app/api/youcam/` exposes the server routes; `src/lib/youcam/browser.ts` starts and polls tasks.

```bash
npm run validate
npm audit --omit=dev
```

The automated integration tests mock providers and use no real photos or paid units. They verify
request validation, task start/status, the clothes fallback and template mode; they do not prove
that the deployed provider credentials have units available at the time of judging.
