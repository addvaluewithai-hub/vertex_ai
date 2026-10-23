# Vertex AI Media Factory — autonomous agent contract

Repository: addvaluewithai-hub/vertex_ai (private). This is an **asynchronous** image/video generation factory modeled after addvaluewithai-hub/gemini-tts.

## Request schema

Each job is ONE image or ONE video. Required properties: schemaVersion = 1, kind = image or video, prompt (3–4000 chars). mode defaults to dry-run; to make a paid request the caller MUST explicitly set mode to produce and have user authorization. All unrecognized fields are rejected.

### Image request (dry-run)

~~~json
{
  "schemaVersion": 1,
  "mode": "dry-run",
  "kind": "image",
  "prompt": "A futuristic library at sunrise, beautiful photorealism",
  "model": "gemini-3.1-flash-lite-image",
  "aspect_ratio": "16:9",
  "image_size": "1K"
}
~~~

Valid still models: gemini-3.1-flash-lite-image (default) and gemini-3.1-flash-image. The factory limits output to one 1K still per job. Aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9.

### Video request (dry-run)

~~~json
{
  "schemaVersion": 1,
  "mode": "dry-run",
  "kind": "video",
  "prompt": "A cinematic tracking shot of a floating red paper airplane with natural ambient audio",
  "model": "gemini-omni-1.1-flash-preview",
  "duration_seconds": 3,
  "resolution": "360p",
  "aspect_ratio": "16:9"
}
~~~

Video uses the Google Cloud Agent Platform Interactions API, not the Gemini Developer API. Video length must be an integer between 3 and 10 seconds and <= MAX_VIDEO_SECONDS (Actions Variable default 5). Video output must be <= MAX_VIDEO_RESOLUTION (CLI default 360p; workflow pinned to the owner-approved 720p cap on 2026-10-23). Aspect ratio: 16:9 or 9:16. Optional reference_image_uri accepts a readable gs://bucket/path/to/startframe.png or .jpg, or a public https://res.cloudinary.com/CLOUD/image/upload/...png, .jpg or .webp URL. Cloudinary references are downloaded with a 10 MiB limit and no redirects, checked for their actual image signature, and sent as inline original bytes. No GCS bucket or GCS permissions are needed for Cloudinary input. Higher resolutions still require separate approval and a policy change.

## Trigger through GitHub repository_dispatch

For an agent with an appropriate GitHub token to this private repository, send:

~~~bash
curl -L -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/addvaluewithai-hub/vertex_ai/dispatches" \
  -d '{"event_type":"media.generate","client_payload":{"job_id":"demo-001","request":{"schemaVersion":1,"mode":"dry-run","kind":"image","prompt":"A futuristic library at sunrise"}}}'
~~~

An accepted dispatch is NOT completed media. Poll the Actions run (or inspect its logs and artifact). Do not blindly retry a paid request; the job ID is not a durable idempotency key.

## Owner-only GitHub Issue gateway

If the agent has GitHub Issue-create access but cannot call repository_dispatch, it may open a NEW GitHub Issue authored as addvaluewithai-hub. The Issue body must be ONLY the fenced JSON below, with exactly ~~~json delimiters. Owner-created Issue on open triggers the factory; other Issue authors/actors are explicitly refused.

~~~~text
~~~json
{"schemaVersion":1,"mode":"dry-run","kind":"image","prompt":"A futuristic library at sunrise"}
~~~
~~~~

For an authorized paid job, create a separate Issue using mode produce. Editing an existing Issue does not trigger another attempt.

## Manual workflow trigger

Actions -> Vertex AI Media Factory -> Run workflow. Set request_json to a complete example JSON and optional job_id.

## Result and delivery

Read completed outputs via the Actions run's job summary or, for Issue-gateway submissions, the reply comment on the Issue. A production job **requires** CLOUDINARY_URL Secret and publishes the file at result.output.url. The GitHub artifact upload is best effort: this account is currently over its GitHub Actions artifact-storage quota. If you free quota, media-RUN_ID artifacts will also contain result.json and out/JOB_ID.png, .jpg, .webp, or .mp4.

- status validated, billable false: dry-run, NO media and NO Google Cloud billing.
- status completed, billable true: media generated, output filename/mime/bytes, optional Cloudinary URL and github_run_url.
- status failed: inspect error, but some failed attempts may still be billable.

GitHub artifact retention is 7 days where artifact uploads are possible. Missing Cloudinary credentials block production before any Google Cloud call.

## Security & billing

Never include Google credentials, Cloudinary secrets or GitHub tokens in an Issue, payload, or log. Use GitHub Actions Variables for non-secret GCP WIF identifiers and Actions Secret for CLOUDINARY_URL. Do not dispatch bulk paid work without owner approval. Preview model quota and $300 trial credit eligibility must be checked; do not assume all preview SKUs are covered. Read docs/SETUP.md.

## Existing-video editing

Set kind to video_edit and pass exactly one of source_video_url (public Cloudinary MP4 URL) or source_video_uri (already-trimmed GCS MP4). Use trim_start_seconds=0, trim_duration_seconds=8, preserve_audio=true, aspect_ratio=9:16, and resolution=360p for the speaker-in-a-cafe sample. The factory will trim public Cloudinary sources before calling Omni video task=edit. MAX_EDIT_SECONDS defaults to 8 and is separate from the 5-second new-video generation cap. Dry-run validates only. See [VIDEO_EDIT.md](VIDEO_EDIT.md) for the full payload and constraints.

