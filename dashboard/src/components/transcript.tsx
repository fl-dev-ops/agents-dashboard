"use client";

import { cn } from "@/lib/utils";

export type TranscriptTurn = {
  role?: string;
  text?: string;
  timestamp?: Date | string;
};

export type TranscriptProps = {
  turns: TranscriptTurn[];
  /** When provided, timestamps render as relative offsets (e.g. "0:12"). */
  sessionStart?: Date | string;
  className?: string;
};

export function Transcript({ turns, sessionStart, className }: TranscriptProps) {
  if (turns.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-8 text-sm text-muted-foreground", className)}>
        No transcript yet.
      </div>
    );
  }

  return (
    <div className={cn("flex max-h-[600px] flex-col gap-1 overflow-y-auto", className)}>
      {turns.map((turn, i) => {
        const isUser = turn.role === "user";
        const time = turn.timestamp
          ? sessionStart
            ? formatRelative(turn.timestamp, sessionStart)
            : formatAbsolute(turn.timestamp)
          : null;

        return (
          <div key={i} className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
                isUser
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md",
              )}
            >
              <p className="whitespace-pre-wrap">{turn.text}</p>
            </div>
            {time && (
              <span className="mt-1 px-1 text-[11px] tabular-nums text-muted-foreground/70">
                {time}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatRelative(ts: Date | string, start: Date | string): string {
  const diffMs = Math.max(0, new Date(ts).getTime() - new Date(start).getTime());
  const totalSec = Math.floor(diffMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatAbsolute(ts: Date | string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ts));
}
