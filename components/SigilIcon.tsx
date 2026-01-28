"use client";

type SigilName = "spiral" | "eye" | "triangle" | "cross" | "diamond";

const SIGIL_PATHS: Record<SigilName, string> = {
  spiral: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z",
  eye: "M12 6c-3 0-6 2.5-6 6s3 6 6 6 6-2.5 6-6-3-6-6-6zm0 9c-1.5 0-3-1.5-3-3s1.5-3 3-3 3 1.5 3 3-1.5 3-3 3z",
  triangle: "M12 4L4 20h16L12 4zm0 4l5 10H7l5-10z",
  cross: "M12 4v16M4 12h16",
  diamond: "M12 2l10 10-10 10L2 12 12 2z",
};

export function SigilIcon({
  sigil,
  color = "currentColor",
  size = 14,
  className = "",
}: {
  sigil: SigilName | string | null | undefined;
  color?: string;
  size?: number;
  className?: string;
}) {
  const path = sigil && SIGIL_PATHS[sigil as SigilName];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
