import { describe, expect, it } from "bun:test";

import { selectNewestMatchingVobizTrunk, type VobizTrunkResponse } from "./vobiz";

const baseTrunk = {
  account_id: "MA_6MO7N90J",
  name: "Intervoo — +918049280369 (Inbound)",
  trunk_direction: "inbound",
  trunk_status: "active",
  created_at: "2026-05-27T20:00:00Z",
  updated_at: "2026-05-27T20:00:00Z",
} satisfies Omit<VobizTrunkResponse, "trunk_id">;

describe("selectNewestMatchingVobizTrunk", () => {
  it("uses Vobiz trunk_id/trunk_domain response fields and returns the newest matching trunk", () => {
    const trunks: VobizTrunkResponse[] = [
      {
        ...baseTrunk,
        trunk_id: "old-id",
        trunk_domain: "old.sip.vobiz.ai",
        created_at: "2026-05-27T20:00:00Z",
      },
      {
        ...baseTrunk,
        trunk_id: "new-id",
        trunk_domain: "new.sip.vobiz.ai",
        created_at: "2026-05-27T20:10:00Z",
      },
      {
        ...baseTrunk,
        trunk_id: "wrong-direction",
        trunk_direction: "outbound",
        created_at: "2026-05-27T20:20:00Z",
      },
    ];

    const selected = selectNewestMatchingVobizTrunk(trunks, {
      name: "Intervoo — +918049280369 (Inbound)",
      direction: "inbound",
    });

    expect(selected?.trunk_id).toBe("new-id");
    expect(selected?.trunk_domain).toBe("new.sip.vobiz.ai");
  });
});
