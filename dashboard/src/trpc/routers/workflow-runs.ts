import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { TRPCError } from "@trpc/server";

export const workflowRunsRouter = createTRPCRouter({
  listActive: baseProcedure.query(() =>
    prisma.appWorkflowRun.findMany({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    }),
  ),

  listRecentUnseen: baseProcedure.query(() =>
    prisma.appWorkflowRun.findMany({
      where: { status: { in: ["COMPLETED", "FAILED", "CANCELLED"] } },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
  ),

  byId: baseProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const run = await prisma.appWorkflowRun.findUnique({
        where: { id: input.id },
      });
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workflow run not found" });
      }
      return run;
    }),

  events: baseProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const run = await prisma.appWorkflowRun.findUnique({
        where: { id: input.id },
      });
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workflow run not found" });
      }
      return prisma.appWorkflowEvent.findMany({
        where: { appWorkflowId: input.id },
        orderBy: { createdAt: "asc" },
      });
    }),

  markSeen: baseProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      // No-op for now; seen state is tracked in localStorage on the client
      return { ok: true };
    }),
});
