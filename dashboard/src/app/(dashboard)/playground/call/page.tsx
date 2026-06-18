"use client";

import { useQueryClient } from "@tanstack/react-query";
import { IconLoader, IconPhoneCall, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentSelect } from "@/components/dashboard/agent-select";
import { PhoneNumberSelect } from "@/components/dashboard/phone-number-select";
import { useTRPC } from "@/trpc/client";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";

const E164_PATTERN = /^\+\d{8,15}$/;

export default function CallPlaygroundPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [toNumbers, setToNumbers] = useState<string[]>([]);
  const [userId, setUserId] = useState("");

  const createCall = useMutationWithToast(
    trpc.calls.createPlaygroundCall.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.calls.list.queryFilter());
      },
    }),
    {
      success: (result) => {
        const r = result as { started: number; toNumbers: string[] };
        return `Dispatched ${r.started} call${r.started === 1 ? "" : "s"} to ${r.toNumbers.join(", ")}`;
      },
    },
  );

  const launchDisabled = createCall.isPending || !agentId || !phoneNumberId || toNumbers.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="SIP call test"
        title="Call playground"
        description="Place outbound SIP calls through an imported phone number."
        actions={<Link href="/playground" className={buttonVariants({ variant: "outline", size: "sm" })}>All playground tests</Link>}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-6 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold">Launch call</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review the SIP route before launching.</p>
          </div>
          <div className="flex justify-end">
            <Button disabled={launchDisabled} onClick={() => createCall.mutate({ dial: true, agentId, phoneNumberId, toNumbers, userId: userId || undefined })}>
              {createCall.isPending ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconPhoneCall data-icon="inline-start" />}
              Launch SIP call
            </Button>
          </div>
        </section>

        <aside className="h-fit space-y-4 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold">Configuration</h2>
            <p className="mt-1 text-sm text-muted-foreground">Select the agent, phone numbers, and participant details.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Agent</label>
              <AgentSelect value={agentId} onChange={setAgentId} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">From number</label>
              <PhoneNumberSelect value={phoneNumberId} onChange={setPhoneNumberId} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">To numbers</label>
              <PhoneNumberChipsInput value={toNumbers} onChange={setToNumbers} />
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

function PhoneNumberChipsInput({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addNumbers = (rawValues: string[]) => {
    const next = [...value];
    const invalid: string[] = [];
    for (const raw of rawValues) {
      const phoneNumber = raw.trim();
      if (!phoneNumber) continue;
      if (!E164_PATTERN.test(phoneNumber)) {
        invalid.push(phoneNumber);
        continue;
      }
      if (!next.includes(phoneNumber)) next.push(phoneNumber);
    }
    onChange(next);
    setError(invalid.length ? `Invalid E.164 number: ${invalid[0]}` : null);
    return invalid;
  };

  const commitDraft = () => {
    const invalid = addNumbers(draft.split(/[\s,;]+/));
    setDraft(invalid.join(", "));
  };

  const removeNumber = (phoneNumber: string) => onChange(value.filter((item) => item !== phoneNumber));

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-card px-2 py-1 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        {value.map((phoneNumber) => (
          <Badge key={phoneNumber} variant="secondary" className="h-7 rounded-md pl-2 pr-1 font-mono">
            {phoneNumber}
            <button type="button" className="ml-1 rounded-sm p-0.5 text-muted-foreground hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove ${phoneNumber}`} onClick={() => removeNumber(phoneNumber)}>
              <IconX className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          className="min-w-36 flex-1 bg-transparent px-1 py-1.5 text-sm font-normal outline-none placeholder:text-muted-foreground"
          placeholder={value.length ? "Add another number" : "+919999999999"}
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => {
            const next = event.target.value;
            if (/[\s,;]$/.test(next)) {
              const invalid = addNumbers(next.split(/[\s,;]+/));
              setDraft(invalid.join(", "));
              return;
            }
            setDraft(next);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab") {
              if (!draft.trim()) return;
              event.preventDefault();
              commitDraft();
            }
            if (event.key === "Backspace" && !draft && value.length) removeNumber(value[value.length - 1]);
          }}
        />
      </div>
      <p className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{error ?? "Use E.164 format. Press Enter or comma to add numbers."}</p>
    </div>
  );
}
