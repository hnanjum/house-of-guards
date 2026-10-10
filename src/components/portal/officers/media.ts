import { supabase } from "../../../lib/portalSupabase";

/**
 * Photos, video and files. Photos are shrunk on the phone before upload
 * (long edge 1600px, JPEG) so they send quickly on a weak signal and fit
 * the storage limits; video is sent as recorded (up to 50 MB). Every
 * bucket is private: files are only ever shown through short-lived
 * signed links.
 */

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function compressImage(file: Blob, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return out ?? file;
  } catch {
    return file; // a format the browser can't decode: send as is
  }
}

export const extFor = (type: string) =>
  ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "application/pdf": "pdf",
  })[type] ?? "bin";

export async function signedUrl(bucket: string, path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function uploadNow(bucket: string, path: string, blob: Blob, contentType: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error(error.message);
}

export const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
