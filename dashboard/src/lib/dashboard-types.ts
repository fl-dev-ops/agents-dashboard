/** Strip agent-id to lowercase letters, digits, and hyphens only. */
export function sanitizeAgentId(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export type AgentForm = {
  agentId: string;
  name: string;
  description: string;
  prompt: string;
  initialReply: string;
  model: string;
  voiceSpeaker: string;
  voiceDictId: string;
  endCallEnabled: boolean;
  memoryEnabled: boolean;
  knowledgeBaseCollection: string;
  knowledgeBaseShape: string;
  recordingType: string;
};

export type NumberForm = {
  e164: string;
  label: string;
  country: string;
  region: string;
  agentId: string;
};

export type PlaygroundForm = {
  agentId: string;
  phoneNumberId: string;
  toNumbers: string[];
  userId: string;
  dial: boolean;
};

export type DashboardAgent = {
  id: string;
  agentId: string;
  name: string;
  model: string;
  voiceSpeaker: string;
  isActive: boolean;
  updatedAt: Date | string;
  usageCount7d?: number;
};

export type DashboardPhoneNumber = {
  id: string;
  e164: string;
  label: string | null;
  status: string;
  country: string | null;
  region: string | null;
  agentId: string | null;
  agent?: { id: string; name: string } | null;
  connection?: {
    status: string;
    lastError: string | null;
    livekitInboundTrunkId: string | null;
    livekitOutboundTrunkId: string | null;
    livekitDispatchRuleId: string | null;
    vobizInboundTrunkId: string | null;
    vobizOutboundTrunkId: string | null;
  } | null;
};

export type DashboardCall = {
  id: string;
  roomName: string;
  status: string;
  toNumber: string | null;
  fromNumber?: string | null;
  durationMs?: number | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  transcriptUrl?: string | null;
  verboseUrl?: string | null;
  transcript?: unknown;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  createdAt: Date | string;
  agent?: { id: string; name: string } | null;
  type?: string;
  phoneNumberId?: string | null;
  livekitSipParticipantId?: string | null;
  livekitSipCallId?: string | null;
  phoneNumber?: { id: string; e164: string; label: string | null } | null;
};

export const emptyAgentForm: AgentForm = {
  agentId: "",
  name: "",
  description: "",
  prompt: "You are a helpful voice agent. Keep the conversation clear, concise, and useful.",
  initialReply: "Greet the caller and ask what they want to practice today.",
  model: "openai/gpt-5.1",
  voiceSpeaker: "ishita",
  voiceDictId: "",
  endCallEnabled: false,
  memoryEnabled: false,
  knowledgeBaseCollection: "",
  knowledgeBaseShape: "simple",
  recordingType: "off",
};

export const emptyNumberForm: NumberForm = {
  e164: "",
  label: "",
  country: "IN",
  region: "",
  agentId: "",
};

export const emptyPlaygroundForm: PlaygroundForm = {
  agentId: "",
  phoneNumberId: "",
  toNumbers: [],
  userId: "",
  dial: false,
};
