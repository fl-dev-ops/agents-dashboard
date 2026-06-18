"use client";

import { useQueryClient } from "@tanstack/react-query";
import { IconBrowser, IconLoader } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentSelect } from "@/components/dashboard/agent-select";
import { useTRPC } from "@/trpc/client";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";

export default function WebPlaygroundPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [userId, setUserId] = useState("");

  const createSession = useMutationWithToast(
    trpc.calls.createPlaygroundCall.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.calls.list.queryFilter());
      },
    }),
    { success: "Session started" },
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Web test"
        title="Web playground"
        description="Dispatch an agent into a LiveKit room for browser and web-client validation."
        actions={<Link href="/playground" className={buttonVariants({ variant: "outline", size: "sm" })}>All playground tests</Link>}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-6 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold">Launch session</h2>
            <p className="mt-1 text-sm text-muted-foreground">This creates a LiveKit room and dispatches the selected agent. Browser token generation can be layered onto this flow when the web client is connected.</p>
          </div>
          <div className="flex justify-end">
            <Button disabled={!agentId || createSession.isPending} onClick={() => createSession.mutate({ dial: false, agentId, userId: userId || undefined })}>
              {createSession.isPending ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconBrowser data-icon="inline-start" />}
              Launch web session
            </Button>
          </div>
        </section>

        <aside className="h-fit space-y-4 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold">Configuration</h2>
            <p className="mt-1 text-sm text-muted-foreground">Select the agent and participant details.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Agent</label>
              <AgentSelect value={agentId} onChange={setAgentId} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">User ID</label>
              <Input placeholder="Optional" value={userId} onChange={(event) => setUserId(event.target.value)} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
