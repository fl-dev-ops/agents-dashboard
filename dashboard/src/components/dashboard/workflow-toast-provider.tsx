"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";

const POLL_INTERVAL_MS = 1500;
const SEEN_KEY_PREFIX = "workflow-toast-seen:";
const DISMISSED_KEY_PREFIX = "workflow-toast-dismissed:";

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

function markSeen(id: string) {
  const s = loadJsonSet(SEEN_KEY_PREFIX);
  s.add(id);
  saveJsonSet(SEEN_KEY_PREFIX, s);
}

function markDismissed(id: string) {
  const s = loadJsonSet(DISMISSED_KEY_PREFIX);
  s.add(id);
  saveJsonSet(DISMISSED_KEY_PREFIX, s);
}

function wasDismissed(id: string) {
  return loadJsonSet(DISMISSED_KEY_PREFIX).has(id);
}

function wasSeen(id: string) {
  return loadJsonSet(SEEN_KEY_PREFIX).has(id);
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
        markSeen(run.id);
      } else if (lastMsg !== msg) {
        // Message changed — update
        toast.loading(msg, { id: toastId });
      }

      lastMessagesRef.current.set(run.id, msg);
    }

    // Handle terminal workflows not yet seen (e.g. after refresh)
    if (terminalRuns) {
      for (const run of terminalRuns as WorkflowRun[]) {
        const toastId = `workflow:${run.id}`;
        if (wasSeen(run.id) || wasDismissed(toastId)) continue;

        if (run.status === "COMPLETED") {
          toast.success(run.message || run.title, { id: toastId });
        } else if (run.status === "FAILED") {
          toast.error(run.message || run.title, { id: toastId });
        }
        markSeen(run.id);
      }
    }

    activeIdsRef.current = currentIds;
  }, [activeRuns, terminalRuns]);

  return null;
}
