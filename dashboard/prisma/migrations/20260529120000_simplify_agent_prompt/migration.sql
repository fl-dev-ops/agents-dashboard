ALTER TABLE "Agent" ADD COLUMN "prompt" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Agent" ADD COLUMN "model" TEXT NOT NULL DEFAULT 'openai/gpt-5.1';

UPDATE "Agent"
SET "prompt" = CASE
  WHEN "initialReply" IS NOT NULL AND length("initialReply") > 0 THEN "initialReply"
  ELSE 'You are a helpful voice agent. Keep the conversation clear, concise, and useful.'
END;

ALTER TABLE "Agent" DROP COLUMN "agentType";
ALTER TABLE "Agent" DROP COLUMN "promptUrl";
