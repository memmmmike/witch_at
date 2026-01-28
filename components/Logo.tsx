"use client";

export function Logo() {
  return (
    <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 select-none pointer-events-none">
      <span className="text-xs sm:text-sm tracking-wide text-witch-plum-400/30 font-mono">
        witch<span className="text-witch-amber-500/40">@</span>
      </span>
    </div>
  );
}
