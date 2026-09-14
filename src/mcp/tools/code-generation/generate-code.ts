import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  jsonTextResult,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
  type ToolTextResult,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';
import { HttpClientError } from '../../../upstream/http-client.js';

export type GenerateCodeDeps = UpstreamToolDeps;
const policySchema = z
  .object({
    version: z.literal(1),
    executionTimeoutMs: z.number().int().positive().max(2_147_483_647),
    responseGraceMs: z.number().int().nonnegative().max(2_147_483_647),
  })
  .refine((p) => p.executionTimeoutMs + p.responseGraceMs <= 2_147_483_647);
const resultSchema = z
  .object({
    status: z.enum(['completed', 'partial', 'failed', 'skipped', 'needs-configuration']),
  })
  .passthrough();
const errorResult = (payload: unknown): ToolTextResult => ({
  ...jsonTextResult(payload),
  isError: true,
});

export const registerGenerateCodeTool = (server: McpServer, deps: GenerateCodeDeps): void => {
  server.registerTool(
    'generate-code',
    {
      title: 'Generate Code',
      description:
        'Generate and save source files for tableNames using the active project template packs. ' +
        'In NeoSQL Project Settings, configure template packs, required variables, and the project root folder (Location); enable MCP access for the target connection/schema. ' +
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default. ' +
        'Files are saved without an additional NeoSQL confirmation dialog, following template install settings; existing files may be overwritten or marker text replaced. ' +
        'Missing configuration returns needs-configuration without generating files. Complete the settings and request again. ' +
        'Returns actual file paths, skips, and failures, not generated source text. Inspect files in your IDE or Git diff.',
      inputSchema: {
        tableNames: z
          .array(
            z.string().refine((name) => name.trim().length > 0, 'Table name must not be blank'),
          )
          .min(1)
          .describe(
            'Table names to generate; even one table must be an array. Project template packs are used automatically.',
          ),
        ...coordinateInputShape,
      },
    },
    async (args, request) => {
      validateCoordinateInput(args);
      const database = normalizeOptionalNullableString(args.database);
      let policyLoaded = false;
      return callUpstreamTool(
        deps,
        'generate-code',
        { ...args, ...(database === undefined ? {} : { database }) },
        {
          request,
          prepareRpc: async () => {
            const policy = policySchema.parse(
              await deps.postRpc('get-code-generation-policy', {}, { timeoutMs: 1000 }),
            );
            policyLoaded = true;
            return {
              timeoutMs: policy.executionTimeoutMs + policy.responseGraceMs,
              params: { expectedTimeoutMs: policy.executionTimeoutMs },
            };
          },
          mapResult: (result) => {
            if (!resultSchema.safeParse(result).success) {
              return errorResult({
                status: 'outcome-unknown',
                resultsComplete: false,
                message:
                  'NeoSQL returned an invalid code generation result. Files may have changed. Inspect your IDE or Git diff before retrying. The request was not retried.',
              });
            }
            return (result as { status: string }).status === 'failed'
              ? errorResult(result)
              : jsonTextResult(result);
          },
          mapOperationErrorResult: (error) => {
            if (!policyLoaded)
              return errorResult({
                status: 'policy-unavailable',
                message:
                  'Code generation did not start because its execution policy could not be read. Use compatible NeoSQL Desktop and MCP versions, then request again.',
              });
            if (!(error instanceof HttpClientError)) return undefined;
            if (error.kind === 'rpc-error' && error.rpcKind === 'timeout') {
              return errorResult({
                status: 'timed-out',
                resultsComplete: false,
                message:
                  'Code generation timed out. New work was stopped, but files already changed remain and an in-flight write may still finish. Inspect your IDE or Git diff before retrying. The request was not retried.',
              });
            }
            if (
              ['timeout', 'bad-response', 'http-5xx'].includes(error.kind) ||
              (error.kind === 'rpc-error' &&
                ['app-not-ready', 'unavailable', 'handler-error'].includes(error.rpcKind ?? ''))
            ) {
              return errorResult({
                status: 'outcome-unknown',
                resultsComplete: false,
                message:
                  'The code generation response was not received reliably. Work may still be running and files may have changed. Inspect your IDE or Git diff before retrying. The request was not retried.',
              });
            }
            return undefined;
          },
        },
      );
    },
  );
};
