"use client";

import { IconBrowser, IconChartBar, IconPhoneCall } from "@tabler/icons-react";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";

export default function PlaygroundPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Test bench"
        title="Playground"
        description="Choose the test surface that matches the user path you want to validate."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/playground/web" className="group rounded-xl border bg-card p-6 transition-colors hover:border-ring/45 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-accent/55 text-primary">
            <IconBrowser className="size-5" />
          </div>
          <h2 className="mt-5 text-lg font-semibold">Web test</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Dispatch an agent into a LiveKit room for browser or web-client validation. No phone number is required.</p>
          <span className={buttonVariants({ variant: "outline", size: "sm", className: "mt-5" })}>Open web test</span>
        </Link>

        <Link href="/playground/call" className="group rounded-xl border bg-card p-6 transition-colors hover:border-ring/45 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-accent/55 text-primary">
            <IconPhoneCall className="size-5" />
          </div>
          <h2 className="mt-5 text-lg font-semibold">SIP call test</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Place outbound SIP calls through an imported phone number and review call artifacts afterward.</p>
          <span className={buttonVariants({ variant: "outline", size: "sm", className: "mt-5" })}>Open SIP call test</span>
        </Link>

        <Link href="/playground/evaluate" className="group rounded-xl border bg-card p-6 transition-colors hover:border-ring/45 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-accent/55 text-primary">
            <IconChartBar className="size-5" />
          </div>
          <h2 className="mt-5 text-lg font-semibold">Evaluate</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Test evaluation prompts and schemas against call transcripts. Run structured analysis powered by LLM.</p>
          <span className={buttonVariants({ variant: "outline", size: "sm", className: "mt-5" })}>Open evaluation</span>
        </Link>
      </div>
    </div>
  );
}
