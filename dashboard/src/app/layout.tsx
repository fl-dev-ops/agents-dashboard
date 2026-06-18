import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { WorkflowToastProvider } from "@/components/dashboard/workflow-toast-provider";
import { TRPCReactProvider } from "@/trpc/client";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Intervoo Dashboard",
  description: "Control plane for Intervoo agents, phone numbers, and calls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
      )}
    >
      <body className="min-h-full flex flex-col">
        <TRPCReactProvider>
          <TooltipProvider>
            {children}
            <Toaster />
            <WorkflowToastProvider />
          </TooltipProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
