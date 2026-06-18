"use client";

import { useQuery } from "@tanstack/react-query";

import { SearchSelect } from "@/components/dashboard/search-select";
import type { DashboardAgent } from "@/lib/dashboard-types";
import { useTRPC } from "@/trpc/client";

interface AgentSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function AgentSelect({ value, onChange, disabled, className }: AgentSelectProps) {
  const trpc = useTRPC();
  const agents = useQuery(trpc.agents.list.queryOptions());
  const rows = (agents.data ?? []) as DashboardAgent[];

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={rows.map((a) => ({ value: a.id, label: a.name }))}
      placeholder="Select agent"
      searchPlaceholder="Search agents…"
      loading={agents.isLoading}
      disabled={disabled}
      className={className}
    />
  );
}
