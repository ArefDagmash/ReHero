type ProgressBarProps = {
  value: number; // 0–100
  className?: string;
  // "accent" ties into the same indigo used by the XP/level ring and AI
  // sparkle badge, for reading-progress indicators. "neutral" (default)
  // keeps the plain foreground-colored fill.
  variant?: "neutral" | "accent";
};

export function ProgressBar({ value, className = "", variant = "neutral" }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1.5 w-full rounded-full bg-secondary overflow-hidden ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${variant === "accent" ? "bg-indigo-400" : "bg-foreground"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
