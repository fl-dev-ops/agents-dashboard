PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Call" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "roomName" TEXT NOT NULL,
    "toNumber" TEXT,
    "fromNumber" TEXT,
    "agentId" TEXT,
    "phoneNumberId" TEXT,
    "livekitDispatchId" TEXT,
    "livekitSipParticipantId" TEXT,
    "livekitSipCallId" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Call_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Call_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Call" (
    "id",
    "type",
    "status",
    "roomName",
    "toNumber",
    "fromNumber",
    "agentId",
    "phoneNumberId",
    "livekitDispatchId",
    "livekitSipParticipantId",
    "livekitSipCallId",
    "errorMessage",
    "metadata",
    "startedAt",
    "endedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "type",
    "status",
    "roomName",
    "toNumber",
    "fromNumber",
    "agentId",
    "phoneNumberId",
    "livekitDispatchId",
    "livekitSipParticipantId",
    "livekitSipCallId",
    "errorMessage",
    "metadata",
    "startedAt",
    "endedAt",
    "createdAt",
    "updatedAt"
FROM "Call";

DROP TABLE "Call";
ALTER TABLE "new_Call" RENAME TO "Call";

CREATE UNIQUE INDEX "Call_roomName_key" ON "Call"("roomName");
CREATE INDEX "Call_agentId_idx" ON "Call"("agentId");
CREATE INDEX "Call_phoneNumberId_idx" ON "Call"("phoneNumberId");
CREATE INDEX "Call_status_idx" ON "Call"("status");

PRAGMA foreign_keys=ON;
