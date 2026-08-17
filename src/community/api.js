export class ApiClientError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && typeof options.body !== "string" && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)) {
    headers.set("Content-Type", "application/json");
    options = { ...options, body: JSON.stringify(options.body) };
  }
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: "same-origin" });
  const type = response.headers.get("Content-Type") || "";
  const payload = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new ApiClientError(payload?.error || "请求失败，请稍后再试。", response.status, payload?.code || "request_error");
  return payload;
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 100 * 1024;
const AVATAR_INPUT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_OUTPUT_SIZES = [AVATAR_OUTPUT_SIZE, 448, 384, 320];
const AVATAR_QUALITY_STEPS = [.92, .86, .8, .74, .68, .62, .56, .5];

function detectedImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

export async function validateAvatarFile(file) {
  if (!(file instanceof Blob)) throw new ApiClientError("请选择图片文件。", 400, "invalid_avatar");
  if (!file.size || file.size > AVATAR_INPUT_MAX_BYTES) {
    throw new ApiClientError("原始图片需不超过 10 MB。", 413, "avatar_input_too_large");
  }
  const declaredType = String(file.type || "").toLowerCase();
  if (!AVATAR_INPUT_TYPES.has(declaredType)) throw new ApiClientError("头像仅支持 JPEG、PNG 或 WebP。", 415, "invalid_avatar_type");
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const actualType = detectedImageType(header);
  if (!actualType || actualType !== declaredType) throw new ApiClientError("图片格式与文件内容不一致，请换一张 JPEG、PNG 或 WebP 图片。", 415, "invalid_avatar_type");
  return actualType;
}

export async function compressAvatar(file, crop = {}) {
  await validateAvatarFile(file);
  const bitmap = await createImageBitmap(file);
  try {
    const rotation = ((Number(crop.rotation) || 0) % 360 + 360) % 360;
    const quarterTurn = rotation === 90 || rotation === 270;
    const rotated = document.createElement("canvas");
    rotated.width = quarterTurn ? bitmap.height : bitmap.width;
    rotated.height = quarterTurn ? bitmap.width : bitmap.height;
    const rotatedContext = rotated.getContext("2d");
    if (!rotatedContext) throw new ApiClientError("无法处理这张图片，请换一张重试。", 400, "invalid_avatar");
    rotatedContext.translate(rotated.width / 2, rotated.height / 2);
    rotatedContext.rotate(rotation * Math.PI / 180);
    rotatedContext.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const previewWidth = 1;
    const previewHeight = 1 / (Number(crop.stageAspect) || 1);
    const scale = Math.min(previewWidth / rotated.width, previewHeight / rotated.height);
    const imageX = (previewWidth - rotated.width * scale) / 2;
    const imageY = (previewHeight - rotated.height * scale) / 2;
    const rawCropX = Number(crop.cropX);
    const rawCropY = Number(crop.cropY);
    const rawCropSize = Number(crop.cropSize);
    const cropSize = Math.min(
      rotated.width * scale,
      rotated.height * scale,
      Math.max(.05, Number.isFinite(rawCropSize) ? rawCropSize : Math.min(rotated.width * scale, rotated.height * scale)),
    );
    const cropX = Math.min(imageX + rotated.width * scale - cropSize, Math.max(imageX, Number.isFinite(rawCropX) ? rawCropX : imageX));
    const cropY = Math.min(imageY + rotated.height * scale - cropSize, Math.max(imageY, Number.isFinite(rawCropY) ? rawCropY : imageY));
    const sourceX = Math.max(0, (cropX - imageX) / scale);
    const sourceY = Math.max(0, (cropY - imageY) / scale);
    const sourceSize = Math.min(cropSize / scale, rotated.width - sourceX, rotated.height - sourceY);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new ApiClientError("无法处理这张图片，请换一张重试。", 400, "invalid_avatar");

    for (const outputSize of AVATAR_OUTPUT_SIZES) {
      canvas.width = outputSize;
      canvas.height = outputSize;
      context.fillStyle = "#fffafd";
      context.fillRect(0, 0, outputSize, outputSize);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(rotated, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
      for (const quality of AVATAR_QUALITY_STEPS) {
        const blob = await canvasBlob(canvas, quality);
        if (blob?.type === "image/webp" && blob.size > 0 && blob.size <= AVATAR_MAX_BYTES) return blob;
      }
    }
    throw new ApiClientError("图片压缩后仍然超过 100 KB，请换一张图片重试。", 413, "avatar_too_large");
  } finally {
    bitmap.close();
  }
}

export function contentHref(type, slug) {
  if (type === "post" && slug === "site-friends") return "/#/friends";
  if (type === "post" && slug === "site-about") return "/#/about";
  if (type === "post") return `/#/post/${slug}`;
  if (type === "poem") return `/#/poem/${slug}`;
  if (type === "music") return `/#/music/${slug}`;
  return "/";
}

export function formatCommunityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replaceAll("/", "-");
}
