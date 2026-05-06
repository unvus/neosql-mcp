import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type GenerateCodeDeps = UpstreamToolDeps;

export const registerGenerateCodeTool = (server: McpServer, deps: GenerateCodeDeps): void => {
  server.registerTool(
    'generateCode',
    {
      title: 'generateCode',
      description:
        'Generate source code from a database table using a template pack. ' +
        'Uses the current context (project/connection/schema) for database connection. ' +
        'Returns generated file contents based on the specified template.',
      inputSchema: {
        tableName: z.string().describe('Table name to generate code for'),
        templatePackId: z.string().describe('Template pack ID to use for code generation'),
        schema: z
          .string()
          .describe('Database schema name. If omitted, uses current context schema.')
          .optional(),
      },
    },
    async (args) =>
      callUpstreamTool(
        deps,
        'codeGeneration.generateCode',
        {
          tableNames: [args.tableName],
          templatePackId: args.templatePackId,
        },
        { schema: args.schema },
        { timeoutMs: 60_000 },
      ),
  );
};
