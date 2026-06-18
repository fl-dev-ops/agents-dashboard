import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { runEvaluation, formatTranscriptForEvaluation } from "@/lib/evaluate";
import { validateSchemaForStrictMode, coerceToStrictMode, SchemaValidationError } from "@/lib/schema-validation";

const EVALUATION_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4.1",
] as const;

const configInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().min(1).max(200_000),
  schema: z.record(z.string(), z.unknown()),
  model: z.string().min(1).default("gpt-4o-mini"),
});

const configUpdateInput = configInput.partial();

function toPrismaJson(schema: Record<string, unknown>): Prisma.InputJsonValue {
  return schema as unknown as Prisma.InputJsonValue;
}

function validateAndCoerce(schema: Record<string, unknown>): Prisma.InputJsonValue {
  try {
    validateSchemaForStrictMode(schema);
  } catch (err) {
    if (err instanceof SchemaValidationError) throw new Error(`Schema validation failed: ${err.message}`);
    throw err;
  }
  return toPrismaJson(coerceToStrictMode(schema));
}

export const evaluationsRouter = createTRPCRouter({
  // -----------------------------------------------------------------------
  // Config CRUD (flat — no nested sub-router to avoid deep type instantiation)
  // -----------------------------------------------------------------------
  listConfigs: baseProcedure.query(() =>
    prisma.evaluationConfig.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, model: true, createdAt: true, updatedAt: true },
    }),
  ),

  getConfig: baseProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
    prisma.evaluationConfig.findUnique({ where: { id: input.id } }),
  ),

  createConfig: baseProcedure.input(configInput).mutation(({ input }) => {
    const strictSchema = validateAndCoerce(input.schema);
    return prisma.evaluationConfig.create({
      data: { ...input, schema: strictSchema },
    });
  }),

  updateConfig: baseProcedure
    .input(z.object({
      id: z.string(),
      data: z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        prompt: z.string().min(1).max(200_000).optional(),
        schema: z.record(z.string(), z.unknown()).optional(),
        model: z.string().min(1).optional(),
      }),
    }))
    .mutation(({ input }) => {
      const { schema, ...rest } = input.data;
      if (schema) {
        const strictSchema = validateAndCoerce(schema);
        return prisma.evaluationConfig.update({
          where: { id: input.id },
          data: { ...rest, schema: strictSchema },
        });
      }
      return prisma.evaluationConfig.update({
        where: { id: input.id },
        data: rest,
      });
    }),

  deleteConfig: baseProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
    prisma.evaluationConfig.delete({ where: { id: input.id } }),
  ),

  // -----------------------------------------------------------------------
  // Run evaluation
  // -----------------------------------------------------------------------
  run: baseProcedure
    .input(z.object({ configId: z.string(), callId: z.string() }))
    .mutation(async ({ input }) => {
      const [config, call] = await Promise.all([
        prisma.evaluationConfig.findUnique({ where: { id: input.configId } }),
        prisma.call.findUnique({ where: { id: input.callId }, select: { id: true, transcript: true } }),
      ]);

      if (!config) throw new Error("Evaluation config not found.");
      if (!call) throw new Error("Call not found.");
      if (!call.transcript) throw new Error("Call has no transcript.");

      const transcript = formatTranscriptForEvaluation(call.transcript);
      if (!transcript) throw new Error("Transcript is empty — nothing to evaluate.");

      const evalResult = await runEvaluation({
        prompt: config.prompt,
        transcript,
        schema: config.schema as Record<string, unknown>,
        model: config.model,
      });

      return prisma.evaluationRun.create({
        data: {
          configId: config.id,
          callId: call.id,
          result: evalResult.result ? toPrismaJson(evalResult.result) : undefined,
          error: evalResult.error ?? undefined,
          model: config.model,
          usage: evalResult.usage ? toPrismaJson(evalResult.usage) : undefined,
          durationMs: evalResult.durationMs,
        },
      });
    }),

  runAdHoc: baseProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        schema: z.record(z.string(), z.unknown()),
        model: z.string().min(1).default("gpt-4o-mini"),
        callId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const strictSchema = validateAndCoerce(input.schema);

      const call = await prisma.call.findUnique({
        where: { id: input.callId },
        select: { id: true, transcript: true, roomName: true },
      });

      if (!call) throw new Error("Call not found.");
      if (!call.transcript) throw new Error("Call has no transcript.");

      const transcript = formatTranscriptForEvaluation(call.transcript);
      if (!transcript) throw new Error("Transcript is empty — nothing to evaluate.");

      return runEvaluation({
        prompt: input.prompt,
        transcript,
        schema: strictSchema as unknown as Record<string, unknown>,
        model: input.model,
      });
    }),

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------
  listRuns: baseProcedure
    .input(z.object({ configId: z.string().optional(), limit: z.number().min(1).max(100).default(20) }).optional())
    .query(({ input }) =>
      prisma.evaluationRun.findMany({
        where: input?.configId ? { configId: input.configId } : undefined,
        take: input?.limit ?? 20,
        include: { config: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ),

  models: baseProcedure.query(() => EVALUATION_MODELS),
});
