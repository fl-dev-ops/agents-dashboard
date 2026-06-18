PRAGMA foreign_keys=OFF;

DROP INDEX IF EXISTS "PhoneNumber_personaId_idx";
DROP INDEX IF EXISTS "Call_personaId_idx";

ALTER TABLE "Persona" RENAME TO "Agent";
ALTER TABLE "PhoneNumber" RENAME COLUMN "personaId" TO "agentId";
ALTER TABLE "Call" RENAME COLUMN "personaId" TO "agentId";

CREATE TABLE "PhoneNumberConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phoneNumberId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "vobizCredentialId" TEXT,
    "vobizInboundTrunkId" TEXT,
    "vobizOutboundTrunkId" TEXT,
    "vobizInboundDomain" TEXT,
    "vobizOutboundDomain" TEXT,
    "livekitInboundTrunkId" TEXT,
    "livekitOutboundTrunkId" TEXT,
    "livekitDispatchRuleId" TEXT,
    "livekitSipEndpoint" TEXT,
    "rawVobizCredential" JSONB,
    "rawVobizInboundTrunk" JSONB,
    "rawVobizOutboundTrunk" JSONB,
    "rawLiveKitInboundTrunk" JSONB,
    "rawLiveKitOutboundTrunk" JSONB,
    "rawLiveKitDispatchRule" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PhoneNumberConnection_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "PhoneNumberConnection" (
    "id",
    "phoneNumberId",
    "status",
    "livekitInboundTrunkId",
    "livekitOutboundTrunkId",
    "livekitDispatchRuleId",
    "createdAt",
    "updatedAt"
)
SELECT
    'conn_' || lower(hex(randomblob(12))),
    "id",
    CASE
      WHEN "livekitInboundTrunkId" IS NOT NULL OR "livekitOutboundTrunkId" IS NOT NULL OR "livekitDispatchRuleId" IS NOT NULL THEN 'ACTIVE'
      ELSE 'PENDING'
    END,
    "livekitInboundTrunkId",
    "livekitOutboundTrunkId",
    "livekitDispatchRuleId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "PhoneNumber"
WHERE "livekitInboundTrunkId" IS NOT NULL
   OR "livekitOutboundTrunkId" IS NOT NULL
   OR "livekitDispatchRuleId" IS NOT NULL;

ALTER TABLE "PhoneNumber" DROP COLUMN "livekitInboundTrunkId";
ALTER TABLE "PhoneNumber" DROP COLUMN "livekitOutboundTrunkId";
ALTER TABLE "PhoneNumber" DROP COLUMN "livekitDispatchRuleId";

DROP TABLE IF EXISTS "SipTrunk";

CREATE UNIQUE INDEX "PhoneNumberConnection_phoneNumberId_key" ON "PhoneNumberConnection"("phoneNumberId");
CREATE INDEX "PhoneNumber_agentId_idx" ON "PhoneNumber"("agentId");
CREATE INDEX "Call_agentId_idx" ON "Call"("agentId");

PRAGMA foreign_keys=ON;
