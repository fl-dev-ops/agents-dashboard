import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
  LIVEKIT_URL: optionalNonEmptyString,
  LIVEKIT_API_KEY: optionalNonEmptyString,
  LIVEKIT_API_SECRET: optionalNonEmptyString,
  LIVEKIT_SIP_ENDPOINT: optionalNonEmptyString,
  APP_URL: optionalNonEmptyString,
  BETTER_AUTH_URL: optionalNonEmptyString,
  CALL_WEBHOOK_SECRET: optionalNonEmptyString,
  AGENT_NAME: z.string().min(1).default("intervoo-agent"),
  OPENAI_API_KEY: optionalNonEmptyString,
  VOBIZ_AUTH_ID: optionalNonEmptyString,
  VOBIZ_AUTH_TOKEN: optionalNonEmptyString,
  VOBIZ_API_BASE_URL: z.string().url().default("https://api.vobiz.ai/api/v1"),
});

export const env = serverEnvSchema.parse(process.env);

export function getAppUrl() {
  return env.APP_URL?.replace(/\/$/, "") || env.BETTER_AUTH_URL?.replace(/\/$/, "");
}

export function getCallWebhookUrl(headers?: Headers) {
  const configuredUrl = getAppUrl();
  if (configuredUrl) return `${configuredUrl}/api/calls/webhook`;

  const host = headers?.get("x-forwarded-host") || headers?.get("host");
  if (!host) return undefined;
  const protocol = headers?.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}/api/calls/webhook`;
}

export function requireLiveKitEnv() {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new Error(
      "LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required for LiveKit operations.",
    );
  }

  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
  };
}

export function requireLiveKitSipEndpoint() {
  const endpoint = env.LIVEKIT_SIP_ENDPOINT?.trim() || deriveLiveKitSipEndpoint();
  if (!endpoint) {
    throw new Error(
      "LIVEKIT_SIP_ENDPOINT is required for Vobiz inbound routing and could not be derived from LIVEKIT_URL, e.g. projectid.sip.livekit.cloud.",
    );
  }

  return endpoint.replace(/^sip:/, "").replace(/\/$/, "");
}

function deriveLiveKitSipEndpoint() {
  const livekitUrl = env.LIVEKIT_URL?.trim();
  if (!livekitUrl) return undefined;

  const host = livekitUrl
    .replace(/^wss?:\/\//, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!host) return undefined;
  if (host.includes(".sip.livekit.cloud")) return host;
  if (host.endsWith(".livekit.cloud")) {
    return host.replace(/\.livekit\.cloud$/, ".sip.livekit.cloud");
  }

  return undefined;
}

export function requireVobizEnv() {
  const authId = env.VOBIZ_AUTH_ID?.trim();
  const authToken = env.VOBIZ_AUTH_TOKEN?.trim();
  if (!authId) throw new Error(`VOBIZ_AUTH_ID is required but got: "${env.VOBIZ_AUTH_ID}"`);
  if (!authToken) throw new Error(`VOBIZ_AUTH_TOKEN is required but got: "${env.VOBIZ_AUTH_TOKEN}"`);

  return {
    authId,
    authToken,
    apiBaseUrl: env.VOBIZ_API_BASE_URL,
  };
}

export function requireOpenAIEnv() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for evaluation operations.");
  }
  return { apiKey: env.OPENAI_API_KEY };
}
