"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requestProfileVerificationCode, verifyProfileCode } from "@/lib/profile-intake";

const contextSchema = z.object({
  contextType: z.enum(["audition", "technical_interest"]),
  contextId: z.string().uuid(),
  contextToken: z.string().uuid(),
  email: z.string().trim().email(),
  vendorNumber: z.string().trim().max(40).optional()
});

function basePath(type: "audition" | "technical_interest", token: string) {
  return type === "audition" ? `/auditions/${token}` : `/interest/${token}`;
}

export async function requestIntakeVerificationCodeAction(formData: FormData) {
  const parsed = contextSchema.safeParse({ contextType: formData.get("contextType"), contextId: formData.get("contextId"), contextToken: formData.get("contextToken"), email: formData.get("email"), vendorNumber: formData.get("vendorNumber") });
  if (!parsed.success) redirect(`/?error=${encodeURIComponent("Enter a valid email and form details.")}`);
  const path = basePath(parsed.data.contextType, parsed.data.contextToken);
  let challengeId = "";
  try {
    const result = await requestProfileVerificationCode(parsed.data);
    challengeId = result.challengeId;
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Verification code could not be sent.")}`);
  }
  redirect(`${path}?challenge=${challengeId}&notice=${encodeURIComponent("If those details match a saved profile, a six-digit code has been emailed. Enter it below. If no code arrives, continue as a new participant.")}`);
}

export async function verifyIntakeCodeAction(formData: FormData) {
  const parsed = z.object({ contextType: z.enum(["audition", "technical_interest"]), contextId: z.string().uuid(), contextToken: z.string().uuid(), challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).safeParse({ contextType: formData.get("contextType"), contextId: formData.get("contextId"), contextToken: formData.get("contextToken"), challengeId: formData.get("challengeId"), code: String(formData.get("code") ?? "").trim() });
  if (!parsed.success) redirect(`/?error=${encodeURIComponent("Enter the six-digit code.")}`);
  const path = basePath(parsed.data.contextType, parsed.data.contextToken);
  let session = "";
  try {
    session = await verifyProfileCode(parsed.data);
  } catch (error) {
    redirect(`${path}?challenge=${parsed.data.challengeId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Verification failed.")}`);
  }
  redirect(`${path}?profile=${encodeURIComponent(session)}&success=${encodeURIComponent("Saved profile loaded. Review and update the information below.")}`);
}
