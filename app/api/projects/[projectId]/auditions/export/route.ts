import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { readAuditionFileBytes } from "@/lib/audition-file-storage";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

const PAGE = { width: 612, height: 792, margin: 42 };
function clean(value: unknown) { return Array.isArray(value) ? value.join(", ") : String(value ?? "").trim(); }
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean); let line = "";
    for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate; else { if (line) lines.push(line); line = word; } }
    lines.push(line || " ");
  }
  return lines;
}

function header(page: PDFPage, titleFont: PDFFont, bodyFont: PDFFont, project: string, title: string, confidential: boolean) {
  page.drawText("SIENA THEATRE", { x: PAGE.margin, y: 755, font: titleFont, size: 10, color: rgb(0, .4, .28) });
  page.drawText(project, { x: PAGE.margin, y: 735, font: titleFont, size: 17 });
  page.drawText(title, { x: PAGE.margin, y: 714, font: bodyFont, size: 11, color: rgb(.32, .38, .35) });
  page.drawLine({ start: { x: PAGE.margin, y: 701 }, end: { x: 570, y: 701 }, thickness: 1, color: rgb(.82, .87, .84) });
  if (confidential) page.drawText("CONFIDENTIAL - AUTHORIZED AUDITION STAFF ONLY", { x: PAGE.margin, y: 22, font: titleFont, size: 8, color: rgb(.65, .12, .1) });
  return 682;
}

