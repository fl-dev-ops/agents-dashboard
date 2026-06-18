import { describe, expect, it } from "bun:test";

import { buildAgentMetadata, buildRoomConfiguration } from "./livekit";

describe("buildAgentMetadata", () => {
  it("uses agent_id and session config keys consumed by the Python worker", () => {
    const metadata = JSON.parse(
      buildAgentMetadata(
        { agentId: "diagnostic-v3" },
        {
          userId: "user_123",
          sessionId: "call_123",
          interactionMode: "auto",
          webhookUrl: "http://localhost:3000/api/calls/webhook",
          webhookSecret: "secret",
          config: { voice: "ishita", dictId: "dict_1", speakingSpeed: 1.1 },
        },
      ),
    );

    expect(metadata).toEqual({
      agent_id: "diagnostic-v3",
      user_id: "user_123",
      session_id: "call_123",
      interaction_mode: "auto",
      webhook_url: "http://localhost:3000/api/calls/webhook",
      webhook_secret: "secret",
      config: {
        voice: "ishita",
        dict_id: "dict_1",
        speaking_speed: 1.1,
      },
    });
  });
});

describe("buildRoomConfiguration", () => {
  it("sets metadata where the LiveKit room exposes it to the worker", () => {
    const metadata = buildAgentMetadata({ agentId: "diagnostic-v3" });
    const roomConfig = buildRoomConfiguration(metadata);

    expect(roomConfig.metadata).toBe(metadata);
  });
});
