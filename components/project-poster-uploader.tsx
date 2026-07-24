"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export function ProjectPosterUploader({ projectId, currentUrl, playbillLinked }: { projectId: string; currentUrl: string; playbillLinked: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload() {
    if (!file) return;
    setBusy(true); setMessage("");
    const data = new FormData(); data.set("poster", file);
    try {
      const response = await fetch(`/api/projects/${projectId}/poster`, { method: "POST", body: data });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error || "Poster upload failed.");
      setMessage(result.warning || (playbillLinked ? "Poster saved and sent to Playbill." : "Poster saved. Link a Playbill show to send it automatically."));
      setFile(null); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Poster upload failed."); }
    finally { setBusy(false); }
  }

  return <div className="project-poster-uploader">
    {currentUrl ? <Image src={currentUrl} alt="Current production poster" width={300} height={450} unoptimized/> : <div className="poster-placeholder">No poster uploaded</div>}
    <label className="field"><span>Upload show poster</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/><small>JPEG, PNG, or WebP up to 15 MB. It is resized and compressed before storage.</small></label>
    <button type="button" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Uploading…" : currentUrl ? "Replace poster" : "Upload poster"}</button>
    {message ? <p className={message.toLowerCase().includes("fail") ? "setup-warning" : "setup-success"}>{message}</p> : null}
  </div>;
}
