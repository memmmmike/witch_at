"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type FeedbackType = "bug" | "feature" | "question" | "other";

const FEEDBACK_TYPES: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "question", label: "Question" },
  { value: "other", label: "Other" },
];

export function Feedback() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const reset = () => {
    setType("bug");
    setTitle("");
    setDescription("");
    setStatus("idle");
    setErrorMessage("");
  };

  const handleClose = () => {
    setIsOpen(false);
    // Reset after animation
    setTimeout(reset, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setStatus("sending");
    setErrorMessage("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          type,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send feedback");
      }

      setStatus("success");
      setTimeout(handleClose, 1500);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <>
      {/* Feedback button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 glass px-3 py-2 rounded-lg border border-witch-plum-700/50 text-xs text-witch-sage-500/80 hover:text-witch-parchment hover:border-witch-plum-500/70 transition-colors"
        title="Send feedback"
      >
        Feedback
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-witch-soot-950/80 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && handleClose()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md glass rounded-xl border border-witch-plum-700/50 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-witch-parchment">Send Feedback</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-witch-sage-500/70 hover:text-witch-parchment transition-colors text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              {status === "success" ? (
                <div className="text-center py-6">
                  <p className="text-witch-parchment/90 text-sm">Thank you for your feedback</p>
                  <p className="text-witch-sage-500/70 text-xs mt-1">We&apos;ll look into it</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Type selector */}
                  <div className="flex gap-2 flex-wrap">
                    {FEEDBACK_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                          type === t.value
                            ? "bg-witch-plum-700/70 text-witch-parchment"
                            : "bg-witch-soot-800/50 text-witch-sage-500/80 hover:text-witch-parchment"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Title */}
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief title"
                    maxLength={100}
                    className="w-full bg-witch-soot-800/90 border border-witch-plum-700/50 rounded-lg px-3 py-2.5 text-sm text-witch-parchment placeholder:text-witch-sage-500/70 focus:outline-none focus:ring-1 focus:ring-witch-amber-500/50 focus:border-witch-amber-500/50"
                  />

                  {/* Description */}
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your feedback..."
                    rows={4}
                    maxLength={2000}
                    className="w-full bg-witch-soot-800/90 border border-witch-plum-700/50 rounded-lg px-3 py-2.5 text-sm text-witch-parchment placeholder:text-witch-sage-500/70 focus:outline-none focus:ring-1 focus:ring-witch-amber-500/50 focus:border-witch-amber-500/50 resize-none"
                  />

                  {/* Error message */}
                  {status === "error" && errorMessage && (
                    <p className="text-xs text-rose-400/90">{errorMessage}</p>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={status === "sending" || !title.trim() || !description.trim()}
                    className="w-full px-4 py-2.5 rounded-lg bg-witch-plum-700/70 hover:bg-witch-plum-500/80 active:bg-witch-plum-600/80 text-sm font-medium text-witch-parchment disabled:opacity-50 transition-colors"
                  >
                    {status === "sending" ? "Sending..." : "Send"}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
