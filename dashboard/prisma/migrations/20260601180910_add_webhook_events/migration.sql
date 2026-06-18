-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "participantSid" TEXT,
    "participantIdentity" TEXT,
    "participantKind" TEXT,
    "trackSid" TEXT,
    "trackType" TEXT,
    "trackSource" TEXT,
    "rawData" JSONB,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_callId_idx" ON "WebhookEvent"("callId");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_callId_occurredAt_idx" ON "WebhookEvent"("callId", "occurredAt");
