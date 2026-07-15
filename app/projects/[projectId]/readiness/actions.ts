"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {createSupabaseServerClient} from "@/lib/supabase-server";

const uuid=z.string().uuid();
const item=z.string().trim().min(1).max(180);

async function requireManager(projectId:string){
  const supabase=await createSupabaseServerClient();
  const [{data:projectAllowed},{data:appAllowed}]=await Promise.all([
    supabase.rpc("has_project_role",{target_project_id:projectId,allowed_roles:["project_manager","producer","department_head","staff"]}),
    supabase.rpc("has_app_role",{allowed_roles:["admin","producer"]})
  ]);
  if(!projectAllowed&&!appAllowed)throw new Error("You do not have permission to change project readiness checks.");
  return supabase;
}

function refresh(projectId:string){
  revalidatePath(`/projects/${projectId}/overview`);
  revalidatePath(`/projects/${projectId}/setup`);
}

export async function ignoreProjectReadinessItemAction(formData:FormData){
  const user=await requireUser();
  const projectId=uuid.parse(String(formData.get("projectId")??""));
  const itemId=item.parse(String(formData.get("itemId")??""));
  const supabase=await requireManager(projectId);
  const {error}=await supabase.from("project_readiness_waivers").upsert({project_id:projectId,item_id:itemId,reason:"Not required for this project",created_by:user.id},{onConflict:"project_id,item_id"});
  if(error)throw new Error(error.message);
  refresh(projectId);
}

export async function restoreProjectReadinessItemAction(formData:FormData){
  await requireUser();
  const projectId=uuid.parse(String(formData.get("projectId")??""));
  const itemId=item.parse(String(formData.get("itemId")??""));
  const supabase=await requireManager(projectId);
  const {error}=await supabase.from("project_readiness_waivers").delete().eq("project_id",projectId).eq("item_id",itemId);
  if(error)throw new Error(error.message);
  refresh(projectId);
}
