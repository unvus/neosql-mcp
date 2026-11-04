import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HttpClientError } from '../../../upstream/http-client.js';
import {
  callUpstreamTool,
  jsonToolErrorResult,
  type ToolTextResult,
  type UpstreamToolDeps,
} from '../shared.js';

export type CreateProjectDeps = UpstreamToolDeps;

/** App outcomes where nothing was created; the app message says whether a retry makes sense. */
const NOT_CREATED_KINDS = new Set(['invalid-params', 'unavailable', 'forbidden']);

const notBlank = (value: string) => value.trim() !== '';

export const registerCreateProjectTool = (server: McpServer, deps: CreateProjectDeps): void => {
  const title = 'Create Project';
  server.registerTool(
    'create-project',
    {
      title,
      annotations: {
        title,
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      description:
        'Create a new LOCAL NeoSQL project for starting a new database design, such as the initial ERD for a new application. ' +
        'The project gets one designOnly connection for the chosen DBMS (no database connection info), set as the project MCP Default. ' +
        'The user must approve a confirmation dialog in NeoSQL Desktop; NeoSQL then leaves the open project and opens the new one. ' +
        'It fails without creating anything if the open project has unsaved changes. ' +
        'Pass the returned projectId to later tools such as erd-create-tables; connectionId, database, and schema can be omitted because the new connection is the Default. ' +
        'Ask the user for the project name if it is unclear, and call list-projects first to avoid duplicates. ' +
        'Never retry automatically: if the user declined, do not retry unless the user asks again; ' +
        'if the call timed out, call list-projects to check whether the project was created before trying again. ' +
        'Not available when this server is configured with --project-id.',
      inputSchema: {
        name: z
          .string()
          .refine(notBlank, 'name must not be blank.')
          .describe('Name of the new project, as shown in NeoSQL Desktop.'),
        dataSource: z
          .string()
          .refine(notBlank, 'dataSource must not be blank.')
          .describe(
            'DBMS for the design, as named in NeoSQL (case-insensitive), e.g. PostgreSQL, MySQL, MariaDB, Oracle, SQLServer, SQLite. ' +
              'An unsupported value returns the list NeoSQL Desktop supports.',
          ),
      },
    },
    async (args, request) => {
      if (deps.projectId !== undefined) return configuredProjectConflict(deps.projectId);
      return callUpstreamTool(
        deps,
        'create-project',
        { name: args.name.trim(), dataSource: args.dataSource.trim() },
        {
          request,
          preparation: 'app',
          cancelOperation: true,
          timeoutMs: 90_000,
          mapOperationErrorResult: mapCreateProjectError,
        },
      );
    },
  );
};

const configuredProjectConflict = (configuredProjectId: string): ToolTextResult =>
  jsonToolErrorResult({
    status: 'project_conflict',
    message:
      `This NeoSQL MCP server is configured for project '${configuredProjectId}' (--project-id), ` +
      'so its tools could not use a newly created project. No project was created.',
    nextAction:
      'Use the configured project, or remove --project-id from the MCP client configuration to create and use new projects.',
    requestSent: false,
  });

const mapCreateProjectError = (err: unknown): ToolTextResult | undefined => {
  if (!(err instanceof HttpClientError)) return undefined;
  if (err.kind === 'timeout' || (err.kind === 'rpc-error' && err.rpcKind === 'timeout')) {
    return jsonToolErrorResult({
      status: 'outcome_unknown',
      message:
        'NeoSQL Desktop did not answer before the timeout. The project may or may not have been created. The request was not retried.',
      nextAction: 'Call list-projects to check whether the project exists before trying again.',
    });
  }
  if (err.kind !== 'rpc-error') return undefined;
  if (err.rpcKind !== undefined && NOT_CREATED_KINDS.has(err.rpcKind)) {
    return jsonToolErrorResult({ status: 'not_created', reason: err.rpcKind, message: err.message });
  }
  if (err.rpcKind === 'handler-error') {
    return jsonToolErrorResult({
      status: 'failed',
      message: err.message,
      nextAction: 'Call list-projects to check whether the project exists before trying again.',
    });
  }
  return undefined;
};
