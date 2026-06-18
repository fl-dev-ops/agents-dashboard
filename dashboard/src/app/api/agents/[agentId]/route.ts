import { NextResponse, type NextRequest } from "next/server";

import { getCallWebhookUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { agentId } = await params;
  const normalizedAgentId = decodeURIComponent(agentId).trim();

  if (!normalizedAgentId) {
    return NextResponse.json({ error: "Agent ID is required" }, { status: 400 });
  }

  const agent = await prisma.agent.findUnique({
    where: { agentId: normalizedAgentId },
  });

  if (!agent || !agent.isActive) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: agent.agentId,
    agent_type: agent.agentId,
    prompt: agent.prompt,
    initial_reply: agent.initialReply,
    voice_speaker: agent.voiceSpeaker,
    voice_dict_id: agent.voiceDictId,
    end_call_enabled: agent.endCallEnabled,
    kb_collection: agent.knowledgeBaseCollection,
    kb_shape: agent.knowledgeBaseShape,
    memory_enabled: agent.memoryEnabled,
    model: agent.model,
    egress_configs: agent.egressConfigs,
    webhook_url: getCallWebhookUrl() ?? "",
  });
}
