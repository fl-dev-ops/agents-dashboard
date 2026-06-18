"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";

const POLL_INTERVAL_MS = 5000;
const DISMISSED_KEY_PREFIX = "workflow-toast-dismissed:";
const TERMINAL_SHOWN_KEY_PREFIX = "workflow-toast-terminal-shown:";

function loadJsonSet(prefix: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${prefix}__set`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveJsonSet(prefix: string, set: Set<string>) {
  try {
    localStorage.setItem(`${prefix}__set`, JSON.stringify([...set]));
  } catch {
    // localStorage unavailable — ignore
  }
}

function markTerminalShown(id: string) {
  const s = loadJsonSet(TERMINAL_SHOWN_KEY_PREFIX);
  s.add(id);
  saveJsonSet(TERMINAL_SHOWN_KEY_PREFIX, s);
}

function wasTerminalShown(id: string) {
  return loadJsonSet(TERMINAL_SHOWN_KEY_PREFIX).has(id);
}

type WorkflowRun = {
  id: string;
  status: string;
  title: string;
  message: string | null;
  phase: string | null;
};

export function WorkflowToastProvider() {
  const trpc = useTRPC();
  const activeIdsRef = useRef(new Set<string>());
  const lastMessagesRef = useRef(new Map<string, string>());

  const { data: activeRuns } = useQuery({
    ...trpc.workflowRuns.listActive.queryOptions(),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: terminalRuns } = useQuery({
    ...trpc.workflowRuns.listRecentUnseen.queryOptions(),
    refetchInterval: POLL_INTERVAL_MS * 2,
  });

  useEffect(() => {
    if (!activeRuns) return;

    const currentIds = new Set(activeRuns.map((r: WorkflowRun) => r.id));

    // Show/update toasts for active workflows
    for (const run of activeRuns) {
      const toastId = `workflow:${run.id}`;
      const msg = run.message || run.title;
      const lastMsg = lastMessagesRef.current.get(run.id);

      if (!activeIdsRef.current.has(run.id)) {
        // New workflow — show loading toast
        toast.loading(msg, { id: toastId });
      } else if (lastMsg !== msg) {
        // Message changed — update
        toast.loading(msg, { id: toastId });
      }

      lastMessagesRef.current.set(run.id, msg);
    }

    // Detect workflows that disappeared from active (completed/failed)
    for (const prevId of activeIdsRef.current) {
      if (!currentIds.has(prevId)) {
        const terminal = (terminalRuns as WorkflowRun[] | undefined)?.find((r) => r.id === prevId);
        if (terminal && !wasTerminalShown(terminal.id)) {
          const toastId = `workflow:${terminal.id}`;
          if (terminal.status === "COMPLETED") {
            toast.success(terminal.message || terminal.title, { id: toastId });
          } else if (terminal.status === "FAILED") {
            toast.error(terminal.message || terminal.title, { id: toastId });
          }
          markTerminalShown(terminal.id);
        }
      }
    }

    // Show terminal toasts for workflows that completed before this page loaded
    if (terminalRuns) {
      for (const run of terminalRuns as WorkflowRun[]) {
        if (currentIds.has(run.id)) continue;
        if (wasTerminalShown(run.id)) continue;

        const toastId = `workflow:${run.id}`;
        if (run.status === "COMPLETED") {
          toast.success(run.message || run.title, { id: toastId });
        } else if (run.status === "FAILED") {
          toast.error(run.message || run.title, { id: toastId });
        }
        markTerminalShown(run.id);
      }
    }

    activeIdsRef.current = currentIds;
  }, [activeRuns, terminalRuns]);

  return null;
}
