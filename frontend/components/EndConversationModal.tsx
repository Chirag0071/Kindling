"use client";

import { useState } from "react";
import Button from "./Button";
import { TextArea } from "./Input";
import type { CloseReason } from "@/lib/types";

const REASONS: { value: CloseReason; label: string }[] = [
  { value: "not_feeling_it", label: "Not feeling a connection" },
  { value: "met_someone_else", label: "Focusing on someone else" },
  { value: "distance", label: "Distance is too much" },
  { value: "timing_not_right", label: "Timing isn't right" },
  { value: "no_longer_using_app", label: "Stepping back from the app" },
  { value: "other", label: "Something else" },
];

interface Props {
  onClose: () => void;
  onConfirm: (reason: CloseReason, note?: string) => Promise<void>;
}

export default function EndConversationModal({ onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<CloseReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await onConfirm(reason, reason === "other" ? note : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-dusk-deep/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-card bg-dusk border border-ash p-6 pb-8">
        <h2 className="font-display text-xl text-birch mb-1.5">End this conversation</h2>
        <p className="text-slate text-sm mb-5">
          We'll send a kind note instead of leaving them hanging — that's the whole point.
        </p>

        <div className="space-y-2 mb-4">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={`w-full text-left rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                reason === r.value
                  ? "border-ember bg-ember/10 text-birch"
                  : "border-ash text-slate hover:border-slate"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {reason === "other" && (
          <TextArea
            placeholder="Say a quick word, in your own voice"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={200}
            className="mb-4"
          />
        )}

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1">Never mind</Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            loading={submitting}
            disabled={!reason}
            className="flex-1"
          >
            End it
          </Button>
        </div>
      </div>
    </div>
  );
}
