import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";

type MiniAudioPlayerProps = {
  audio: HTMLAudioElement;
  onStop: () => void;
};

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function MiniAudioPlayer({ audio, onStop }: MiniAudioPlayerProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(audio.paused);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    setCurrentTime(audio.currentTime);
    rafRef.current = requestAnimationFrame(tick);
  }, [audio]);

  useEffect(() => {
    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onEnded = () => setPaused(true);

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    rafRef.current = requestAnimationFrame(tick);

    // Metadata may already be loaded before we mounted
    onMeta();
    if (!audio.paused) setPaused(false);

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, [audio, tick]);

  const toggle = () => {
    if (audio.paused) audio.play();
    else audio.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    audio.currentTime = frac * (duration || audio.duration || 0);
  };

  const skip = (seconds: number) => {
    const d = duration || audio.duration || 0;
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), d);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary text-sm min-w-0">
      {/* Big play/pause button */}
      <button
        onClick={toggle}
        className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center hover:bg-indigo-600 active:scale-95 transition-all shrink-0"
      >
        {paused ? <Play className="h-3.5 w-3.5 ml-0.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>

      {/* Back 5s */}
      <button
        onClick={() => skip(-5)}
        className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-border hover:border-muted-foreground active:scale-95 transition-all shrink-0"
        title="Back 5s"
      >
        <SkipBack className="h-3 w-3" />
      </button>

      {/* Progress bar */}
      <div
        className="flex-1 h-2.5 bg-background border border-border rounded-full cursor-pointer relative min-w-[80px] hover:border-muted-foreground transition-colors"
        onClick={seek}
      >
        <div
          className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Forward 5s */}
      <button
        onClick={() => skip(5)}
        className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-border hover:border-muted-foreground active:scale-95 transition-all shrink-0"
        title="Forward 5s"
      >
        <SkipForward className="h-3 w-3" />
      </button>

      {/* Time */}
      <span className="tabular-nums text-xs text-muted-foreground shrink-0 w-[80px] text-right">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Close */}
      <button
        onClick={onStop}
        className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-border hover:border-muted-foreground active:scale-95 transition-all shrink-0"
        title="Stop"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
