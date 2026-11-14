import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";

export function parseCloudinaryUrl(raw) {
  if (!raw || typeof raw !== "string" || !raw.startsWith("cloudinary://")) {
    throw new Error(
      "CLOUDINARY_URL must be the full Cloudinary environment URL: cloudinary://API_KEY:API_SECRET@CLOUD_NAME",
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("CLOUDINARY_URL is not a valid URL");
  }

  const apiKey = decodeURIComponent(url.username || "");
  const apiSecret = decodeURIComponent(url.password || "");
  const cloudName = url.hostname;

  if (!apiKey || !apiSecret || !cloudName) {
    throw new Error(
      "CLOUDINARY_URL must contain API key, API secret, and cloud name",
    );
  }

  return { cloudName, apiKey, apiSecret };
}

export function getCloudinaryConfig(env = process.env) {
  const raw = env.CLOUDINARY_URL?.trim();
  if (!raw) {
    throw new Error(
      "Cloudinary is not configured. Add the GitHub secret CLOUDINARY_URL with value cloudinary://API_KEY:API_SECRET@CLOUD_NAME.",
    );
  }
  return parseCloudinaryUrl(raw);
}

function configureCloudinary(env = process.env) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig(env);
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return { cloudName, apiKey };
}

function resourceTypeFor(format) {
  return format === "wav" ? "video" : "raw";
}

function uploadBuffer({
  buffer,
  publicId,
  resourceType,
  tags,
  context,
  format,
  env = process.env,
}) {
  configureCloudinary(env);

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        public_id: publicId,
        overwrite: true,
        unique_filename: false,
        use_filename: false,
        tags,
        context,
        ...(format ? { format } : {}),
      },
      (error, payload) => {
        if (error) {
          reject(new Error(error.message || "Cloudinary upload failed"));
          return;
        }

        resolve({
          secure_url: payload.secure_url,
          public_id: payload.public_id,
          asset_id: payload.asset_id,
          resource_type: payload.resource_type,
          bytes: payload.bytes,
          format: payload.format || format || null,
          duration: payload.duration ?? null,
        });
      },
    );

    Readable.from([buffer]).pipe(upload);
  });
}

export async function uploadAudioToCloudinary({
  audio,
  format,
  mimeType: _mimeType,
  jobId,
  model,
  env = process.env,
}) {
  const extension = format === "wav" ? "wav" : format === "l16" ? "pcm" : format;
  const resourceType = resourceTypeFor(format);

  return uploadBuffer({
    buffer: audio,
    publicId: resourceType === "raw"
      ? `gemini-tts/${jobId}.${extension}`
      : `gemini-tts/${jobId}`,
    resourceType,
    format: resourceType === "video" ? extension : undefined,
    tags: ["gemini-tts", "generated-audio"],
    context: {
      job_id: jobId,
      model,
    },
    env,
  });
}

export async function uploadTextArtifactToCloudinary({
  content,
  jobId,
  suffix,
  mimeType: _mimeType,
  model,
  env = process.env,
}) {
  return uploadBuffer({
    buffer: Buffer.from(String(content), "utf8"),
    publicId: `gemini-tts/${jobId}.${suffix}`,
    resourceType: "raw",
    tags: ["gemini-tts", "transcript"],
    context: {
      job_id: jobId,
      model,
      artifact: suffix,
    },
    env,
  });
}
