-- CreateTable
CREATE TABLE "EvaluationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prompt" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "model" TEXT NOT NULL,
    "usage" JSONB,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "EvaluationConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvaluationRun_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EvaluationRun_callId_idx" ON "EvaluationRun"("callId");

-- CreateIndex
CREATE INDEX "EvaluationRun_configId_idx" ON "EvaluationRun"("configId");
