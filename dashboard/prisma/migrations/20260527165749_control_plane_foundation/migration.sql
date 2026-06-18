-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentType" TEXT NOT NULL,
    "promptUrl" TEXT NOT NULL,
    "initialReply" TEXT NOT NULL,
    "voiceSpeaker" TEXT NOT NULL,
    "voiceDictId" TEXT,
    "endCallEnabled" BOOLEAN NOT NULL DEFAULT false,
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "knowledgeBaseCollection" TEXT,
    "knowledgeBaseShape" TEXT NOT NULL DEFAULT 'simple',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PhoneNumber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'VOBIZ',
    "e164" TEXT NOT NULL,
    "label" TEXT,
    "country" TEXT,
    "region" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "vobizNumberId" TEXT,
    "vobizPayload" JSONB,
    "personaId" TEXT,
    "livekitInboundTrunkId" TEXT,
    "livekitOutboundTrunkId" TEXT,
    "livekitDispatchRuleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PhoneNumber_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SipTrunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'VOBIZ',
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "vobizTrunkId" TEXT,
    "vobizSipDomain" TEXT,
    "vobizUsername" TEXT,
    "livekitInboundTrunkId" TEXT,
    "livekitOutboundTrunkId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "roomName" TEXT NOT NULL,
    "toNumber" TEXT,
    "fromNumber" TEXT,
    "personaId" TEXT NOT NULL,
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
    CONSTRAINT "Call_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Call_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Persona_agentId_key" ON "Persona"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_e164_key" ON "PhoneNumber"("e164");

-- CreateIndex
CREATE INDEX "PhoneNumber_personaId_idx" ON "PhoneNumber"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_roomName_key" ON "Call"("roomName");

-- CreateIndex
CREATE INDEX "Call_personaId_idx" ON "Call"("personaId");

-- CreateIndex
CREATE INDEX "Call_phoneNumberId_idx" ON "Call"("phoneNumberId");

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");
