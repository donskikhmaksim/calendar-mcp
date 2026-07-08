import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { User } from "./config.js";
import { buildUserClients, registerAccountTools } from "./accounts.js";
import { registerCalendarTools } from "./tools/calendar.js";

export function buildMcpServer(user: User): McpServer {
  const clients = buildUserClients(user);
  const accountsHint = clients.multi
    ? `Multiple Google accounts available: ${clients.names.join(", ")} (default: ${clients.defaultName}). Pass \`account\` to select.`
    : `One Google account ("${clients.defaultName}") is configured.`;

  const server = new McpServer(
    { name: "calendar-mcp", version: "1.0.0" },
    { instructions: "Tools to manage Google Calendar: list events, create/update/delete events, respond to invites, check free/busy. " + accountsHint },
  );
  registerAccountTools(server, clients);
  registerCalendarTools(server, clients);
  return server;
}
