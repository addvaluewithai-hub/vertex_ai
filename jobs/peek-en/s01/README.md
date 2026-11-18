# Short 01 · Gravity: jobs

Script: `channel-earth-report/content/peek-en/s01-gravity.md`. All produced on 2026-11-18 from `main`
(Media Factory and Voice Factory); outputs are on Cloudinary under `vertex-media-factory/peek-en-*` and
`gemini-tts/peek-en-s01-gravity-voice.*`.

- **Approved references:** Peek = `peek-en-02-expressions` (style and face) + `peek-en-01-turnaround` (angles);
  Agent Crowe = `peek-en-agent-crowe-v2` (the first, realistic Crowe was rejected: it did not match Peek's world).
- **Keyframes (image jobs here):** shots 1, 2, 4, 5, 6, 7, 8; shots 3 and 9 use Crowe v2 and an earlier shot as
  references so the place matches.
- **Video (Gemini Omni Flash only, never Veo; owner 2026-11-18):** 5 s at 720p, image-to-video from the keyframes:
  `vid2b-hop` (Peek hops off a low wall into the dumpster) and `vid3-crowe`. Everything else is a still with a camera
  move in the edit.
- **Safety filter, learned:** a character stepping off a rooftop ledge was refused as dangerous content, and the
  rooftop keyframe itself was blocked as video input whatever the prompt. Stage falls as harmless slapstick (a low
  wall, soft landing, "playful family cartoon") and keep heights out of video shots.
- **Voice:** `voice-gravity.json` (Puck, deadpan English), one take, cut on the word times.

## Edit

`../edit_short.py timeline.json out.mp4` (ffmpeg only): stills get slow camera moves, videos keep their own sound,
the voice is placed in parts, captions are burned in from the word times (Inter Black), loudness -14 LUFS, end card.
Shot 1's sound is synthesized: accelerating 1760 Hz beeps over brown-noise rain (`sfx-beeps.wav`, 4.5 s).
Result: `peek-en-s01-gravity.mp4`, 52 s, 1080 x 1920.