function drawAnswer(page: PDFPage, titleFont: PDFFont, bodyFont: PDFFont, y: number, label: string, value: string) {
  const maxWidth = PAGE.width - PAGE.margin * 2;
  const labelLines = wrap(label, titleFont, 9, maxWidth); const valueLines = wrap(value || "—", bodyFont, 10, maxWidth);
  const needed = labelLines.length * 11 + valueLines.length * 13 + 12;
  if (y - needed < 45) return { y, overflow: true };
  for (const line of labelLines) { page.drawText(line, { x: PAGE.margin, y, font: titleFont, size: 9, color: rgb(.1,.17,.14) }); y -= 11; }
  for (const line of valueLines) { page.drawText(line, { x: PAGE.margin, y, font: bodyFont, size: 10, color: rgb(.18,.22,.2) }); y -= 13; }
  return { y: y - 8, overflow: false };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params; const { supabase, applyCookies } = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return applyCookies(NextResponse.json({ error: "Sign in required." }, { status: 401 }));
  const { data: allowed } = await supabase.rpc("can_review_auditions", { target_project_id: projectId }); if (!allowed) return applyCookies(NextResponse.json({ error: "Audition review access required." }, { status: 403 }));
  const url = request.nextUrl; const exportType = url.searchParams.get("exportType") ?? "packet"; const selectedIds = url.searchParams.getAll("submissionId");
  const allApplicants = url.searchParams.get("allApplicants") === "true" || selectedIds.length === 0; const included = url.searchParams.getAll("includeField");
  const notesPage = url.searchParams.get("notesPage") === "on"; const hideBlank = url.searchParams.get("hideBlank") === "on"; const compact = url.searchParams.get("compact") === "on";
  const [{ data: project }, { data: forms }, { data: fields }, { data: roles }] = await Promise.all([
    supabase.from("projects").select("title").eq("id", projectId).single(),
    supabase.from("audition_forms").select("id, title").eq("project_id", projectId),
    supabase.from("audition_form_fields").select("form_id, field_key, label, sensitivity, export_group, sort_order").order("sort_order"),
    supabase.from("project_roles").select("id, name").eq("project_id", projectId).order("name")
  ]);
  let submissionQuery = supabase.from("audition_submissions").select("id, form_id, answers, private_notes, audition_status, callback_status, casting_status, submitted_at, people(full_name, preferred_name, email, pronouns), audition_slots(starts_at), audition_reviews(notes, recommendation), audition_files(field_key, file_name, content_type, file_data, storage_bucket, storage_path, sha256)").eq("project_id", projectId).is("cancelled_at", null);
  if (!allApplicants) submissionQuery = submissionQuery.in("id", selectedIds);
  const { data: submissions, error } = await submissionQuery; if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const formMap = new Map((forms ?? []).map((form) => [String(form.id), String(form.title)]));
  const roleNameById = new Map((roles ?? []).map((role) => [String(role.id), String(role.name)]));
  const rows = [...(submissions ?? [])] as Array<Record<string, unknown>>;
  rows.sort((a,b) => {
    const pa = a.people as Record<string,unknown>|null; const pb = b.people as Record<string,unknown>|null;
    if (url.searchParams.get("sort") === "name") return clean(pa?.preferred_name||pa?.full_name).localeCompare(clean(pb?.preferred_name||pb?.full_name));
    const sa = a.audition_slots as Record<string,unknown>|null; const sb = b.audition_slots as Record<string,unknown>|null; return clean(sa?.starts_at).localeCompare(clean(sb?.starts_at));
  });
  const pdf = await PDFDocument.create(); const bodyFont = await pdf.embedFont(StandardFonts.Helvetica); const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sensitiveIncluded = (fields ?? []).some((field) => field.sensitivity === "sensitive" && included.includes(String(field.export_group)));
  if (exportType === "roster") {
    let page = pdf.addPage([PAGE.width,PAGE.height]); let y = header(page,titleFont,bodyFont,String(project?.title??"Production"),"Audition Roster",false);
    rows.forEach((row,index)=>{if(y<55){page=pdf.addPage([PAGE.width,PAGE.height]);y=header(page,titleFont,bodyFont,String(project?.title??"Production"),"Audition Roster (continued)",false);}const person=row.people as Record<string,unknown>|null;const slot=row.audition_slots as Record<string,unknown>|null;page.drawText(`${index+1}. ${clean(person?.preferred_name||person?.full_name)}`,{x:PAGE.margin,y,font:titleFont,size:10});page.drawText(`${slot?.starts_at?new Date(String(slot.starts_at)).toLocaleString():"Unscheduled"}  |  ${clean(row.audition_status)}`,{x:260,y,font:bodyFont,size:9});y-=22;page.drawLine({start:{x:PAGE.margin,y:y+8},end:{x:570,y:y+8},thickness:.5,color:rgb(.85,.88,.86)});});
  } else {
    for (const [index,row] of rows.entries()) {
      const person = row.people as Record<string,unknown>|null; const name = clean(person?.preferred_name||person?.full_name||"Applicant"); const answers=(row.answers??{}) as Record<string,unknown>;
      let page=pdf.addPage([PAGE.width,PAGE.height]); let y=header(page,titleFont,bodyFont,String(project?.title??"Production"),`${exportType==="supplement"?"Selective Supplement":"Director Audition Packet"} · ${name} · ${index+1}/${rows.length}`,sensitiveIncluded);
      const files=(row.audition_files as Array<Record<string,unknown>>|null)??[]; const headshot=files.find((file)=>file.field_key==="headshot"&&["image/png","image/jpeg","image/jpg"].includes(String(file.content_type).toLowerCase()));
      if(included.includes("headshot")&&headshot){try{const imageBytes=await readAuditionFileBytes(headshot);const embedded=String(headshot.content_type).toLowerCase()==="image/png"?await pdf.embedPng(imageBytes):await pdf.embedJpg(imageBytes);const scale=Math.min(95/embedded.width,112/embedded.height);page.drawImage(embedded,{x:475,y:575,width:embedded.width*scale,height:embedded.height*scale});}catch{/* A missing or corrupt image should not block the rest of the packet. */}}
      const identity = [`Name: ${name}`,`Email: ${clean(person?.email)}`,`Pronouns: ${clean(person?.pronouns)}`].filter(Boolean).join("   |   "); for(const line of wrap(identity,titleFont,10,headshot&&included.includes("headshot")?410:528)){page.drawText(line,{x:PAGE.margin,y,font:titleFont,size:10});y-=13;} y-=11;if(headshot&&included.includes("headshot"))y=Math.min(y,560);
      if(included.includes("resume")){const resume=files.find((file)=>file.field_key==="resume");if(resume){const result=drawAnswer(page,titleFont,bodyFont,y,"Résumé Upload",String(resume.file_name));y=result.y;}}
      const formFields=(fields??[]).filter((field)=>String(field.form_id)===String(row.form_id)&&included.includes(String(field.export_group)));
      for(const field of formFields){const raw=answers[String(field.field_key)];const value=String(field.field_key)==="role_interests"?(Array.isArray(raw)?raw:[raw]).filter(Boolean).map((id)=>roleNameById.get(String(id))??String(id)).join(", "):clean(raw);if(hideBlank&&!value)continue;let result=drawAnswer(page,titleFont,bodyFont,y,String(field.label),value);if(result.overflow){page=pdf.addPage([PAGE.width,PAGE.height]);y=header(page,titleFont,bodyFont,String(project?.title??"Production"),`${name} · continued`,sensitiveIncluded);result=drawAnswer(page,titleFont,bodyFont,y,String(field.label),value);}y=result.y;if(compact)y+=5;}
      if(included.includes("reviewer_notes")){const independent=(row.audition_reviews as Array<Record<string,unknown>>|null)??[];const reviewText=[clean(row.private_notes),...independent.map((review)=>`${clean(review.recommendation)}${review.notes?`\n${clean(review.notes)}`:""}`)].filter(Boolean).join("\n\n");const result=drawAnswer(page,titleFont,bodyFont,y,"Reviewer Notes",reviewText);y=result.y;}
      if(notesPage){const notes=pdf.addPage([PAGE.width,PAGE.height]);let ny=header(notes,titleFont,bodyFont,String(project?.title??"Production"),`Director Notes · ${name}`,false);notes.drawText("ROLE CONSIDERATION",{x:PAGE.margin,y:ny,font:titleFont,size:10});ny-=18;(roles??[]).slice(0,24).forEach((role,roleIndex)=>{const col=roleIndex%2;const rowIndex=Math.floor(roleIndex/2);const x=PAGE.margin+col*260;const yy=ny-rowIndex*18;notes.drawRectangle({x,y:yy-2,width:9,height:9,borderWidth:1,borderColor:rgb(.3,.35,.32)});notes.drawText(String(role.name),{x:x+15,y:yy-1,font:bodyFont,size:9});});ny-=Math.ceil(Math.min((roles??[]).length,24)/2)*18+12;notes.drawText("RECOMMENDATION",{x:PAGE.margin,y:ny,font:titleFont,size:10});ny-=20;["Callback","Considering","Cast","Not cast","Needs discussion"].forEach((label,i)=>{notes.drawRectangle({x:PAGE.margin+i*100,y:ny,width:9,height:9,borderWidth:1,borderColor:rgb(.3,.35,.32)});notes.drawText(label,{x:PAGE.margin+i*100+14,y:ny+1,font:bodyFont,size:8});});ny-=30;notes.drawText("NOTES",{x:PAGE.margin,y:ny,font:titleFont,size:10});for(let line=0;line<22;line++){ny-=24;notes.drawLine({start:{x:PAGE.margin,y:ny},end:{x:570,y:ny},thickness:.5,color:rgb(.72,.76,.73)});}}
    }
  }
  await supabase.from("audition_export_audit").insert({ project_id: projectId, generated_by: user.id, export_type: exportType, submission_ids: rows.map((row)=>String(row.id)), included_fields: included, settings: { notes_page: notesPage, hide_blank: hideBlank, compact, sensitive_included: sensitiveIncluded } });
  const bytes=await pdf.save(); const safe=String(project?.title??"auditions").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase();
  return applyCookies(new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${safe}-${exportType}.pdf"`,"Cache-Control":"no-store"}}));
}
