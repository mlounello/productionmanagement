import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeAuditionHeadshot } from "@/lib/audition-headshot";
import { auditionUploadSizeLabel, auditionUploadTooLarge } from "@/lib/audition-upload";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

    const isHeadshot = targetFieldKey.data === "headshot";
    if (isHeadshot && !file.type.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Choose an image file for the headshot." }, { status: 400 });
    }
    const sourceBytes = Buffer.from(await file.arrayBuffer());
    const bytes = isHeadshot ? await normalizeAuditionHeadshot(sourceBytes) : sourceBytes;
    const uploadName = isHeadshot ? `${file.name.replace(/\.[^.]+$/, "") || "headshot"}.jpg` : file.name;
    const uploadType = isHeadshot ? "image/jpeg" : file.type || "application/octet-stream";
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("upload_public_audition_file", {
      access_token: accessToken.data,
      target_field_key: targetFieldKey.data,
      upload_name: uploadName,
      upload_type: uploadType,
      upload_data: `\\x${bytes.toString("hex")}`
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Audition file upload failed", error);
    return NextResponse.json({ error: "The file could not be uploaded." }, { status: 500 });
  }
}
