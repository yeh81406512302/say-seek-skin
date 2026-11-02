# Say & Seek Skin

**A voice-first skin check for people who can't rely on the mirror.**
Speak to start, get guided into frame by voice, hear your top three skin concerns from the **YouCam AI Skin Analysis API**, and add a suggested product to your cart only after you say "confirm".

Built for the *YouCam API Skin AI & eCommerce VTO Hackathon* (Skin AI track).

## Why

Most skin analysis tools assume you can see: you line your face up with on-screen guides, read heat maps and small scores, then scroll a product list. People with low vision, and many adults with presbyopia, can get stuck at each of those steps. Say & Seek Skin keeps YouCam's analysis and changes how it is delivered, from "see" to "hear and say".

## What it does

1. **Start by voice or one big button.**
2. **Voice-guided framing.** The YouCam **JS Camera Kit** (`skincare` mode) reports face presence, distance, angle and lighting in real time (`faceQualityChanged`). We turn each report into one short spoken hint ("Move the phone a little closer", "It's a bit dark, try facing a window"). The Kit captures automatically when quality checks pass.
3. **YouCam AI Skin Analysis (SD, 8 concerns).** acne, redness, oiliness, moisture, pore, texture, dark circles, wrinkles.
4. **Hear only what matters.** YouCam scores are "higher is healthier", so we rank by the lowest `raw_score` and speak only the top three, in plain language.
5. **One next step.** One routine tip and one matching product from a demo shelf. Exfoliating products are never suggested when redness is in the top three.
6. **Confirm by voice.** Nothing is added to the cart unless the user says "confirm" or "yes".

Every voice command also has a large button. The screen uses large type and high contrast, and status updates go to an `aria-live` region for screen readers.

**Guardrails:** medical questions (rash, eczema, mole, and similar) are declined with a referral to a dermatologist. Photos are sent to YouCam for analysis only and are not stored by our server.

## YouCam APIs used

| YouCam component | How we use it |
|---|---|
| **AI Skin Analysis API** (`/s2s/v2.0/file`, `/s2s/v2.0/task/skin-analysis`) | Upload selfie → create SD task with 8 `dst_actions` → poll → read `raw_score`, `ui_score`, `mask_urls` |
| **JS Camera Kit** (`v2.5-camera-kit/sdk.js`, `skincare` mode) | Real-time face quality events → spoken framing hints → auto-capture |

## Run it

Requires Node.js 22 or later. There are no npm dependencies.

```bash
cp .env.example .env    # add your YOUCAM_API_KEY
npm start               # http://localhost:3000
```

- **Without `YOUCAM_API_KEY`** the server runs in **demo mode**. It returns the sample SD scores from the YouCam documentation, and the page shows a red **DEMO DATA** badge.
- Camera and microphone need `localhost` or HTTPS. Use Chrome on Android or desktop, or Safari on iOS.
- If the camera is unavailable, the app offers "Choose a photo" instead.

```bash
npm test                # unit tests for score translation, product matching, and the voice agent
```

## Testing instructions (for judges)

1. Open the demo URL on a phone and allow the microphone and camera.
2. Tap **Start skin check**, then follow the spoken hints until the photo is taken.
3. After the results are read aloud, say "recommend", then "confirm". Or try "what does redness mean", "repeat", "my cart", or "check my skin".
4. You can also use the on-screen buttons instead of your voice.

## Project structure

```
server.js          Node http server: static files + /api/analyze + /api/turn
lib/youcam.js      YouCam File API upload, skin-analysis task, polling, error hints
lib/translate.js   score → top 3 → spoken summary; product matching rules
lib/agent.js       intent handling (repeat / explain / recommend / confirm / cart / retake / medical guard)
data/products.json demo shelf (fictional products, not a brand partnership)
public/            mobile web app (speech, Camera Kit, UI)
test/              node:test unit tests
```

## Notes and limits

- Results are cosmetic skin insights, **not a medical diagnosis**.
- Product names and prices are fictional demo data.
- The wording thresholds (for example, "stands out the most" when raw score < 50) are design assumptions that we plan to tune through user testing.
- Voice input uses the browser's built-in speech recognition (English). Mandarin and Taiwanese are planned.

## License

MIT. See [LICENSE](LICENSE).
