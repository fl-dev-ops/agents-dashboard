"use client";

import { useQuery } from "@tanstack/react-query";

import { SearchSelect } from "@/components/dashboard/search-select";
import type { DashboardPhoneNumber } from "@/lib/dashboard-types";
import { useTRPC } from "@/trpc/client";

interface PhoneNumberSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function PhoneNumberSelect({ value, onChange, className }: PhoneNumberSelectProps) {
  const trpc = useTRPC();
  const phoneNumbers = useQuery(trpc.phoneNumbers.list.queryOptions());
  const rows = (phoneNumbers.data ?? []) as DashboardPhoneNumber[];

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={rows.map((n) => ({ value: n.id, label: n.e164, sublabel: n.label || undefined }))}
      placeholder="Select phone number"
      searchPlaceholder="Search numbers…"
      loading={phoneNumbers.isLoading}
      className={className}
    />
  );
}
