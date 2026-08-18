import { useRef, useState } from "react";
import { Camera, RotateCcw, Check, ScanLine } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";

type ScanState = "idle" | "camera_pending" | "captured" | "processing" | "result";

export default function ScanDocument() {
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function startCamera() {
    setError(null);
    setState("camera_pending");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError("Camera access was denied or is unavailable. You can grant permission from your browser settings.");
      setState("idle");
    }
  }

  function capture() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState("captured");
  }

  function retake() {
    setState("idle");
  }

  function process() {
    setState("processing");
    // Prompt 2 connects this to the AI orchestrator for document understanding.
    setTimeout(() => setState("result"), 1400);
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Scan Document" showBack />
      <div className="screen-pad !pt-0">
        {state === "idle" && (
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-edvia-200 bg-edvia-50 px-6 py-14 text-center">
            <ScanLine size={32} className="text-edvia-500" />
            <p className="mt-3 text-sm font-semibold text-slate-800">Scan a school document</p>
            <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">EDVIA can help explain homework sheets, notices, and printed material.</p>
            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
            <Button className="mt-5" onClick={startCamera}>
              <Camera size={16} /> Open Camera
            </Button>
          </div>
        )}

        {state === "camera_pending" && (
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
            <div className="absolute inset-x-0 bottom-4 flex justify-center">
              <button onClick={capture} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20" aria-label="Capture">
                <span className="h-12 w-12 rounded-full bg-white" />
              </button>
            </div>
          </div>
        )}

        {state === "captured" && (
          <div>
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-slate-100 text-muted-foreground">
              Captured document preview
            </div>
            <div className="mt-4 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={retake}>
                <RotateCcw size={16} /> Retake
              </Button>
              <Button className="flex-1" onClick={process}>
                <Check size={16} /> Use Photo
              </Button>
            </div>
          </div>
        )}

        {state === "processing" && (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-edvia-200 border-t-edvia-500" />
            <p className="mt-4 text-sm font-medium text-slate-700">Reading your document…</p>
          </div>
        )}

        {state === "result" && (
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <p className="text-sm font-semibold text-slate-900">Document captured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Full AI-powered document understanding connects in Prompt 2. For now, your scan is ready to attach to a chat with EDVIA.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
