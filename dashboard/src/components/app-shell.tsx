"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  IconActivityHeartbeat,
  IconBrowser,
  IconChartBar,
  IconLayoutDashboard,
  IconMoon,
  IconPhone,
  IconPhoneCall,
  IconRobot,
  IconSun,
} from "@tabler/icons-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: IconLayoutDashboard },
      { href: "/agents", label: "Agents", icon: IconRobot },
      { href: "/phone-numbers", label: "Phone Numbers", icon: IconPhone },
      { href: "/evaluations", label: "Evaluations", icon: IconChartBar },
    ],
  },
  {
    label: "Playground",
    items: [
      { href: "/playground/web", label: "Web", icon: IconBrowser },
      { href: "/playground/call", label: "Call", icon: IconPhoneCall },
    ],
  },
  {
    label: "Review",
    items: [{ href: "/calls", label: "Calls", icon: IconActivityHeartbeat }],
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const activeItem = navGroups
    .flatMap((g) => g.items)
    .find((n) => isActivePath(pathname, n.href));
  const activeLabel = activeItem?.label ?? "Intervoo";

  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="icon">
        <DashboardSidebar pathname={pathname} />
        {/*<SidebarRail />*/}
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/76 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <div className="h-5 w-px bg-border" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {activeLabel}
              </p>
            </div>
          </div>
          <div className="hidden text-xs text-muted-foreground sm:block">
            Voice agent control plane
          </div>
        </header>
        <main className="mx-auto w-full max-w-295 px-4 py-7 sm:px-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-xs" className="group-data-[collapsible=icon]:hidden" disabled>
        <IconSun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="group-data-[collapsible=icon]:hidden"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
    </Button>
  );
}

function DashboardSidebar({ pathname }: { pathname: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent text-[11px] font-semibold tracking-tight text-sidebar-accent-foreground">
            IV
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block text-sm font-semibold tracking-tight">
              Intervoo
            </span>
            <span className="block text-[11px] text-sidebar-foreground/65">
              Voice operations
            </span>
          </div>
        </div>
      </SidebarHeader>


      <SidebarContent className="min-h-0 flex-1">
        {navGroups.map((group, gi) => (
          <SidebarGroup key={group.label} className={cn(gi > 0 && "pt-0")}>
            <SidebarGroupLabel className="h-7 text-[11px] font-medium uppercase tracking-[0.08em] text-sidebar-foreground/50">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={item.label}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sidebar-foreground/80">
          <Avatar className="size-7">
            <AvatarFallback className="bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
              IU
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-[13px] font-medium">Intervoo User</p>
            <p className="truncate text-[11px] text-sidebar-foreground/55">
              Operator access
            </p>
          </div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </div>
  );
}

export function useInvalidateDashboard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.agents.list.queryFilter()),
      queryClient.invalidateQueries(trpc.phoneNumbers.list.queryFilter()),
      queryClient.invalidateQueries(trpc.calls.list.queryFilter()),
    ]);
  };
}
