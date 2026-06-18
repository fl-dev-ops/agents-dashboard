import { z } from "zod";

import { MAX_EGRESS_COUNT } from "@/lib/dashboard-types";
import { prisma } from "@/lib/prisma";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";

const egressConfigSchema = z
  .object({
    type: z.enum(["audio", "video", "frames"]),
    frameIntervalSec: z.number().int().min(1).max(60).optional(),
  })
  .refine(
    (config) => config.type !== "frames" || (config.frameIntervalSec != null && config.frameIntervalSec > 0),
    { message: "frameIntervalSec is required when type is 'frames'" },
  );

const egressConfigsSchema = z
  .array(egressConfigSchema)
  .max(MAX_EGRESS_COUNT, `Maximum ${MAX_EGRESS_COUNT} egress configs allowed`)
  .refine(
    (configs) => {
      const types = configs.map((c) => c.type);
      return new Set(types).size === types.length;
    },
    { message: "Duplicate egress types are not allowed" },
  )
  .default([]);

const agentInput = z.object({
  agentId: z.string().min(1).regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  name: z.string().min(1),
  description: z.string().optional(),
  // Prompts cap at ~50K tokens. Anything larger is almost certainly a paste
  // accident and would blow past any current LLM context window.
  prompt: z.string().min(1).max(200_000),
  initialReply: z.string().min(1),
  model: z.string().min(1).default("openai/gpt-5.1"),
  voiceSpeaker: z.string().min(1),
  voiceDictId: z.string().optional(),
  endCallEnabled: z.boolean().default(false),
  memoryEnabled: z.boolean().default(false),
  knowledgeBaseCollection: z.string().optional(),
  knowledgeBaseShape: z.string().default("simple"),
  egressConfigs: egressConfigsSchema,
  isActive: z.boolean().default(true),
});

const agentUpdateInput = agentInput
  .omit({
    endCallEnabled: true,
    memoryEnabled: true,
    knowledgeBaseShape: true,
    isActive: true,
  })
  .partial()
  .extend({
    endCallEnabled: z.boolean().optional(),
    memoryEnabled: z.boolean().optional(),
    knowledgeBaseShape: z.string().optional(),
    isActive: z.boolean().optional(),
    egressConfigs: egressConfigsSchema.optional(),
  });


export const agentsRouter = createTRPCRouter({
  list: baseProcedure.query(async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [agents, usage] = await Promise.all([
      prisma.agent.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.call.groupBy({
        by: ["agentId"],
        where: { createdAt: { gte: since }, agentId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const usageByAgentId = new Map(usage.map((row) => [row.agentId, row._count._all]));
    return agents.map((agent) => ({
      ...agent,
      usageCount7d: usageByAgentId.get(agent.id) ?? 0,
    }));
  }),
  byId: baseProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
    prisma.agent.findUnique({
      where: { id: input.id },
      include: {
        phoneNumbers: {
          include: { connection: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    }),
  ),
  create: baseProcedure.input(agentInput).mutation(({ input }) =>
    prisma.agent.create({
      data: {
        ...input,
        description: input.description || null,
        voiceDictId: input.voiceDictId || null,
        knowledgeBaseCollection: input.knowledgeBaseCollection || null,
      },
    }),
  ),
  update: baseProcedure
    .input(z.object({ id: z.string(), data: agentUpdateInput }))
    .mutation(({ input }) =>
      prisma.agent.update({
        where: { id: input.id },
        data: {
          ...input.data,
          description:
            input.data.description === undefined
              ? undefined
              : input.data.description || null,
          voiceDictId:
            input.data.voiceDictId === undefined
              ? undefined
              : input.data.voiceDictId || null,
          knowledgeBaseCollection:
            input.data.knowledgeBaseCollection === undefined
              ? undefined
              : input.data.knowledgeBaseCollection || null,
        },
      }),
    ),
  delete: baseProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.agent.delete({ where: { id: input.id } })),
});
