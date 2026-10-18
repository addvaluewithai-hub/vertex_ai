# Vertex AI Media Factory

A private, asynchronous image + video generation factory built for autonomous agents, following [Gemini TTS Factory](https://github.com/addvaluewithai-hub/gemini-tts).

- **Image:** Gemini 3.1 Flash-Lite Image (default) or Gemini 3.1 Flash Image, on Google Cloud Agent Platform.
- **Video:** Gemini Omni 1.1 Flash Preview via the Google Cloud Interactions API (text-to-video; optional GCS reference image).
- **Triggers:** `repository_dispatch` (event `media.generate`), manual `workflow_dispatch`, or owner-created JSON GitHub Issue.
- **Auth:** GitHub OIDC → Google Cloud Workload Identity Federation → service account. No Google API keys or service account key JSON.
- **Outputs:** `result.json` + PNG/JPG or MP4 in a GitHub Actions artifact. Optional Cloudinary public URL when `CLOUDINARY_URL` secret exists.
- **Cost guard:** Explicit `mode: "produce"` to make a billable request. `mode: "dry-run"` validates without cloud credentials or spend. One output per job; videos default to 3s/360p.

Read [docs/AGENT.md](docs/AGENT.md) if you are an agent, and [docs/SETUP.md](docs/SETUP.md) to connect your $300 Google Cloud trial project.

## Quick request

```json
{
  "schemaVersion": 1,
  "mode": "dry-run",
  "kind": "video",
  "prompt": "A cinematic crane shot of a beautiful city at sunrise, with natural motion and sound.",
  "duration_seconds": 3,
  "resolution": "360p",
  "aspect_ratio": "16:9"
}
```

Set `mode` to `produce` only after confirming billing/model quota and authorizing the cost.

## Required GitHub Actions Variables

| Variable | Example |
| --- | --- |
| `GCP_PROJECT_ID` | `my-google-cloud-project` |
| `GCP_WIF_PROVIDER` | `projects/123456789/locations/global/workloadIdentityPools/github-media/providers/vertex-ai` |
| `GCP_SERVICE_ACCOUNT` | `vertex-media-factory@my-google-cloud-project.iam.gserviceaccount.com` |

Optional **Actions Secret**: `CLOUDINARY_URL`, containing `cloudinary://KEY:SECRET@CLOUD_NAME` (same convention as the TTS factory). Credentials belong in **Secrets**, never Variables or committed files.

The presence of $300 credits alone does **not** guarantee preview model access or eligibility of individual SKUs. Test first and inspect Google Cloud billing; a budget alert is not a hard spending limit.

The factory is code-complete but **not yet cloud-tested** until those three variables and Google Cloud WIF permissions are configured. The CI suite validates request parsing without making paid calls.
