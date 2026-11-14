# Voice factory on Vertex AI (no API key)

`tts/` is the voice factory of `addvaluewithai-hub/gemini-tts`, moved here so that speech is made inside the owner's
Google Cloud project, paid from its credits, signed in through Workload Identity Federation (docs/SETUP.md) and never
with an API key. `gemini-tts` keeps its own API-key factory untouched.

- **Speech:** Gemini TTS on Vertex AI, `gemini-3.8-flash-tts` first (`routing: quality`), in `global`, through
  `publishers/google/models/<model>:generateContent`.
- **Word times and the check:** Google Speech-to-Text v2, model `chirp_3`, region `eu`. Long takes are cut at quiet
  moments into pieces of at most 55 s (synchronous recognition takes about a minute).
- **Listen-back:** the words heard are compared with the script (`tts/quality.mjs`). Below 0.8, the take is made once
  more with a firmer instruction ("read every word…", temperature 0.6) and the better take is kept; still below, the
  result says `flagged: true` with the words that were not heard, so a person listens first.
- **Delivery:** Cloudinary, under the names the old factory used: `gemini-tts/<job id>.wav`, `.transcript.json`,
  `.transcript.vtt`. The video pipeline in `gemini-tts` (`video/produce.sh`) reads them unchanged.

## Request

The same JSON as gemini-tts (its docs/API.md): `turns[]` with `text` and `style`, `voice`, `routing`, `format`,
`temperature`, `transcript.language_codes`, `metadata`. An episode's `dispatch.json` → `client_payload.request` works
as it is.

## Running it

Actions → **Vertex AI Voice Factory** → Run workflow, with `job_id` and `request_json`, or, for a long request,
`request_path` (a file under `requests/`) and `request_ref` (the branch that holds it); or a `repository_dispatch` of
type `tts.generate` with `client_payload: { job_id, request }`. Needs the repository Variables `GCP_PROJECT_ID`,
`GCP_SERVICE_ACCOUNT`, `GCP_WIF_PROVIDER` (already set for the media factory) and the Secret `CLOUDINARY_URL`.
The service account needs `roles/aiplatform.user` and `roles/speech.client`, and the project the Speech-to-Text API:

```bash
PROJECT_ID="$(gcloud config get-value project)"
gcloud services enable speech.googleapis.com --project="$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:vertex-media-factory@$PROJECT_ID.iam.gserviceaccount.com" --role="roles/speech.client" --condition=None
```

Locally, `node tts/cli.mjs --validate-only --file request.json` checks a request without calling anything.

## Getting the best out of the voice

- **The turn's `style`** carries the sustained delivery (who is speaking, pace, mood). Keep it short and the same for
  a series; put only the line-specific direction at its end.
- **Inline tags** in angle brackets, written in English even inside Arabic: `<short pause>`, `<long pause>`, `<sigh>`,
  `<chuckle>`, `<laugh>`, `<whispers>`, `<gasp>`, `<breath>`, `<exhales>`. Use them for a moment, not for the tone.
- **Emphasis:** a word in capitals is stressed (`VERY`).
- **Pronunciation:** there is no pronunciation dictionary for Gemini 3.8; spell a hard word the way it should sound
  (Arabic letters, or a name in Latin letters so it is said the English way). Keep a list of fixes per series.
- **Consistency:** the same voice name, the same style sentence; one turn per scene; a stored designed voice
  (`voice_…`) is possible later (preview).
