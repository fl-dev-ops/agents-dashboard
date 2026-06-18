import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  appName: "Intervoo Dashboard",
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
});

export type Session = typeof auth.$Infer.Session;
