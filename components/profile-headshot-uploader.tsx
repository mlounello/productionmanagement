"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const OUTPUT_SIZE = 1200;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export function ProfileHeadshotUploader({ personId }: { personId: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [hasImage, setHasImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const context = canvas.getContext("2d");
    if (!context) return;
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const sourceX = (image.naturalWidth - sourceSize) * (focusX / 100);
    const sourceY = (image.naturalHeight - sourceSize) * (focusY / 100);
    context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  }, [focusX, focusY, zoom]);

  useEffect(() => draw(), [draw]);
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function chooseFile(file: File | undefined) {
    setMessage("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setMessage("The original image must be 15 MB or smaller.");
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setZoom(1);
      setFocusX(50);
      setFocusY(50);
      setHasImage(true);
      requestAnimationFrame(draw);
    };
    image.onerror = () => setMessage("That image could not be opened.");
    image.src = objectUrl;
  }

  async function upload() {
    const canvas = canvasRef.current;
    if (!canvas || !hasImage) return;
    setBusy(true);
    setMessage("");
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
      if (!blob) throw new Error("The cropped image could not be prepared.");
      const formData = new FormData();
      formData.set("headshot", blob, "headshot.jpg");
      const response = await fetch(`/api/people/${personId}/headshot`, { method: "POST", body: formData });
      const result = await response.json() as { error?: string; size?: number };
      if (!response.ok) throw new Error(result.error || "Headshot upload failed.");
      setMessage(`Headshot saved (${Math.round(Number(result.size ?? 0) / 1024)} KB, 1:1).`);
      setHasImage(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Headshot upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="headshot-uploader">
      <label className="field">
        <span>Choose a headshot</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
      </label>
      {hasImage ? (
        <>
          <canvas ref={canvasRef} width={OUTPUT_SIZE} height={OUTPUT_SIZE} className="headshot-crop-canvas" aria-label="Square headshot crop preview" />
          <div className="headshot-crop-controls">
            <label><span>Zoom</span><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
            <label><span>Move left/right</span><input type="range" min="0" max="100" value={focusX} onChange={(event) => setFocusX(Number(event.target.value))} /></label>
            <label><span>Move up/down</span><input type="range" min="0" max="100" value={focusY} onChange={(event) => setFocusY(Number(event.target.value))} /></label>
          </div>
          <button type="button" onClick={upload} disabled={busy}>{busy ? "Preparing headshot…" : "Crop and save headshot"}</button>
        </>
      ) : null}
      <p className="muted">The saved image is always a 1:1 JPEG, resized and compressed below Propared’s 3 MB limit. A new upload replaces the prior file.</p>
      {message ? <p className={message.includes("saved") ? "setup-success" : "setup-warning"}>{message}</p> : null}
    </div>
  );
}
