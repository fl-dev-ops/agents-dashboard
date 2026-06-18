# Integration Notes

## Agent Metadata Contract

The Python LiveKit agent currently selects a persona from JSON metadata using `agent_id`. The dashboard should standardize dispatch metadata as JSON with these keys:

- `agent_id`: required; maps to `Persona.agentId` and the Python `AgentProfile.id`.
- `user_id`: optional stable user identifier.
- `interaction_mode`: optional `auto` or `ptt`.
- `config.voice`, `config.dict_id`, `config.speaking_speed`: optional runtime voice overrides.
- `webhook_url`: optional recording/session webhook target.

## LiveKit

- Explicit agent dispatch is the preferred path: `AgentDispatchClient.createDispatch(roomName, agentName, { metadata })`.
- Outbound phone calls use `SipClient.createSipParticipant(trunkId, number, roomName, options)` after dispatching the agent into the same room.
- Inbound SIP should use an individual dispatch rule with `roomConfig.agents` so each caller gets a separate room and the agent receives metadata.
- Docs checked: `https://docs.livekit.io/agents/server/agent-dispatch.md`, `https://docs.livekit.io/telephony/making-calls/outbound-calls.md`, `https://docs.livekit.io/reference/telephony/sip-api.md`, `https://docs.livekit.io/telephony/accepting-calls/dispatch-rule.md`.

## Vobiz

- API base: `https://api.vobiz.ai/api/v1`.
- Auth headers: `X-Auth-ID`, `X-Auth-Token`.
- Phone numbers: `GET /Account/{auth_id}/numbers`.
- Trunks: `POST /Account/{auth_id}/trunks`, `PUT /Account/{auth_id}/trunks/{trunk_id}`.
- LiveKit mapping: Vobiz `trunk_domain` becomes LiveKit outbound trunk `address`; Vobiz username/password become LiveKit SIP trunk auth; Vobiz phone number becomes LiveKit trunk `numbers`.
- For inbound, Vobiz `inbound_destination` should be the LiveKit SIP URI without the `sip:` prefix.
- Docs checked: `https://docs.vobiz.ai/integrations/livekit`, `https://docs.vobiz.ai/trunks`, `https://docs.vobiz.ai/account-phone-number`, `https://docs.vobiz.ai/call/overview`.
