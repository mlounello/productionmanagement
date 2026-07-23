import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AUDITION_FILE_BUCKET,
  auditionFileSha256,
  auditionStorageObjectPath,
  normalizedAuditionContentType,
} from "@/lib/audition-file-storage";
import { auditionUploadSizeLabel, auditionUploadTooLarge } from "@/lib/audition-upload";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const uuid = z.string().uuid();
const fieldKey = z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/i);

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "The upload request was incomplete." }, { status: 400 });
  }
  try {
    const accessToken = uuid.safeParse(formData.get("accessToken"));
    const targetFieldKey = fieldKey.safeParse(formData.get("fieldKey"));
    const file = formData.get("file");

    if (!accessToken.success || !targetFieldKey.success || !(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "The upload request was incomplete." }, { status: 400 });
    }
    if (auditionUploadTooLarge(file)) {
      return NextResponse.json({ error: `${file.name} exceeds the ${auditionUploadSizeLabel()} upload limit.` }, { status: 413 });
    }

    const contentType = normalizedAuditionContentType(file.name, file.type);
    if (!contentType) {
      return NextResponse.json(
        { error: "Upload a PDF, Word document, JPEG, PNG, or WebP file." },
        { status: 415 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: submission, error: submissionError } = await admin
      .from("audition_submissions")
      .select("id, project_id, form_id")
      .eq("applicant_token", accessToken.data)
      .maybeSingle();
    if (submissionError || !submission) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    const { data: field, error: fieldError } = await admin
      .from("audition_form_fields")
      .select("id")
      .eq("form_id", submission.form_id)
      .eq("field_key", targetFieldKey.data)
      .eq("field_type", "file")
      .maybeSingle();
    if (fieldError || !field) {
      return NextResponse.json({ error: "This upload field is not available." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const fileId = randomUUID();
    const storagePath = auditionStorageObjectPath({
      projectId: String(submission.project_id),
      submissionId: String(submission.id),
      fileId,
      fileName: file.name,
    });
    const sha256 = auditionFileSha256(bytes);
    const { error: uploadError } = await admin.storage
      .from(AUDITION_FILE_BUCKET)
      .upload(storagePath, bytes, {
        contentType,
        upsert: false,
        cacheControl: "0",
      });
    if (uploadError) {
      return NextResponse.json({ error: `The file could not be stored: ${uploadError.message}` }, { status: 502 });
    }

    const { error: metadataError } = await admin.from("audition_files").insert({
      id: fileId,
      submission_id: submission.id,
      field_key: targetFieldKey.data,
      file_name: file.name.slice(0, 240),
      content_type: contentType,
      file_size: bytes.length,
      file_data: null,
      storage_bucket: AUDITION_FILE_BUCKET,
      storage_path: storagePath,
      sha256,
      storage_state: "storage_only",
      storage_mirrored_at: new Date().toISOString(),
      integrity_verified_at: new Date().toISOString(),
    });

    if (metadataError) {
      await admin.storage.from(AUDITION_FILE_BUCKET).remove([storagePath]);
      return NextResponse.json(
        { error: `The upload metadata could not be saved: ${metadataError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, fileId });
  } catch (error) {
    console.error("Audition file upload failed", error);
    return NextResponse.json({ error: "The file could not be uploaded." }, { status: 500 });
  }
}
