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
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-md sm:w-full glass rounded-lg border border-witch-plum-900/40 p-6 z-50 overflow-y-auto max-h-[90vh]"
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

                <div className="pt-2 border-t border-witch-plum-900/30">
                  <p className="text-witch-sage-500/60 text-xs">
                    Type <span className="font-mono text-witch-amber-500/70">/help</span> for commands
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
