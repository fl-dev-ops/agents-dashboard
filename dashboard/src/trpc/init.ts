import { initTRPC } from "@trpc/server";

export type TRPCContext = {
  headers: Headers;
};

export const createTRPCContext = async (opts: { headers: Headers }): Promise<TRPCContext> => {
  return {
    headers: opts.headers,
  };
};

const t = initTRPC.context<TRPCContext>().create();

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
