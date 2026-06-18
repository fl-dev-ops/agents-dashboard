import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  label?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function PageHeader({
  label,
  title,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("border-b pb-6", className)}>
      {children}
      <div className={cn("flex flex-col gap-4", children && "mt-5", actions && "sm:flex-row sm:items-end sm:justify-between")}>
        <div className="max-w-2xl">
          {label ? <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p> : null}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
