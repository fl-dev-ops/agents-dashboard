import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { agentsRouter } from "@/trpc/routers/agents";
import { callsRouter } from "@/trpc/routers/calls";
import { evaluationsRouter } from "@/trpc/routers/evaluations";
import { phoneNumbersRouter } from "@/trpc/routers/phone-numbers";

export const appRouter = createTRPCRouter({
  health: baseProcedure.query(() => {
    return { status: "ok" as const };
  }),
  agents: agentsRouter,
  phoneNumbers: phoneNumbersRouter,
  calls: callsRouter,
  evaluations: evaluationsRouter,
});

export type AppRouter = typeof appRouter;
