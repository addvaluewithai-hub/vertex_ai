# Video editing: Omni Flash on Vertex AI

This feature adds kind=video_edit to the existing image/video factory. It uses Google Cloud Agent Platform, not the separate AI Studio Developer API.

## 1. Source video

Upload a video to the SAME Cloudinary account used for media publishing. Copy the public MP4 URL, for example:
https://res.cloudinary.com/YOUR_CLOUD_NAME/video/upload/v123456/your_source.mp4

Only URLs with host res.cloudinary.com, the /video/upload/ delivery path and .mp4 extension are accepted. The runner downloads up to 20 MiB, trims to the requested segment, rescales to fit within 640 pixels and transcodes H.264/AAC. The source remains external and is never committed to git.

Alternatively use source_video_uri=gs://bucket/path/already-trimmed.mp4. The factory needs object-read permission on the GCS bucket, and the video MUST already be <=10s; trim and preserve_audio are unavailable for GCS. No additional GCS bucket is needed for Cloudinary URLs.

## 2. Request schema

For the vertical speaker clip, this is the recommended first request:

~~~json
{
  "schemaVersion": 1,
  "mode": "dry-run",
  "kind": "video_edit",
  "source_video_url": "https://res.cloudinary.com/YOUR_CLOUD_NAME/video/upload/v123456/your_source.mp4",
  "trim_start_seconds": 0,
  "trim_duration_seconds": 8,
  "preserve_audio": true,
  "prompt": "Edit the supplied original clip rather than inventing a new speaker. Keep the same man's recognizable face, beard, speaking expression, lip movements, and camera timing. Replace the plain wall behind him with a warm modern cafe interior. Replace his crew-neck T-shirt with a stylish collared shirt and lightweight dark blazer. Reframe wider to show his chest and upper torso, while keeping the shot natural and vertical. Keep the rest of the material as consistent as possible. Do not add text, change branding, or alter the spoken message.",
  "aspect_ratio": "9:16",
  "resolution": "360p",
  "model": "gemini-omni-1.1-flash-preview"
}
~~~

Set mode=produce to allow a charged generation request, with owner approval. Submit through Actions -> Vertex AI Media Factory -> Run workflow, a media.generate repository_dispatch, or a new owner-authored JSON Issue (see AGENT.md). The Issue reply and Actions summary contain status, model and published Cloudinary URL.

## 3. Cost and output limitations

- MAX_EDIT_SECONDS defaults to 8 seconds; explicit request may use 3–10 seconds, but >8 requires changing Actions Variable MAX_EDIT_SECONDS.
- Video resolution limited by MAX_VIDEO_RESOLUTION (default 360p).
- A video edit is NOT guaranteed to preserve identity or lip sync exactly. The original audio track is copied to the final MP4 when preserve_audio=true, but the model may change mouth movements or the visual duration.
- Editing the first 8 seconds of the Rooftop 7000 master includes a graphic and picture-in-picture after the initial talking-head frames; these may be changed by generative editing.
- Only one billable edit per produce run. Do not blindly rerun a paid Issue.
- The existing Cloudinary output secret is required for produce mode. GitHub artifacts are best-effort due to account storage quota; Cloudinary URL and Issue receipts are the durable outputs.

## 4. Troubleshooting

400 from model: request schema / input video or unsupported setting (review error in Issue receipt). 403: service account permission or preview entitlement. 429: quota. 422 from Cloudinary: public source not reachable. Input clip must have real decodable frames; the runner rejects empty/oversized video before paid model call.

Official edit documentation: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/edit-videos
