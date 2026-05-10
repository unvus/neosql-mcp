import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jsonTextResult } from '../shared.js';
import type { ContextStore, NeosqlContextPatch } from './store.js';

export const registerSetContextTool = (server: McpServer, store: ContextStore): void => {
  server.registerTool(
    'setContext',
    {
      title: 'setContext',
      description:
        'Set the current working context (project, connection, schema) for subsequent tool calls. ' +
        'Once set, all other tools will use this context automatically until changed. ' +
        'You only need to provide the fields you want to change — unspecified fields keep their current values.',
      inputSchema: {
        projectId: z
          .string()
          .describe(
            "Project ID (e.g., '71ef287779c14fc6b3bb86f88acdb216'). Leave empty to keep current value.",
          )
          .optional(),
        connectionId: z
          .string()
          .describe("Connection ID (e.g., '0', '1'). Leave empty to keep current value.")
          .optional(),
        schema: z
          .string()
          .describe(
            "Schema name (e.g., 'public', 'dbo', 'default'). Leave empty to keep current value.",
          )
          .optional(),
      },
    },
    async (args) => {
      try {
        return jsonTextResult({
          success: true,
          message: 'Context updated successfully',
          context: store.set(toContextPatch(args)),
        });
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: readableErrorMessage(err),
              }),
            },
          ],
        };
      }
    },
  );
};

const toContextPatch = (args: {
  projectId?: string | undefined;
  connectionId?: string | undefined;
  schema?: string | undefined;
}): NeosqlContextPatch => {
  const patch: NeosqlContextPatch = {};
  if (args.projectId !== undefined) patch.projectId = args.projectId;
  if (args.connectionId !== undefined) patch.connectionId = args.connectionId;
  if (args.schema !== undefined) patch.schema = args.schema;
  return patch;
};

const readableErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  return String(err);
};
