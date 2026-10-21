# Google Cloud $300 Trial — GitHub WIF setup

The project already has active promotional credits, but preview-model quota and eligible billing SKUs must be checked. This factory uses Google Cloud OAuth through Workload Identity Federation (WIF), **not Google API keys**. The organization policy that blocks API keys does not prevent WIF by itself.

## Step 1. Google Cloud Shell

Select the project that has your $300 trial credit. Your Google principal needs permission to enable APIs and manage IAM.

~~~bash
PROJECT_ID="$(gcloud config get-value project)"
echo "Selected project: $PROJECT_ID"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud services enable aiplatform.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID"
gcloud iam service-accounts create vertex-media-factory --project="$PROJECT_ID" --display-name="GitHub Vertex Media Factory"
SA="vertex-media-factory@$PROJECT_ID.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="roles/aiplatform.user"
~~~

If the service account already exists, skip its creation. Do not give Owner or Editor access.

## Step 2. GitHub Actions → Google Cloud Workload Identity Federation

This creates a provider trusting ONLY this repository on main. The repo name and branch restriction are essential.

~~~bash
POOL="github-media"
PROVIDER="vertex-ai"
REPO="addvaluewithai-hub/vertex_ai"
gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT_ID" --location="global" --display-name="GitHub Media Factory"
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --project="$PROJECT_ID" --location="global" --workload-identity-pool="$POOL" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"
echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCP_SERVICE_ACCOUNT=$SA"
echo "GCP_WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
~~~

If these names already exist, inspect and reuse their configuration instead of creating duplicates. IAM propagation can take several minutes.

## Step 3. GitHub Actions Variables and Secrets

Open this repo: Settings -> Secrets and variables -> Actions -> **Variables**.

Create exactly:
- GCP_PROJECT_ID (the actual Google Cloud project ID, not display name)
- GCP_SERVICE_ACCOUNT (service account email printed above)
- GCP_WIF_PROVIDER (full projects/NUMBER/locations/global/.../providers/... resource printed above)

Optional cost-guard Variables:
- MAX_VIDEO_SECONDS = 5 by default; 3 through 10 supported.
- MAX_VIDEO_RESOLUTION = 360p by default; raise to 720p, 1080p or 4k only after approving higher spend.

**Required for production** Actions **Secret**: CLOUDINARY_URL in the format cloudinary://API_KEY:API_SECRET@CLOUD_NAME, matching your Gemini TTS factory. GitHub artifact uploads currently fail because your account has exhausted artifact storage. The factory therefore requires durable Cloudinary delivery before making any paid Google API request. Do not put credentials in Variables or commit them. Copying a Cloudinary secret between repos must be done manually or through permitted secure admin tooling.

## Step 4. Dry-run, then minimal paid pilot

First in Actions -> Vertex AI Media Factory -> Run workflow, paste the contents of examples/image.json. This is dry-run and should yield a validated result; it does not verify WIF or paid model availability.

Then change just mode to produce for ONE 1K image. After it succeeds, use examples/video.json with mode produce for ONE Omni video (3 seconds, 360p).

If 403, inspect WIF binding, main branch claim, API access and preview entitlement. If 404, inspect model ID and project. If 429, it is often quota/capacity. The current Omni 1.1 model is a preview; preview access may not be included in ordinary trial entitlements.

An optional reference_image_uri pointing to gs:// requires that the dedicated service account can read the specific Cloud Storage bucket objects (grant roles/storage.objectViewer on only that bucket if needed).

## Billing safeguards

Enable a Google Cloud Billing budget alert before production; **an alert is not a hard spending cap**. Restrict service quotas if available. Avoid blind retries, concurrent paid jobs and unattended bulk dispatch. Failing after an API call can still incur charges. GitHub artifact upload is best-effort until you free the storage quota. Actions summaries and Issue receipts remain accessible without artifacts. Cloudinary may charge separately for storage/transformations.

Official references:
- https://github.com/google-github-actions/auth
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-generation

## Video editing support

No extra secrets are needed for public Cloudinary input URLs. The GitHub Actions runner downloads the video, trims with FFmpeg and sends inline data to Gemini Omni via Vertex AI. Videos already hosted on GCS can be sent using source_video_uri (service-account GCS read permission required), but those must already be clipped to 10 seconds maximum. Optional Actions variable MAX_EDIT_SECONDS sets the maximum requested source length (default 8). See docs/VIDEO_EDIT.md.
