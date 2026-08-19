import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LifeBuoy, MessageSquare, Sparkles } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useAuth } from "@/app/AuthContext";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

interface Faq {
  question: string;
  answer: string;
  roles?: Role[];
}

/**
 * Help content is written to set accurate expectations about what EDVIA
 * can and cannot do. Overstating it here is the cheapest way to make the
 * assistant feel broken later — a parent told it "contacts the teacher"
 * will read "request submitted" as a failure.
 */
const FAQS: Faq[] = [
  {
    question: "Where do EDVIA's answers come from?",
    answer:
      "Anything about your school — attendance, assignments, exams, timetables, notices, policies — is read from your school's records at the moment you ask. EDVIA does not answer school questions from memory, and it will tell you plainly when it cannot find something rather than guessing.",
  },
  {
    question: "What can EDVIA see about me?",
    answer:
      "Only what your account is authorised for. A student sees their own records, a parent sees their linked children, a teacher sees the classes they are assigned to, and school management sees school-level figures. This is checked on the server for every single request.",
  },
  {
    question: "Can I ask in my own language?",
    answer:
      "Yes. EDVIA understands and replies in English, Hindi, Tamil, Telugu, Marathi, Bengali, Gujarati, Punjabi, Kannada, Malayalam and Urdu, including mixed phrasing like \"Rahul ki attendance kitni hai?\". Changing language never changes what you are allowed to see.",
  },
  {
    question: "What happens when I ask EDVIA to contact my teacher?",
    answer:
      "EDVIA files a call-back request routed to your child's class teacher, and tells you once that request exists. It does not place a call or send a message on your behalf, and it will never claim a teacher has been reached — you can check the status any time by asking, or on the Support screen.",
    roles: ["student", "parent"],
  },
  {
    question: "Why does EDVIA ask before marking attendance?",
    answer:
      "Because it is changing a real record. Before it writes anything it reads the current value and shows you exactly what would change — for example \"Rahul is currently marked present, change to absent?\" — and waits for you to confirm. Every change is recorded in the school's audit trail with who made it and what it was before.",
    roles: ["teacher"],
  },
  {
    question: "Why can't I see another class?",
    answer:
      "Access follows your actual assignments. If you should have a class you cannot see, your school office can add it — EDVIA cannot grant it to you, and asking it to will not work.",
    roles: ["teacher", "principal"],
  },
  {
    question: "Voice mode isn't working",
    answer:
      "Voice needs microphone permission and a stable connection. If it fails, EDVIA falls back to chat and everything still works — you are not locked out of anything. You can re-check microphone access under Settings.",
  },
  {
    question: "My dashboard is empty",
    answer:
      "Your account probably is not linked to your school records yet. Enter the invite code your school gave you (Profile → Link Account) and your attendance, assignments and exams will appear.",
  },
];

export default function Help() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(0);

  const visible = FAQS.filter((faq) => !faq.roles || (user?.role && faq.roles.includes(user.role)));

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Help & Support" showBack />

      <div className="screen-pad !pt-0">
        <div className="card mb-4 flex items-center gap-3 border-edvia-200 bg-edvia-50 p-4">
          <EdviaRobot size={44} state="idle" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-edvia-800">Ask EDVIA directly</p>
            <p className="text-xs text-edvia-600">It can answer most questions about your school straight away.</p>
          </div>
          <button
            onClick={() => navigate("/ai/chat")}
            className="rounded-full bg-edvia-500 p-2.5 text-white hover:bg-edvia-600"
            aria-label="Open chat"
          >
            <Sparkles size={16} />
          </button>
        </div>

        <p className="mb-2 text-sm font-semibold text-slate-800">Common questions</p>
        <div className="space-y-2">
          {visible.map((faq, index) => {
            const expanded = open === index;
            return (
              <div key={faq.question} className="card overflow-hidden">
                <button
                  onClick={() => setOpen(expanded ? null : index)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 p-3.5 text-left"
                >
                  <span className="flex-1 text-sm font-medium text-slate-800">{faq.question}</span>
                  <ChevronDown
                    size={16}
                    className={cn("shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
                  />
                </button>
                {expanded && (
                  <p className="border-t border-border px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mb-2 mt-6 text-sm font-semibold text-slate-800">Still need a person?</p>
        <div className="space-y-2">
          <button
            onClick={() => navigate("/support")}
            className="card flex w-full items-center gap-3 p-3.5 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
              <LifeBuoy size={16} />
            </span>
            <span className="flex-1 text-sm font-medium text-slate-800">Contact your school</span>
          </button>
          <button onClick={() => navigate("/ai/chat")} className="card flex w-full items-center gap-3 p-3.5 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
              <MessageSquare size={16} />
            </span>
            <span className="flex-1 text-sm font-medium text-slate-800">Ask EDVIA to arrange a call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
