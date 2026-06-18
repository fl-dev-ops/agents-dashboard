import { requireVobizEnv } from "@/lib/env";

type VobizRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

async function vobizRequest<T>(path: string, opts: VobizRequestOptions = {}) {
  const vobiz = requireVobizEnv();
  const url = new URL(`${vobiz.apiBaseUrl}${path}`);

  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-ID": vobiz.authId,
      "X-Auth-Token": vobiz.authToken,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Vobiz request failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export type VobizCredential = {
  id: string;
  name?: string;
  account_id?: string;
  username: string;
  /** Actual password — only returned once on creation */
  password?: string;
  realm?: string;
  enabled?: boolean;
  created_at: string;
  updated_at: string;
};

export async function createVobizCredential(input: { name: string }) {
  const { authId, authToken, apiBaseUrl } = requireVobizEnv();
  // Use direct fetch — vobizRequest POST has issues in Next.js context
  const url = `${apiBaseUrl}/Account/${authId}/credentials`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-ID": authId,
      "X-Auth-Token": authToken,
    },
    body: JSON.stringify({ name: input.name }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vobiz credential creation failed (${response.status}): ${text}`);
  }
  const data = JSON.parse(text) as VobizCredential;
  return data;
}

export async function listVobizCredentials() {
  const { authId } = requireVobizEnv();
  return vobizRequest<{
    meta: { limit: number; offset: number; total: number };
    objects: VobizCredential[];
  }>(
    `/Account/${authId}/trunks/credentials`,
  );
}

export async function deleteVobizCredential(credentialId: string) {
  const { authId } = requireVobizEnv();
  return vobizRequest<null>(`/Account/${authId}/credentials/${credentialId}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Phone Numbers
// ---------------------------------------------------------------------------

export type VobizPhoneNumber = {
  id: string;
  e164: string;
  country?: string;
  region?: string;
  status?: string;
};

export async function listVobizPhoneNumbers(input?: {
  page?: number;
  perPage?: number;
}) {
  const { authId } = requireVobizEnv();
  return vobizRequest<{
    items: VobizPhoneNumber[];
    page: number;
    per_page: number;
    total: number;
  }>(`/Account/${authId}/numbers`, {
    query: {
      page: input?.page,
      per_page: input?.perPage,
    },
  });
}

// ---------------------------------------------------------------------------
// Trunks
// ---------------------------------------------------------------------------

export type VobizTrunkResponse = {
  trunk_id: string;
  account_id: string;
  name: string;
  trunk_direction: "inbound" | "outbound" | "both";
  trunk_domain?: string;
  trunk_status?: string;
  enabled?: boolean;
  secure?: boolean;
  concurrent_calls_limit?: number;
  cps_limit?: number;
  transport?: string;
  inbound_destination?: string;
  credentials_id?: string;
  created_at: string;
  updated_at: string;
};

type VobizTrunkListResponse = {
  meta?: { limit?: number; offset?: number; total?: number };
  objects?: VobizTrunkResponse[];
  results?: VobizTrunkResponse[];
  items?: VobizTrunkResponse[];
};

function getVobizTrunkItems(page: VobizTrunkListResponse) {
  return page.objects ?? page.results ?? page.items ?? [];
}

export async function listVobizTrunks() {
  const { authId } = requireVobizEnv();
  return vobizRequest<VobizTrunkListResponse>(
    `/Account/${authId}/trunks`,
  );
}

export async function findVobizTrunk(input: {
  name: string;
  direction: "inbound" | "outbound" | "both";
}) {
  const firstPage = await listVobizTrunks();

  const firstPageItems = getVobizTrunkItems(firstPage);
  const meta = firstPage.meta;
  const limit = meta?.limit ?? 100;
  const total = meta?.total ?? firstPageItems.length;

  const trunks = [...firstPageItems];

  for (let offset = limit; offset < total; offset += limit) {
    const { authId } = requireVobizEnv();
    const page = await vobizRequest<VobizTrunkListResponse>(
      `/Account/${authId}/trunks`,
      { query: { limit, offset } },
    );
    const pageItems = getVobizTrunkItems(page);
    trunks.push(...pageItems);
  }

  return selectNewestMatchingVobizTrunk(trunks, input);
}

export function selectNewestMatchingVobizTrunk(
  trunks: VobizTrunkResponse[],
  input: { name: string; direction: "inbound" | "outbound" | "both" },
) {
  return trunks
    .filter((trunk) => trunk.name === input.name && trunk.trunk_direction === input.direction)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export async function getVobizTrunk(trunkId: string) {
  const { authId } = requireVobizEnv();
  // Vobiz returns the trunk object directly (no { data: ... } wrapper for single objects)
  return vobizRequest<VobizTrunkResponse>(
    `/Account/${authId}/trunks/${trunkId}`,
  );
}

/**
 * Create a new Vobiz SIP trunk.
 *
 * @param input.name             - Human-readable name for the trunk
 * @param input.credentialsId    - Vobiz Credential ID to link (from createVobizCredential)
 * @param input.trunkDirection    - "inbound" | "outbound" | "both" (default "both")
 * @param input.inboundDestination - LiveKit SIP URI to route inbound calls to (no sip: prefix)
 */
export async function createVobizTrunk(input: {
  name: string;
  credentialsId: string;
  trunkDirection?: "inbound" | "outbound" | "both";
  inboundDestination?: string;
}) {
  const { authId, authToken, apiBaseUrl } = requireVobizEnv();
  const url = `${apiBaseUrl}/Account/${authId}/trunks`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-ID": authId,
      "X-Auth-Token": authToken,
    },
    body: JSON.stringify({
      name: input.name,
      credentials_id: input.credentialsId,
      trunk_direction: input.trunkDirection ?? "both",
      ...(input.inboundDestination
        ? { inbound_destination: input.inboundDestination }
        : {}),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vobiz trunk creation failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as VobizTrunkResponse;
}

/**
 * Update a Vobiz SIP trunk's inbound destination.
 * Used after LiveKit inbound trunk is ready to route calls to LiveKit.
 */
export async function updateVobizTrunk(
  trunkId: string,
  input: {
    name?: string;
    enabled?: boolean;
    inboundDestination?: string;
  },
) {
  const { authId, authToken, apiBaseUrl } = requireVobizEnv();
  const url = `${apiBaseUrl}/Account/${authId}/trunks/${trunkId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-ID": authId,
      "X-Auth-Token": authToken,
    },
    body: JSON.stringify({
      ...(input.name ? { name: input.name } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.inboundDestination !== undefined
        ? { inbound_destination: input.inboundDestination }
        : {}),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vobiz trunk update failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as VobizTrunkResponse;
}

/** Set the inbound destination on an existing Vobiz trunk. */
export async function setVobizTrunkInboundDestination(
  trunkId: string,
  inboundDestination: string,
) {
  const { authId, authToken, apiBaseUrl } = requireVobizEnv();
  const url = `${apiBaseUrl}/Account/${authId}/trunks/${trunkId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-ID": authId,
      "X-Auth-Token": authToken,
    },
    body: JSON.stringify({ inbound_destination: inboundDestination }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vobiz inbound destination update failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as VobizTrunkResponse;
}
