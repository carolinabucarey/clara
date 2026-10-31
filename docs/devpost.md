# Clara: Devpost submission text

> Copy each section into the matching Devpost field. Written in English, as Devpost requires.

## Tagline

The second opinion you need before you buy: an honest AI image advisor that tries the piece on you and tells you why.

## Inspiration

Buying clothes online means deciding alone. A friend is kind but tends to say everything looks great. A personal stylist is an expert, but expensive, scarce and never there when you shop. Color-analysis apps hand you an abstract palette and leave you alone with the catalog. Virtual try-ons show the piece on you, but they never give an opinion, and the generated image tends to flatter anything.

We wanted the honest, expert friend who shows up at that exact moment of doubt, before checkout, for the piece you already fell for, from any store.

## What it does

Clara starts from the garment *you* chose: a screenshot from any online store or an Instagram post.

1. **The piece.** Upload a screenshot or just paste the store link: Clara finds the product photos on the page and you pick one. YouCam removes the background so Clara can measure the garment's real color. Clara reads its type, neckline, length and fit, and you confirm or correct each one with a tap.
2. **You.** You add a selfie, a full-body photo and your height. YouCam's Facial Color Tones Analyzer measures your skin, hair, eye and lip colors. Clara turns them into your undertone, depth and contrast. Your proportions (shoulders vs hips, waist definition, torso vs legs) are measured on your device.
3. **Your profile, with its evidence.** Every reading shows the number behind it and a confidence level. If something doesn't look like you, you correct it and the advice changes.
4. **It tries it on you.** YouCam's Clothes Virtual Try-On puts the piece on your own photo, side by side with the original.
5. **The verdict, cut and color separately.** For each one, Clara gives one of three verdicts: *Flatters you*, *Works with tweaks* or *Not your best*. Each comes with the reasons, for example: "Your skin reads warm (hue 63°) and this camel is a warm color too, so it echoes your natural coloring."
6. **Make it work.** If the color doesn't flatter you, YouCam's Makeup Virtual Try-On applies a lipstick in your undertone on your photo, with a before and after. Clara can also recolor the same piece into your palette and try it on again. Cut rescues (belt, tuck, layer, shoes) come from the same evidence.
7. **The full look.** Tried a top? Add the bottom (or a jacket) and Clara tries them on you together, then tells you how they work together: whether the colors read as one long line or cut you in two, whether the volume is balanced, where the top meets the rise. With only one piece, she tells you which colors and cuts to look for.
8. **Hair and makeup.** YouCam reads your face shape, and Clara suggests three haircuts from YouCam's hairstyle catalog, each with its reason ("a fringe visually shortens your oblong face"). If you want makeup, she suggests blush, eyes, liner and lips in your undertone that let your outfit's color lead, and tries it all on your selfie, before and after, and then on your full-body photo with the outfit, so you see the whole look in one picture. You choose which haircut styles to see and whether to see makeup; Clara never guesses your gender.
9. **Which one, and keep it.** Clara compares the pieces you tried and picks the best for you. Sign in with an emailed link to save your looks; with your OK, your profile is saved too, so next time you skip the photos. Saved looks can be reopened and edited.

**For the shopper:** fewer regrets, and a reason behind every recommendation.

**For the store:** fewer impulse purchases that end in returns, and fewer lost sales, because the rescue shows how to wear the piece instead of dropping it. It also opens a natural cross-sell of makeup and accessories.

## How we built it

- **Next.js** web app on **Vercel**. The server routes proxy YouCam so the API key never reaches the browser.
- **YouCam AI APIs**, six of them chained, all on the V2 flow: file, signed upload, task, then polling the task status from the browser.

  | API | What Clara uses it for |
  | --- | --- |
  | AI Facial Color Tones Analyzer (`skin-tone-analysis`) | Skin, hair, eye and lip colors |
  | AI Clothes Virtual Try-On (`cloth-v4`, with `cloth` as fallback) | The chosen piece, and its recolored better version, on the user |
  | AI Makeup Virtual Try-On (`makeup-vto`: lips, blush, eye shadow, liner) | Lipstick rescue and the suggested makeup look |
  | AI Photo Background Removal (`sod`) | Isolating the garment before measuring and recoloring it |
  | AI Hairstyle Virtual Try-On (`hair-transfer` v2.1) | The suggested haircuts, keeping the user's hair color |
  | AI Face Analyzer (`face-attr-analysis`) | Face shape behind the haircut and blush placement |

- **Color science, in our own code.** CIELAB conversion. Undertone from the skin hue angle, depth from the Individual Typology Angle (ITA°), and contrast from the ΔL* between skin and hair or eyes. The garment's dominant colors come from k-means clustering, and the recolor transfers the Lab offset so folds and shadows survive.
- **Proportions measured in the browser.** MediaPipe Pose Landmarker plus its segmentation mask: we measure shoulder, waist and hip widths on the silhouette, not on the joints, so the body photo never has to leave the device for this step.
- **A deterministic verdict engine.** Color, cut and outfit rule tables produce the verdicts and attach evidence codes, ranges and confidence. Makeup and haircut suggestions follow the same pattern: every pick carries the measured reason behind it.
- **Outfits by chaining try-ons.** YouCam changes one garment category per task, so Clara puts the pieces on in order (base first, layer last) and reuses any try-on that already shows them.
- **Accounts on Supabase.** Email-link sign-in that never loses the look in progress, Postgres and Storage behind row-level security, and one-tap deletion of everything.
- **Claude.** Claude Opus 5.5 only *writes* the verdict from that evidence. A validator rejects defect-oriented wording ("hide", "flaw", fruit-shaped body types), and template text takes over if anything fails. Claude vision pre-fills the garment's construction, because YouCam has no garment-analysis endpoint.
- **English and Spanish** interface.

## Challenges we ran into

- **The skin-tone API returns colors, not an undertone.** We built and tuned our own undertone, depth and contrast classification on CIELAB, with honest confidence near the boundaries.
- **Photos of 2D bodies are imprecise.** Joints are not outlines, and arms or loose clothes widen the reading. We measure on the segmentation mask, show ranges, lower the confidence when the photo isn't ideal, and let the user correct every value.
- **Try-on images can drift from the real person.** Clara compares the face before and after the try-on, on the device, and warns when the image changed more than the garment.
- **Language that never hurts.** Talking about bodies is delicate. Every rule is phrased as a goal (balance the silhouette, mark the waist, lengthen the line), and a validator checks the model's text.

## Accomplishments that we're proud of

- **Trust by design.** Six principles hold on every screen: show the work, try it instead of promising it, talk about goals instead of defects, admit what isn't known, rescue instead of forbidding, and care for the photo.
- Six YouCam APIs chained in one flow that a new user understands without explanation: from one piece to a complete look, hair and makeup included.
- The model never decides the verdict, and never invents a trait. It only explains measured evidence.

## What we learned

- The value is not the try-on image itself but the honest judgment and evidence around it.
- Showing the confidence level and letting people correct Clara makes them trust it more, not less.

## What's next for Clara

- A store widget, "Ask Clara", next to the product photo, so the second opinion lives inside the purchase.
- Occasion-aware advice (an interview, a wedding).
- Size and fit signals from the store's measurement charts.

## Built with

`next.js` · `react` · `typescript` · `tailwind-css` · `vercel` · `youcam-api` · `mediapipe` · `claude` · `anthropic-api` · `supabase` · `zod` · `vitest`
