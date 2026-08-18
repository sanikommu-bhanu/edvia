import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, RotateCcw, Check, ScanLine, ImageUp, MessageSquare } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useAuth } from "@/app/AuthContext";
import { explainDocument, captureFrame } from "@/services/ai/document.service";

type ScanState = "idle" | "camera" | "captured" | "processing" | "result" | "failed";

/**
 * Camera → Cloudinary → EDVIA's document endpoint → real explanation.
 *
 * The previous version advanced to a "done" screen on a timer without ever
 * calling anything, which is exactly the fake-success pattern this app must
 * not have. Every state below is now driven by the actual request.
 */
export default function ScanDocument() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [stopCamera, preview]);

  async function startCamera() {
    setError(null);
    setState("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError("Camera access was denied or unavailable. You can upload a photo instead, or ask EDVIA in chat.");
      setState("idle");
    }
  }

  async function capture() {
    if (!videoRef.current) return;
    try {
      const file = await captureFrame(videoRef.current);
      acceptFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't capture that photo.");
    } finally {
      stopCamera();
    }
  }

  function acceptFile(file: File) {
    fileRef.current = file;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setState("captured");
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    fileRef.current = null;
    setExplanation(null);
    setError(null);
    setState("idle");
  }

  async function process() {
    const file = fileRef.current;
    if (!file || !user) return;
    setState("processing");
    setError(null);
    try {
      const result = await explainDocument(file, { schoolId: user.schoolId, uid: user.uid });
      setExplanation(result.message);
      setState("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "I couldn't read that document. Please try again.");
      setState("failed");
    }
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Scan Document" showBack />
      <div className="screen-pad !pt-0">
        {state === "idle" && (
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-edvia-200 bg-edvia-50 px-6 py-12 text-center">
            <ScanLine size={32} className="text-edvia-500" />
            <p className="mt-3 text-sm font-semibold text-slate-800">Scan a school document</p>
            <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
              EDVIA can explain homework sheets, notices and printed material in plain language.
            </p>
            {error && <p className="mt-3 max-w-[280px] text-xs text-danger">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => void startCamera()}>
                <Camera size={16} /> Open Camera
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <ImageUp size={16} /> Upload Photo
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) acceptFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {state === "camera" && (
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
            <div className="absolute inset-x-0 bottom-4 flex justify-center">
              <button
                onClick={() => void capture()}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20"
                aria-label="Capture photo"
              >
                <span className="h-12 w-12 rounded-full bg-white" />
              </button>
            </div>
          </div>
        )}

        {(state === "captured" || state === "failed") && preview && (
          <div>
            <img src={preview} alt="Captured document" className="aspect-[3/4] w-full rounded-2xl object-cover" />
            {error && <p className="mt-3 text-center text-xs text-danger">{error}</p>}
            <div className="mt-4 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={retake}>
                <RotateCcw size={16} /> Retake
              </Button>
              <Button className="flex-1" onClick={() => void process()}>
                <Check size={16} /> {state === "failed" ? "Try Again" : "Explain This"}
              </Button>
            </div>
          </div>
        )}

        {state === "processing" && (
          <div className="flex flex-col items-center py-16 text-center">
            <EdviaRobot size={88} state="thinking" />
            <p className="mt-4 text-sm font-medium text-slate-700">Reading your document…</p>
            <p className="mt-1 text-xs text-muted-foreground">This usually takes a few seconds.</p>
          </div>
        )}

        {state === "result" && explanation && (
          <div>
            {preview && <img src={preview} alt="Scanned document" className="mb-4 h-40 w-full rounded-2xl object-cover" />}
            <div className="card p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                EDVIA's explanation
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{explanation}</p>
            </div>
            <div className="mt-4 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={retake}>
                <RotateCcw size={16} /> Scan another
              </Button>
              <Button
                className="flex-1"
                onClick={() =>
                  navigate("/ai/chat", {
                    state: { initialMessage: "I just scanned a document — can you help me with it?" },
                  })
                }
              >
                <MessageSquare size={16} /> Ask a follow-up
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
