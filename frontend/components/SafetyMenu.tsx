"use client";

import { useState } from "react";
import { safety, ApiError } from "@/lib/api";
import Button from "./Button";
import { TextArea } from "./Input";

const REPORT_REASONS = [
  "Inappropriate photos",
  "Harassment or abuse",
  "Suspected fake profile",
  "Underage user",
  "Something else",
];

interface Props {
  userId: string;
  userName: string;
  onDone: () => void;
  onCancel: () => void;
}

export default function SafetyMenu({ userId, userName, onDone, onCancel }: Props) {
  const [mode, setMode] = useState<"menu" | "report" | "block-confirm">("menu");
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleBlock = async () => {
    setSubmitting(true);
    setError("");
    try {
      await safety.block(userId);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't block right now.");
      setSubmitting(false);
    }
  };

  const handleReport = async () => {
    setSubmitting(true);
    setError("");
    try {
      await safety.report(userId, reason, details || undefined, true);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit the report.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-dusk-deep/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-card bg-dusk border border-ash p-6 pb-8">
        {mode === "menu" && (
          <>
            <h2 className="font-display text-xl text-birch mb-5">{userName}</h2>
            <div className="space-y-2">
              <button
                onClick={() => setMode("report")}
                className="w-full text-left rounded-xl border border-ash px-4 py-3 text-sm text-birch hover:border-slate transition-colors"
              >
                Report {userName}
              </button>
              <button
                onClick={() => setMode("block-confirm")}
                className="w-full text-left rounded-xl border border-ash px-4 py-3 text-sm text-red-500 hover:border-red-400 transition-colors"
              >
                Block {userName}
              </button>
            </div>
            <Button variant="ghost" onClick={onCancel} className="w-full mt-4">Cancel</Button>
          </>
        )}

        {mode === "report" && (
          <>
            <h2 className="font-display text-xl text-birch mb-1.5">Report {userName}</h2>
            <p className="text-slate text-sm mb-4">This also blocks them so they can't contact you again.</p>
            <div className="space-y-2 mb-4">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full text-left rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                    reason === r ? "border-ember bg-ember/10 text-birch" : "border-ash text-slate hover:border-slate"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <TextArea
              placeholder="Anything else we should know? (optional)"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={2}
              className="mb-4"
            />
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setMode("menu")} className="flex-1">Back</Button>
              <Button variant="danger" onClick={handleReport} loading={submitting} className="flex-1">Submit report</Button>
            </div>
          </>
        )}

        {mode === "block-confirm" && (
          <>
            <h2 className="font-display text-xl text-birch mb-1.5">Block {userName}?</h2>
            <p className="text-slate text-sm mb-5">
              They won't be able to message you again, and this conversation will close.
            </p>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setMode("menu")} className="flex-1">Back</Button>
              <Button variant="danger" onClick={handleBlock} loading={submitting} className="flex-1">Block</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}