import { PhoneNumberStatus } from "@/generated/prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { listVobizPhoneNumbers } from "@/lib/vobiz";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { TRPCError } from "@trpc/server";

const e164Schema = z.string().regex(/^\+\d{8,15}$/, "Use E.164 format, e.g. +918071387149");

export const phoneNumbersRouter = createTRPCRouter({
  list: baseProcedure.query(() =>
    prisma.phoneNumber.findMany({
      include: { agent: true, connection: true },
      orderBy: { updatedAt: "desc" },
    }),
  ),
  create: baseProcedure
    .input(
      z.object({
        e164: e164Schema,
        label: z.string().optional(),
        country: z.string().optional(),
        region: z.string().optional(),
        agentId: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      prisma.phoneNumber.create({
        data: {
          ...input,
          label: input.label || null,
          country: input.country || null,
          region: input.region || null,
          agentId: input.agentId || null,
        },
      }),
    ),
  update: baseProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          label: z.string().optional(),
          status: z.enum(PhoneNumberStatus).optional(),
          agentId: z.string().nullable().optional(),
        }),
      }),
    )
    .mutation(({ input }) =>
      prisma.phoneNumber.update({ where: { id: input.id }, data: input.data }),
    ),
  availableFromVobiz: baseProcedure.query(async () => {
    const [vobiz, imported] = await Promise.all([
      listVobizPhoneNumbers({ page: 1, perPage: 100 }),
      prisma.phoneNumber.findMany({
        select: { id: true, e164: true, label: true, vobizNumberId: true },
      }),
    ]);
    const importedByE164 = new Map(imported.map((number) => [number.e164, number]));
    const importedByVobizId = new Map(
      imported
        .filter((number) => number.vobizNumberId)
        .map((number) => [number.vobizNumberId as string, number]),
    );

    return {
      total: vobiz.total,
      items: vobiz.items.map((number) => {
        const importedNumber = importedByVobizId.get(number.id) ?? importedByE164.get(number.e164) ?? null;
        return {
          ...number,
          imported: Boolean(importedNumber),
          importedId: importedNumber?.id ?? null,
          importedLabel: importedNumber?.label ?? null,
        };
      }),
    };
  }),

  importFromVobiz: baseProcedure
    .input(
      z.object({
        vobizNumberId: z.string(),
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await listVobizPhoneNumbers({ page: 1, perPage: 100 });
      const number = result.items.find((item) => item.id === input.vobizNumberId);
      if (!number) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vobiz number not found.",
        });
      }

      return prisma.phoneNumber.upsert({
        where: { e164: number.e164 },
        update: {
          label: input.label || null,
          country: number.country ?? null,
          region: number.region ?? null,
          status:
            number.status?.toLowerCase() === "active"
              ? PhoneNumberStatus.ACTIVE
              : PhoneNumberStatus.INACTIVE,
          vobizNumberId: number.id,
          vobizPayload: number,
        },
        create: {
          e164: number.e164,
          label: input.label || null,
          country: number.country ?? null,
          region: number.region ?? null,
          status:
            number.status?.toLowerCase() === "active"
              ? PhoneNumberStatus.ACTIVE
              : PhoneNumberStatus.INACTIVE,
          vobizNumberId: number.id,
          vobizPayload: number,
        },
      });
    }),

  syncFromVobiz: baseProcedure.mutation(async () => {
    const result = await listVobizPhoneNumbers({ page: 1, perPage: 100 });

    for (const number of result.items) {
      await prisma.phoneNumber.upsert({
        where: { e164: number.e164 },
        update: {
          country: number.country ?? null,
          region: number.region ?? null,
          status:
            number.status?.toLowerCase() === "active"
              ? PhoneNumberStatus.ACTIVE
              : PhoneNumberStatus.INACTIVE,
          vobizNumberId: number.id,
          vobizPayload: number,
        },
        create: {
          e164: number.e164,
          country: number.country ?? null,
          region: number.region ?? null,
          status:
            number.status?.toLowerCase() === "active"
              ? PhoneNumberStatus.ACTIVE
              : PhoneNumberStatus.INACTIVE,
          vobizNumberId: number.id,
          vobizPayload: number,
        },
      });
    }

    return { synced: result.items.length, total: result.total };
  }),

  assign: baseProcedure
    .input(
      z.object({
        phoneNumberId: z.string(),
        agentId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const phoneNumber = await prisma.phoneNumber.findUnique({
        where: { id: input.phoneNumberId },
      });
      if (!phoneNumber) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Phone number not found" });
      }
      if (!phoneNumber.vobizNumberId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Phone number is not synced from Vobiz — sync first",
        });
      }

      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
      });
      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      }

      const { connectPhoneNumberToAgent } = await import("@/lib/livekit");
      return connectPhoneNumberToAgent({
        vobizNumber: { id: phoneNumber.id, e164: phoneNumber.e164 },
        agent: { id: agent.id, agentId: agent.agentId },
      });
    }),
});
