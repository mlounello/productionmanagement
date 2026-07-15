import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { APP_SCHEMA } from "@/lib/config";
import { buildSienaProductionSchedule, isThursdayOpening } from "@/lib/siena-production-schedule";

const projectSchema = z.object({
  title: z.string().trim().min(1, "Project title is required.").max(160),
  projectType: z.enum(["theatre_production", "campus_event", "rental", "support_job", "other"]),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startsOn: z.string().trim().optional(),
  endsOn: z.string().trim().optional(),
  openingOn: z.string().trim().optional()
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 70);
}

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, new URL(request.url).origin));
}

function projectErrorPath(message: string) {
  return `/projects?error=${encodeURIComponent(message)}`;
}

function wantsJson(request: Request) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function failureResponse(request: Request, message: string, status = 400) {
  if (wantsJson(request)) {
    return NextResponse.json({ error: message }, { status });
  }

  return redirectTo(request, projectErrorPath(message));
}

function successResponse(request: Request, projectId: string) {
  const redirectPath = `/projects/${projectId}/setup`;

  if (wantsJson(request)) {
    return NextResponse.json({ redirectTo: redirectPath });
  }

  return redirectTo(request, redirectPath);
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  return scheme.toLowerCase() === "bearer" && token ? token : null;
}

function createTokenSupabaseClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(url, anon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: APP_SCHEMA
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

function requiredString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() ? value : undefined;
}

export async function POST(request: Request) {
  let supabase = (await createSupabaseServerClient()) as SupabaseClient<any, any, any>;
  const {
    data: { user: cookieUser }
  } = await supabase.auth.getUser();
  const accessToken = getBearerToken(request);
  let authenticatedUser = cookieUser;

  if (!authenticatedUser && accessToken) {
    const tokenClient = createTokenSupabaseClient(accessToken);
    const {
      data: { user: tokenUser }
    } = await tokenClient.auth.getUser(accessToken);

    if (tokenUser) {
      supabase = tokenClient;
      authenticatedUser = tokenUser;
    }
  }

  if (!authenticatedUser) {
    return failureResponse(
      request,
      accessToken
        ? "The create request included a browser session token, but Supabase could not validate it."
        : "The create request did not include a Supabase session. Sign out, sign in again, and retry.",
      401
    );
  }

  const formData = await request.formData();
  const rawTitle = requiredString(formData.get("title"));
  const rawProjectType = requiredString(formData.get("projectType"));
  const rawDepartmentId = optionalString(formData.get("departmentId"));
  const rawLocationId = optionalString(formData.get("locationId"));
  const rawStartsOn = optionalString(formData.get("startsOn"));
  const rawEndsOn = optionalString(formData.get("endsOn"));
  const rawOpeningOn = optionalString(formData.get("openingOn"));
  const parsed = projectSchema.safeParse({
    title: rawTitle,
    projectType: rawProjectType,
    departmentId: rawDepartmentId,
    locationId: rawLocationId,
    startsOn: rawStartsOn,
    endsOn: rawEndsOn,
    openingOn: rawOpeningOn
  });

  if (!parsed.success) {
    return failureResponse(request, parsed.error.issues[0]?.message ?? "Invalid project.");
  }

  const input = parsed.data;
  if(input.openingOn){
    try{
      if(!isThursdayOpening(input.openingOn))return failureResponse(request,"The standard Siena schedule requires opening night to be a Thursday.");
    }catch(error){
      return failureResponse(request,error instanceof Error?error.message:"Opening night is invalid.");
    }
  }
  const slugBase = slugify(input.title) || "project";
  const slug = `${slugBase}-${Date.now().toString(36)}`;

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      title: input.title,
      slug,
      project_type: input.projectType,
      primary_department_id: input.departmentId || null,
      primary_location_id: input.locationId || null,
      starts_on: input.startsOn || null,
      ends_on: input.endsOn || null,
      opening_on: input.openingOn || null,
      created_by: authenticatedUser.id
    })
    .select("id")
    .single();

  if (error || !project) {
    return failureResponse(request, error?.message ?? "Could not create project.");
  }

  const { error: membershipError } = await supabase.from("project_memberships").insert({
    project_id: String(project.id),
    user_id: authenticatedUser.id,
    role: "project_manager",
    title: "Project Manager"
  });

  if (membershipError) {
    return failureResponse(request, membershipError.message);
  }

  if(input.openingOn){
    const schedule=buildSienaProductionSchedule(input.openingOn);
    const {error:acceptanceError}=await supabase.from("project_role_acceptance_settings").upsert({
      project_id:String(project.id),
      rehearsal_schedule:schedule.rehearsalSchedule,
      tech_schedule:schedule.techSchedule,
      performance_schedule:schedule.performanceSchedule,
      updated_by:authenticatedUser.id
    },{onConflict:"project_id"});
    if(acceptanceError)return failureResponse(request,`Project created, but its standard schedule could not be generated: ${acceptanceError.message}`);
  }

  const { error: setupError } = await supabase.from("project_setup_preferences").upsert({
    project_id: String(project.id),
    setup_status: "in_progress",
    current_step: "workflow",
    updated_by: authenticatedUser.id
  }, { onConflict: "project_id" });

  if (setupError) {
    return failureResponse(request, `Project created, but its setup workflow could not be started: ${setupError.message}`);
  }

  return successResponse(request, String(project.id));
}
