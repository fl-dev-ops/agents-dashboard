#!/usr/bin/env bun

const REQUIRED_VARS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
];

const contentSid = "HXe82943acb9578fccb388b2ccbd49f0eb";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

for (const name of REQUIRED_VARS) {
  if (!process.env[name]) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
}

const to = args.to || process.env.TWILIO_WHATSAPP_TO;
if (!to) {
  console.error("Missing recipient. Pass --to=E164 or set TWILIO_WHATSAPP_TO.");
  process.exit(1);
}

const dataArg = args.data;
if (!dataArg) {
  console.error('Missing --data. Example: \'{"1":"Surya","2":"Slot 1","3":"10:30 AM"}\'');
  process.exit(1);
}

let contentVariables;
try {
  contentVariables = JSON.parse(dataArg);
} catch (error) {
  console.error("--data must be valid JSON");
  process.exit(1);
}

if (typeof contentVariables !== "object" || Array.isArray(contentVariables)) {
  console.error("--data must be a JSON object");
  process.exit(1);
}

const from = args.from || process.env.TWILIO_WHATSAPP_FROM;
const mode = args.sms ? "sms" : "whatsapp";

const result = await sendTwilioTemplate({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  from: normalizeFrom(from, mode),
  to: normalizeTo(to, mode),
  contentSid,
  contentVariables,
});

console.log(JSON.stringify(result, null, 2));

function normalizeFrom(value, mode) {
  if (!value) return value;
  if (mode === "sms") return value.replace(/^whatsapp:/i, "");
  if (value.startsWith("whatsapp:")) return value;
  return `whatsapp:${value}`;
}

function normalizeTo(value, mode) {
  if (!value) return value;
  if (mode === "sms") return value.replace(/^whatsapp:/i, "");
  if (value.startsWith("whatsapp:")) return value;
  return `whatsapp:${value}`;
}

async function sendTwilioTemplate({
  accountSid,
  authToken,
  from,
  to,
  contentSid,
  contentVariables,
}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

  const form = new URLSearchParams();
  form.set("From", from);
  form.set("To", to);
  form.set("ContentSid", contentSid);
  form.set("ContentVariables", JSON.stringify(contentVariables));

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.message || response.statusText;
    const code = body?.code || response.status;
    throw new Error(`Twilio send failed (${code}): ${message}`);
  }

  return {
    sid: body.sid,
    status: body.status,
    from: body.from,
    to: body.to,
    contentSid,
    contentVariables,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") {
      result.help = true;
      continue;
    }
    if (arg === "--sms") {
      result.sms = true;
      continue;
    }
    if (arg.startsWith("--to=")) {
      result.to = arg.slice(5);
      continue;
    }
    if (arg.startsWith("--from=")) {
      result.from = arg.slice(7);
      continue;
    }
    if (arg.startsWith("--data=")) {
      result.data = arg.slice(7);
      continue;
    }
    if (arg === "--to" && argv[i + 1]) {
      result.to = argv[++i];
      continue;
    }
    if (arg === "--from" && argv[i + 1]) {
      result.from = argv[++i];
      continue;
    }
    if (arg === "--data" && argv[i + 1]) {
      result.data = argv[++i];
      continue;
    }
  }
  return result;
}

function printUsage() {
  console.log(
`Usage:
  bun run dashboard/scripts/send-slot-message.mjs --to=+91XXXXXXXXXX --data='{"1":"Name","2":"Slot 1","3":"10:30 AM"}'

Env vars:
  TWILIO_ACCOUNT_SID  (required)
  TWILIO_AUTH_TOKEN   (required)
  TWILIO_WHATSAPP_FROM (required unless --from is passed)

Optional:
  TWILIO_WHATSAPP_TO  (fallback recipient)
  --sms               send as SMS instead of WhatsApp
`
  );
}
