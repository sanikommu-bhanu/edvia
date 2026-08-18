import { TopBar } from "@/layouts/TopBar";
import { ThumbsUp, ThumbsDown, RefreshCcw, ShieldCheck, BookMarked, FileText } from "lucide-react";
import { MOCK_SOURCE_KINDS } from "@/services/ai/ai.service";
import type { AISource } from "@/types";

const EXAMPLE_SOURCES: AISource[] = [
  { id: "src_1", title: "NCERT Physics — Class 9, Chapter 8: Motion", kind: "educational" },
  { id: "src_2", title: "Khan Academy — Newton's Laws of Motion", kind: "educational" },
];

const KIND_ICON: Record<AISource["kind"], typeof ShieldCheck> = {
  policy: ShieldCheck,
  educational: BookMarked,
  resource: FileText,
  document: FileText,
};

export default function AiResponseDetail() {
  return (
    <div className="min-h-screen pb-8">
      <TopBar title="AI Response" showBack />
      <div className="screen-pad !pt-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</p>
        <div className="mb-6 space-y-2">
          {EXAMPLE_SOURCES.map((s) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <div key={s.id} className="card flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
                  <Icon size={16} />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{MOCK_SOURCE_KINDS[s.kind]}</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Response</p>
        <div className="card p-4 text-sm leading-relaxed text-slate-800">
          Newton&apos;s Three Laws of Motion are the foundation of classical mechanics. They were proposed by Sir
          Isaac Newton and published in his book &quot;Philosophiae Naturalis Principia Mathematica&quot;.
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button className="rounded-full border border-border p-2 text-muted-foreground hover:bg-muted" aria-label="Regenerate">
            <RefreshCcw size={16} />
          </button>
          <button className="rounded-full border border-border p-2 text-muted-foreground hover:bg-muted" aria-label="Good response">
            <ThumbsUp size={16} />
          </button>
          <button className="rounded-full border border-border p-2 text-muted-foreground hover:bg-muted" aria-label="Bad response">
            <ThumbsDown size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
