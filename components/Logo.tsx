"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Logo() {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAbout(true)}
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none cursor-pointer bg-transparent border-none p-0"
        title="About witch@"
      >
        <span className="text-xs sm:text-sm tracking-wide text-witch-plum-400/30 font-mono hover:text-witch-plum-400/50 transition-colors">
          witch<span className="text-witch-amber-500/40 hover:text-witch-amber-500/60">@</span>
        </span>
      </button>

      <AnimatePresence>
        {showAbout && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-witch-soot-950/80 backdrop-blur-sm z-40"
              onClick={() => setShowAbout(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-md glass rounded-lg border border-witch-plum-900/40 p-6 overflow-y-auto max-h-[90vh]"
              >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-medium text-witch-parchment">
                  witch<span className="text-witch-amber-500">@</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAbout(false)}
                  className="text-witch-sage-500/70 hover:text-witch-plum-400/90 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4 text-sm text-witch-sage-400">
                <p>
                  <span className="text-witch-plum-400">Digital orality.</span> Chat as a spoken stream, not a documented archive.
                </p>

                <p>
                  Like oral tradition, conversations exist in the moment. New users joining don&apos;t receive prior context, they walk into a conversation already in progress.
                </p>

                <p>
                  Messages fade like memories. Only the most recent stay sharp.
                </p>

                <div className="pt-2 border-t border-witch-plum-900/30 flex items-center justify-between">
                  <p className="text-witch-sage-500/60 text-xs">
                    Type <span className="font-mono text-witch-amber-500/70">/help</span> for commands
                  </p>
                  <a
                    href="https://github.com/memmmmike/witch_at"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-witch-sage-500/40 hover:text-witch-sage-500/70 transition-colors"
                    title="View source on GitHub"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                  </a>
                </div>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
