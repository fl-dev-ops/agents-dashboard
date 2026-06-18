"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export interface SearchSelectItem {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchSelectProps {
  value: string;
  onChange: (value: string) => void;
  items: SearchSelectItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  loading?: boolean;
  className?: string;
}

export function SearchSelect({
  value,
  onChange,
  items,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  loading = false,
  className,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sublabel?.toLowerCase().includes(q) ?? false),
    );
  }, [items, search]);

  const selected = items.find((item) => item.value === value);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={loading}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-sm transition-colors hover:bg-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate">
          {selected?.label ?? (loading ? "Loading…" : placeholder)}
        </span>
        <IconChevronDown
          className={cn(
            "size-4 shrink-0 opacity-50 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="border-b px-2 py-1.5">
            <div className="relative">
              <IconSearch className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-full rounded-sm bg-transparent pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  value === item.value && "bg-accent",
                )}
              >
                <div className="min-w-0 flex-1 text-left">
                  <p
                    className={cn(
                      "truncate",
                      value === item.value && "font-medium",
                    )}
                  >
                    {item.label}
                  </p>
                  {item.sublabel && (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.sublabel}
                    </p>
                  )}
                </div>
                {value === item.value && (
                  <IconCheck className="size-3.5 shrink-0 text-primary" />
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {items.length === 0 ? "No options" : "No results"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
