import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ==========================================================================
// JoinQrCard — the thing a school actually puts on a wall
// --------------------------------------------------------------------------
// This is designed to be PRINTED and PHOTOGRAPHED, not just looked at, and
// every decision follows from that:
//
//   * White card, black QR, generous quiet zone. A tinted or gradient QR is
//     the single most common reason a scan fails across a staff room, and
//     "on brand" is not worth a code that only works at 30cm.
//   * The human code is set large and monospaced with the letter groups
//     separated, because someone will read it aloud across a room. The
//     alphabet it comes from already excludes O/0 and I/1 (see
//     api/_lib/invites.ts) — this just has to not undo that.
//   * The school name and what the invitation is FOR are printed on the card
//     itself, so a photo of it carries its own context. The preview endpoint
//     returns exactly these fields and nothing more, for the same reason:
//     everything on this card is already public to whoever holds it.
//
// The QR encodes an opaque URL and nothing else — no role, no school id, no
// permissions. There is nothing in it to tamper with.
//
// The `qrcode` library is imported dynamically so it lands in its own chunk:
// a student checking their timetable should never download a QR encoder.
// ==========================================================================

export interface JoinQrCardProps {
  /** The absolute URL the QR encodes. */
  url: string;
  /** The short code, for people who would rather type than scan. */
  code: string;
  schoolName: string;
  /** e.g. "Teacher invitation" or "Class 10 - A". */
  subtitle: string;
  /** Optional line of instruction under the code. */
  instruction?: string;
}

type CopyTarget = "link" | "code";

export function JoinQrCard({ url, code, schoolName, subtitle, instruction }: JoinQrCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  // ---- render the QR ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setQrError(false);

    void (async () => {
      try {
        const QR = await import("qrcode");
        if (cancelled || !canvasRef.current) return;
        await QR.toCanvas(canvasRef.current, url, {
          // Level M survives a fingerprint, a fold, and a phone camera at an
          // angle. H would survive more but makes the modules smaller at the
          // same print size, which is the wrong trade for a wall poster.
          errorCorrectionLevel: "M",
          margin: 2,
          width: 720,
          color: { dark: "#0F172A", light: "#FFFFFF" },
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[EDVIA] couldn't render the join QR", err);
        setQrError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // ---- copy ---------------------------------------------------------------
  const copy = useCallback(async (value: string, target: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access is denied in some webviews and over plain http.
      // Selecting the text is the honest fallback; claiming success is not.
      setShareError("Couldn't copy automatically — select the text and copy it manually.");
    }
  }, []);

  // ---- share --------------------------------------------------------------
  // Real Web Share API where it exists, real copy where it does not. There
  // is no third branch that pretends: a "Share" button that silently does
  // nothing is worse than one that says it copied instead.
  const share = useCallback(async () => {
    setShareError(null);
    const payload = {
      title: `Join ${schoolName} on EDVIA`,
      text: `${subtitle}\n${schoolName}\nJoin code: ${code}`,
      url,
    };

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        // AbortError is the user closing the sheet — a decision, not a
        // failure, and showing an error for it trains people to ignore
        // errors.
        if ((err as { name?: string })?.name === "AbortError") return;
        console.warn("[EDVIA] native share failed; falling back to copy", err);
      }
    }
    await copy(url, "link");
  }, [code, copy, schoolName, subtitle, url]);

  // ---- download -----------------------------------------------------------
  // Draws the whole card — heading, QR, code — into one PNG rather than
  // exporting the bare QR, so what gets pinned to the noticeboard says which
  // school and which invitation it is. A bare QR on a wall is unscannable in
  // the sense that matters: nobody knows whether to scan it.
  const download = useCallback(() => {
    const source = canvasRef.current;
    if (!source) return;

    const scale = 2;
    const W = 640 * scale;
    const PAD = 48 * scale;
    const qrSize = 420 * scale;
    const H = 780 * scale;

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#64748B";
    ctx.font = `600 ${20 * scale}px system-ui, sans-serif`;
    ctx.fillText("SCAN TO JOIN", W / 2, PAD + 22 * scale);

    ctx.fillStyle = "#0F172A";
    ctx.font = `700 ${34 * scale}px system-ui, sans-serif`;
    ctx.fillText(truncate(schoolName, 26), W / 2, PAD + 70 * scale);

    ctx.fillStyle = "#7C4DDB";
    ctx.font = `600 ${22 * scale}px system-ui, sans-serif`;
    ctx.fillText(truncate(subtitle, 34), W / 2, PAD + 106 * scale);

    ctx.drawImage(source, (W - qrSize) / 2, PAD + 136 * scale, qrSize, qrSize);

    const codeY = PAD + 136 * scale + qrSize + 56 * scale;
    ctx.fillStyle = "#64748B";
    ctx.font = `600 ${17 * scale}px system-ui, sans-serif`;
    ctx.fillText("OR ENTER THIS CODE", W / 2, codeY);

    ctx.fillStyle = "#0F172A";
    ctx.font = `700 ${40 * scale}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText(code, W / 2, codeY + 52 * scale);

    ctx.fillStyle = "#94A3B8";
    ctx.font = `500 ${16 * scale}px system-ui, sans-serif`;
    ctx.fillText("Powered by EDVIA", W / 2, H - PAD);

    const link = document.createElement("a");
    link.download = `edvia-join-${slug(schoolName)}-${code}.png`;
    link.href = out.toDataURL("image/png");
    link.click();
  }, [code, schoolName, subtitle]);

  return (
    <div className="space-y-3">
      {/* The printable card. White and untinted on purpose — see above. */}
      <div className="rounded-3xl border border-border bg-white px-5 py-6 text-center shadow-soft">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Scan to join
        </p>
        <p className="mt-2 font-display text-title font-bold text-slate-900">{schoolName}</p>
        <p className="mt-0.5 text-small font-semibold text-edvia-600">{subtitle}</p>

        <div className="mt-4 flex justify-center">
          {qrError ? (
            <div className="flex h-[220px] w-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border px-4 text-center">
              <p className="text-[13px] font-semibold text-slate-700">QR unavailable</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Use the join code below — it works exactly the same way.
              </p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="h-[220px] w-[220px] rounded-2xl"
              role="img"
              aria-label={`QR code to join ${schoolName}. ${subtitle}. You can also use the join code ${code}.`}
            />
          )}
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Or enter this code
        </p>
        <p className="mt-1 select-all font-mono text-[26px] font-bold tracking-[0.08em] text-slate-900">
          {code}
        </p>
        {instruction && (
          <p className="mx-auto mt-2 max-w-[280px] text-[12.5px] leading-relaxed text-muted-foreground">
            {instruction}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={share}>
          <Share2 size={16} /> Share
        </Button>
        <Button variant="secondary" onClick={download} disabled={qrError}>
          <Download size={16} /> Download
        </Button>
        <Button variant="outline" onClick={() => copy(url, "link")}>
          {copied === "link" ? <Check size={16} /> : <Link2 size={16} />}
          {copied === "link" ? "Link copied" : "Copy link"}
        </Button>
        <Button variant="outline" onClick={() => copy(code, "code")}>
          {copied === "code" ? <Check size={16} /> : <Copy size={16} />}
          {copied === "code" ? "Code copied" : "Copy code"}
        </Button>
      </div>

      {shareError && (
        <p role="status" className="rounded-xl bg-edvia-50/80 px-3 py-2.5 text-[13px] text-edvia-800">
          {shareError}
        </p>
      )}
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
}
