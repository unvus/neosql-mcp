import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callUpstreamTool, jsonTextResult, type UpstreamToolDeps } from '../shared.js';

export type ListProjectsDeps = UpstreamToolDeps;

export const registerListProjectsTool = (server: McpServer, deps: ListProjectsDeps): void => {
  const title = 'List Projects';
  server.registerTool(
    'list-projects',
    {
      title,
      annotations: {
        title,
        readOnlyHint: true,
        openWorldHint: false,
      },
      description:
        'List the NeoSQL projects the user can open in NeoSQL Desktop. Works without an open project. ' +
        'Use it when no project is open or configured, when the user asks which projects exist, ' +
        'or before create-project to avoid creating a duplicate. ' +
        'Each project entry includes projectId, name, projectType (local or account), lastAccessedDt, ' +
        'and active (open in NeoSQL Desktop right now). ' +
        'The result also includes activeProjectId, configuredProjectId (the --project-id this server is fixed to, or null), ' +
        'and accountProjects: included, signed_out (not signed in, so only local projects are listed), ' +
        'or unavailable (account projects could not be loaded). ' +
        'Pass the chosen projectId to other NeoSQL tools; NeoSQL Desktop opens that project when needed. ' +
        'When configuredProjectId is set, other tools only accept that project.',
      inputSchema: {},
    },
    async (_args, request) =>
      callUpstreamTool(deps, 'list-projects', {}, {
        request,
        preparation: 'app',
        timeoutMs: 30_000,
        mapResult: (result) =>
          jsonTextResult(
            isRecord(result)
              ? { ...result, configuredProjectId: deps.projectId ?? null }
              : result,
          ),
      }),
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
