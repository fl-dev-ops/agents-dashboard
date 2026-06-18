-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prompt" TEXT NOT NULL,
    "initialReply" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'openai/gpt-5.1',
    "voiceSpeaker" TEXT NOT NULL,
    "voiceDictId" TEXT,
    "endCallEnabled" BOOLEAN NOT NULL DEFAULT false,
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "knowledgeBaseCollection" TEXT,
    "knowledgeBaseShape" TEXT NOT NULL DEFAULT 'simple',
    "recordingType" TEXT NOT NULL DEFAULT 'off',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Agent" ("agentId", "createdAt", "description", "endCallEnabled", "id", "initialReply", "isActive", "knowledgeBaseCollection", "knowledgeBaseShape", "memoryEnabled", "model", "name", "prompt", "updatedAt", "voiceDictId", "voiceSpeaker") SELECT "agentId", "createdAt", "description", "endCallEnabled", "id", "initialReply", "isActive", "knowledgeBaseCollection", "knowledgeBaseShape", "memoryEnabled", "model", "name", "prompt", "updatedAt", "voiceDictId", "voiceSpeaker" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE UNIQUE INDEX "Agent_agentId_key" ON "Agent"("agentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
