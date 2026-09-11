"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_POSTER_WIDTH = 1800;
const MAX_POSTER_HEIGHT = 2700;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That poster image could not be opened."));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function preparePoster(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP poster.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("The original poster must be 15 MB or smaller.");

  const image = await loadImage(file);
  let scale = Math.min(1, MAX_POSTER_WIDTH / image.naturalWidth, MAX_POSTER_HEIGHT / image.naturalHeight);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the poster image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.86, 0.76, 0.66]) {
      const blob = await canvasBlob(canvas, quality);
      if (!blob) throw new Error("The poster image could not be prepared.");
      if (blob.size <= MAX_UPLOAD_BYTES) return blob;
    }
    scale *= 0.8;
  }

  throw new Error("The poster could not be compressed enough to upload. Try a smaller image.");
}

export function ProjectPosterUploader({ projectId, currentUrl, playbillLinked }: { projectId: string; currentUrl: string; playbillLinked: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "warning" | "error">("success");

  async function upload() {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const poster = await preparePoster(file);
      const data = new FormData(); data.set("poster", poster, "poster.jpg");
      const response = await fetch(`/api/projects/${projectId}/poster`, { method: "POST", body: data });
      const responseType = response.headers.get("content-type") ?? "";
      const result = responseType.includes("application/json")
        ? await response.json() as { error?: string; warning?: string }
        : { error: response.status === 413 ? "The prepared poster was still too large to upload." : await response.text() };
      if (!response.ok) throw new Error(result.error || `Poster upload failed (${response.status}).`);
      setMessageKind(result.warning ? "warning" : "success");
      setMessage(result.warning || (playbillLinked ? "Poster saved and sent to Playbill." : "Poster saved. Link a Playbill show to send it automatically."));
      setFile(null); router.refresh();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Poster upload failed.");
    }
    finally { setBusy(false); }
  }

  return <div className="project-poster-uploader">
    {currentUrl ? <Image src={currentUrl} alt="Current production poster" width={300} height={450} unoptimized/> : <div className="poster-placeholder">No poster uploaded</div>}
    <label className="field"><span>Upload show poster</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage(""); }}/><small>JPEG, PNG, or WebP up to 15 MB. It is resized and compressed before upload and storage.</small></label>
    <button type="button" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Preparing and uploading…" : currentUrl ? "Replace poster" : "Upload poster"}</button>
    {message ? <p className={messageKind === "success" ? "setup-success" : "setup-warning"}>{message}</p> : null}
  </div>;
}
