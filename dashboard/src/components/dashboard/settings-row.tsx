import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SettingsRowProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SettingsRow({ title, description, children, className }: SettingsRowProps) {
  return (
    <div
      className={cn(
        "grid gap-3 border-b py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(180px,260px)] sm:items-center",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex min-w-0 items-center justify-start sm:justify-end">{children}</div>
    </div>
  );
}
