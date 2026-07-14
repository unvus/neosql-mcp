import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

const COORDINATE_CONTRACT_MESSAGE =
  'connectionId, database, and schema must be provided together or all omitted.';

export const coordinateInputShape = {
  connectionId: z
    .string()
    .refine((value) => value.trim() !== '', 'connectionId must not be blank.')
    .describe(
      'NeoSQL connection ID from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
    )
    .optional(),
  database: z
    .string()
    .nullable()
    .describe(
      'MCP-enabled database name from list-connections. Use null for DBMSs without a database hierarchy. Provide it with connectionId and schema, or omit all three to use the active project Default.',
    )
    .optional(),
  schema: z
    .string()
    .refine((value) => value.trim() !== '', 'schema must not be blank.')
    .describe(
      'MCP-enabled schema name from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
    )
    .optional(),
};

export interface CoordinateInput {
  connectionId?: string | undefined;
  database?: string | null | undefined;
  schema?: string | undefined;
}

export const validateCoordinateInput = (input: CoordinateInput): void => {
  const explicitCount = Number(input.connectionId !== undefined)
    + Number(Object.prototype.hasOwnProperty.call(input, 'database'))
    + Number(input.schema !== undefined);

  if (explicitCount === 0 || explicitCount === 3) return;
  throw new McpError(ErrorCode.InvalidParams, COORDINATE_CONTRACT_MESSAGE);
};
