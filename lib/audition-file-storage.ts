import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const AUDITION_FILE_BUCKET = "audition-files";

const supportedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const extensionMimeTypes: Record<string, string> = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

export type AuditionFileRecord = {
  file_data?: unknown;
  storage_bucket?: unknown;
  storage_path?: unknown;
  sha256?: unknown;
};

function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function normalizedAuditionContentType(name: string, reportedType: string) {
  const normalized = reportedType.trim().toLowerCase();
  if (supportedMimeTypes.has(normalized)) return normalized;
  return extensionMimeTypes[fileExtension(name)] ?? null;
}

export function safeAuditionFileName(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "upload";
}

export function auditionStorageObjectPath(input: {
  projectId: string;
  submissionId: string;
  fileId?: string;
  fileName: string;
}) {
  return `${input.projectId}/${input.submissionId}/${input.fileId ?? randomUUID()}/${safeAuditionFileName(input.fileName)}`;
}

export function auditionFileSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function databaseBytes(value: unknown) {
  if (value instanceof Uint8Array) return Buffer.from(value);
  const hex = String(value ?? "").replace(/^\\x/, "");
  if (!hex || !/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return null;
  return Buffer.from(hex, "hex");
}

export async function readAuditionFileBytes(record: AuditionFileRecord) {
  const bucket = String(record.storage_bucket ?? "").trim();
  const path = String(record.storage_path ?? "").trim();
  if (bucket && path) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (!error && data) {
      const bytes = Buffer.from(await data.arrayBuffer());
      const expected = String(record.sha256 ?? "").trim().toLowerCase();
      const actual = auditionFileSha256(bytes);
      if (expected && expected !== actual) {
        throw new Error("The stored audition file did not pass its integrity check.");
      }
      return bytes;
    }
  }

  const fallback = databaseBytes(record.file_data);
  if (fallback) return fallback;
  throw new Error("The audition file payload is unavailable.");
}
