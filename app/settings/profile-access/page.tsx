import { redirect } from "next/navigation";

export default function LegacyProfileAccessSettingsPage(){
  redirect("/settings/email-templates?tag=profile_access");
}
