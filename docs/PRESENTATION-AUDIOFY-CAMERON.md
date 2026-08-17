# Audiofy Content AI — presentation for Cameron

> English presentation adapted for an investor/operator audience. This is not a literal translation of the Flávia version. Numbers and product status are shared facts.

## 1. The proposition

Audiofy turns written content into traceable podcast episodes or audiobooks, with natural voices and live cost visibility.

## 2. Why it matters

Written knowledge is abundant but hard to consume consistently. Audiofy turns that content into a repeatable production pipeline instead of a one-off AI demo:

- preserve the source or show exactly what was adapted;
- audit the script before synthesis;
- resume interrupted jobs without paying for completed segments again;
- expose cost while the episode is being generated.

## 3. Current product state

- Working Python core with an Electron desktop application.
- React renderer is now the default desktop surface.
- Podcast adaptation and faithful long-form reading modes.
- Configurable languages, presenters and voices.
- 12 real episodes already generated and stored with auditable artifacts.
- TTS parallelization benchmarked at approximately 8x across 12 chunks.

This is a validated MVP, not yet a finished public SaaS product. Real provider credits, human review and operational choices still matter.

## 4. Live demonstration

Open `python3 start_app.py` → **Open desktop app**.

Show one of the 12 generated episodes:

1. source material;
2. final audio in the player;
3. script and audit artifacts;
4. live/recorded cost data;
5. resumability and the generated episode manifest.

The demo should prove the production loop and its observability, not just play a polished audio file.

## 5. Measured economics

Measured study using 12 generated episodes:

| Metric | Result |
| --- | ---: |
| Total audio | 5h 40m 55s |
| Script words | 50,024 |
| Total cost | US$ 6.85 |
| Average per episode | US$ 0.57 |
| Average per minute | US$ 0.02 |

The low-cost `kokoro-82m` option was rejected as the default because voice quality and native Brazilian Portuguese were insufficient. Gemini TTS, approximately US$ 0.036/minute in the measured scenario, is currently the viable quality/language choice. Cost is an explicit product trade-off.

## 6. Strategic fit with Prisma

Audiofy becomes Prisma's **Audio Review** module. Prisma organizes and guides study; Audiofy turns the material into an auditable audio experience.

Audio is also the cost-dominant part of the per-account economics. The current proposal to model is a ceiling of **3 studies × 20 minutes ≈ US$ 2.16/account/month**, subject to validating the final provider and usage assumptions.

## 7. Risks and decisions still open

- provider pricing and model availability can change;
- Portuguese quality is currently tied to Gemini TTS;
- human audio review is still required for pilots;
- automated post-audio STT verification is not complete;
- the public product boundary and usage ceiling still need a product decision.

These are visible, bounded risks. The system already records the artifacts and cost needed to measure them.

## 8. Decision requested

Approve a Prisma pilot with Audio Review, define the first content class, and set a monthly usage/cost ceiling before expanding the integration.

## Closing

Audiofy has moved beyond a voice-generation experiment: it is a measurable production component. The investment question is now where auditable audio creates the strongest retention and learning value inside Prisma.
