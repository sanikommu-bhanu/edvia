import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";

/**
 * Shown when an account is authenticated but not yet linked to a real
 * student or class — i.e. the school's invite code hasn't been redeemed.
 *
 * This state is genuinely common and previously rendered as an empty
 * dashboard full of zeroes, which reads as "your child has 0% attendance"
 * rather than "we don't know who your child is yet". Naming the actual
 * problem, and the actual fix, is the difference.
 */
export function LinkAccountPrompt() {
  const navigate = useNavigate();
  return (
    <div className="card border-edvia-200 bg-edvia-50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-edvia-600">
          <KeyRound size={16} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-edvia-800">Link your account</p>
          <p className="mt-0.5 text-xs text-edvia-700">
            Enter the invite code your school gave you to connect this account to your records. Until then, EDVIA
            can't show attendance, assignments or exams.
          </p>
          <button
            onClick={() => navigate("/invite-code")}
            className="mt-3 rounded-full bg-edvia-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-edvia-600"
          >
            Enter invite code
          </button>
        </div>
      </div>
    </div>
  );
}
