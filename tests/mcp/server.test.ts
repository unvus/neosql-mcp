import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/mcp/server.js';
import { mcpSessionId } from '../../src/mcp/session.js';

describe('createServer', () => {
  let client: Client | undefined;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = undefined;
    }
  });

  const connectClientToServer = async () => {
    const server = createServer();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    return { server };
  };

  it('exposes the ping tool in tools/list', async () => {
    await connectClientToServer();
    const result = await client!.listTools();
    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain('ping');
  });

  it('returns "pong" when the ping tool is called', async () => {
    await connectClientToServer();
    const result = await client!.callTool({ name: 'ping', arguments: {} });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    expect(content[0]?.text).toBe('pong');
  });

  it('returns the process-scoped mcpSessionId when get-mcp-session-id is called', async () => {
    await connectClientToServer();
    const first = await client!.callTool({ name: 'get-mcp-session-id', arguments: {} });
    const second = await client!.callTool({ name: 'get-mcp-session-id', arguments: {} });

    expect(first.isError).not.toBe(true);
    expect(second.isError).not.toBe(true);
    const firstContent = first.content as Array<{ type: string; text?: string }>;
    const secondContent = second.content as Array<{ type: string; text?: string }>;
    expect(firstContent[0]?.text).toBe(mcpSessionId);
    expect(secondContent[0]?.text).toBe(mcpSessionId);
    expect(firstContent[0]?.text).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exposes upstream-backed tools plus local tools in tools/list', async () => {
    await connectClientToServer();
    const result = await client!.listTools();
    const toolNames = new Set(result.tools.map((t) => t.name));
    expect(toolNames).toEqual(
      new Set([
        'ping',
        'get-mcp-session-id',
        'generate-code',
        'list-connections',
        'list-tables',
        'get-table-details',
        'get-context-help',
        'create-tables',
        'modify-tables',
        'execute-query',
      ]),
    );

    const toolTitles = new Map(result.tools.map((t) => [t.name, t.title]));
    expect(Object.fromEntries(toolTitles)).toMatchObject({
      ping: 'Ping',
      'get-mcp-session-id': 'Get MCP Session ID',
      'generate-code': 'Generate Code',
      'list-connections': 'List Connections',
      'list-tables': 'List Tables',
      'get-table-details': 'Get Table Details',
      'get-context-help': 'Get Context Help',
      'create-tables': 'Create Tables',
      'modify-tables': 'Modify Tables',
      'execute-query': 'Execute Query',
    });
  });

  it('exposes embedded-server ToolParam descriptions in tools/list', async () => {
    await connectClientToServer();
    const result = await client!.listTools();

    const expectedDescriptions: Record<string, Record<string, string>> = {
      'list-tables': {
        connectionId:
          'NeoSQL connection ID from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
        database:
          'MCP-enabled database name from list-connections. Use null for DBMSs without a database hierarchy. Provide it with connectionId and schema, or omit all three to use the active project Default.',
        schema:
          'MCP-enabled schema name from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
        search:
          'Search keyword to filter tables by name or comment (case-insensitive). If omitted, returns all tables.',
      },
      'get-table-details': {
        tableNames: 'List of table names to get details for (e.g. ["users", "orders", "products"])',
        connectionId:
          'NeoSQL connection ID from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
        database:
          'MCP-enabled database name from list-connections. Use null for DBMSs without a database hierarchy. Provide it with connectionId and schema, or omit all three to use the active project Default.',
        schema:
          'MCP-enabled schema name from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
      },
      'create-tables': {
        tableDefinitions:
          'List of table definitions to create (e.g. [{name, remarks, columns, primaryKeys, ...}])',
        connectionId:
          'NeoSQL connection ID from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
        database:
          'MCP-enabled database name from list-connections. Use null for DBMSs without a database hierarchy. Provide it with connectionId and schema, or omit all three to use the active project Default.',
        schema:
          'MCP-enabled schema name from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
      },
      'modify-tables': {
        alterations:
          'List of table alterations. Each specifies a target table and the changes to apply.',
        connectionId:
          'NeoSQL connection ID from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
        database:
          'MCP-enabled database name from list-connections. Use null for DBMSs without a database hierarchy. Provide it with connectionId and schema, or omit all three to use the active project Default.',
        schema:
          'MCP-enabled schema name from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
      },
      'execute-query': {
        sql: 'The SQL statement to execute. Must not be DDL (CREATE/ALTER/DROP/TRUNCATE).',
        connectionId:
          'NeoSQL connection ID from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
        database:
          'MCP-enabled database name from list-connections. Use null for DBMSs without a database hierarchy. Provide it with connectionId and schema, or omit all three to use the active project Default.',
        schema:
          'MCP-enabled schema name from list-connections. Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
      },
    };

    for (const [toolName, parameterDescriptions] of Object.entries(expectedDescriptions)) {
      const tool = result.tools.find((t) => t.name === toolName);
      expect(tool, toolName).toBeDefined();
      const properties = tool!.inputSchema.properties as Record<string, { description?: string }>;

      for (const [parameterName, description] of Object.entries(parameterDescriptions)) {
        expect(properties[parameterName]?.description, `${toolName}.${parameterName}`).toBe(
          description,
        );
      }
    }
  });

  it('explains the manual transaction boundary for execute-query', async () => {
    await connectClientToServer();
    const result = await client!.listTools();
    const tool = result.tools.find((candidate) => candidate.name === 'execute-query');

    expect(tool?.description).toBe(
      'Execute a SQL query on the database through NeoSQL. ' +
        'Supports SELECT, INSERT, UPDATE, DELETE, and EXPLAIN statements. ' +
        'DDL statements (CREATE, ALTER, DROP, TRUNCATE) are NOT allowed — use create-tables or modify-tables tools instead. ' +
        'SELECT and EXPLAIN return result rows (up to 200 rows). ' +
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default. ' +
        'When a NeoSQL tool response indicates `autoCommit: false`, treat it as a user-configured safety policy. ' +
        'Do not arbitrarily finalize or cancel the open transaction, or attempt to bypass or change this policy.\n\n' +
        'You may execute transaction-control SQL only when the user has explicitly instructed when the transaction should be committed or rolled back.\n\n' +
        'Without such explicit instruction, you must not take any action to finalize, cancel, bypass, or change the transaction or this policy. This includes, for example:\n' +
        '- execute COMMIT, ROLLBACK, or equivalent transaction-control SQL through tools such as execute-query;\n' +
        '- directly operate the NeoSQL Desktop UI to finalize the transaction using Commit/Rollback buttons or menu actions.\n\n' +
        'On failure, the error message contains the raw underlying DB error (e.g. `ORA-00904`, `SQLSTATE 42703`) — ' +
        'use it to diagnose and propose corrections; do not retry blindly.',
    );
  });

  it('exposes embedded-server-compatible required and nested parameter schemas', async () => {
    await connectClientToServer();
    const result = await client!.listTools();

    const generateCodeSchema = inputSchemaFor(result.tools, 'generate-code');
    expect(requiredFields(generateCodeSchema)).toEqual([]);
    expect(generateCodeSchema.properties).toEqual({});

    const getTableDetailsSchema = inputSchemaFor(result.tools, 'get-table-details');
    expect(propertySchema(getTableDetailsSchema, 'tableNames').minItems).toBeUndefined();
    expect(allowsNull(propertySchema(getTableDetailsSchema, 'database'))).toBe(true);

    const executeQuerySchema = inputSchemaFor(result.tools, 'execute-query');
    expect(propertySchema(executeQuerySchema, 'sql').minLength).toBeUndefined();
    expect(allowsNull(propertySchema(executeQuerySchema, 'database'))).toBe(true);
    expect(executeQuerySchema.properties).not.toHaveProperty('autoCommit');

    const createTablesSchema = inputSchemaFor(result.tools, 'create-tables');
    expect(requiredFields(createTablesSchema)).toEqual(['tableDefinitions']);
    expect(allowsNull(propertySchema(createTablesSchema, 'database'))).toBe(true);
    expect(createTablesSchema.properties).not.toHaveProperty('executeImmediately');
    const tableDefSchema = arrayItemSchema(propertySchema(createTablesSchema, 'tableDefinitions'));
    expect(tableDefSchema.additionalProperties).toBe(false);
    expect(requiredFields(tableDefSchema)).toEqual([
      'name',
      'remarks',
      'columns',
      'primaryKeys',
      'importedKeys',
      'indexes',
      'constraints',
    ]);
    const columnDefSchema = arrayItemSchema(propertySchema(tableDefSchema, 'columns'));
    expect(columnDefSchema.additionalProperties).toBe(false);
    expect(requiredFields(columnDefSchema)).toEqual([
      'name',
      'type',
      'size',
      'decimalDigits',
      'nullable',
      'autoIncrement',
      'defaultValue',
      'remarks',
    ]);

    const modifyTablesSchema = inputSchemaFor(result.tools, 'modify-tables');
    expect(requiredFields(modifyTablesSchema)).toEqual(['alterations']);
    expect(allowsNull(propertySchema(modifyTablesSchema, 'database'))).toBe(true);
    expect(modifyTablesSchema.properties).not.toHaveProperty('executeImmediately');
    const alterTableDefSchema = arrayItemSchema(propertySchema(modifyTablesSchema, 'alterations'));
    expect(alterTableDefSchema.additionalProperties).toBe(false);
    expect(requiredFields(alterTableDefSchema)).toEqual([
      'tableName',
      'newTableName',
      'columnOperations',
      'indexOperations',
      'foreignKeyOperations',
      'constraintOperations',
    ]);
    const remarksOperationSchema = nonNullSchema(
      propertySchema(alterTableDefSchema, 'remarksOperation'),
    );
    expect(remarksOperationSchema.additionalProperties).toBe(false);
    expect(requiredFields(remarksOperationSchema)).toEqual([]);
    const primaryKeyOperationSchema = arrayItemSchema(
      nonNullSchema(propertySchema(alterTableDefSchema, 'primaryKeyOperations')),
    );
    expect(primaryKeyOperationSchema.additionalProperties).toBe(false);
    expect(requiredFields(primaryKeyOperationSchema)).toEqual(['action', 'columnName']);
    const columnOperationSchema = arrayItemSchema(
      propertySchema(alterTableDefSchema, 'columnOperations'),
    );
    expect(columnOperationSchema.additionalProperties).toBe(false);
    expect(requiredFields(columnOperationSchema)).toEqual([
      'action',
      'columnName',
      'newColumnName',
      'afterColumn',
      'type',
      'size',
      'decimalDigits',
      'nullable',
      'autoIncrement',
      'defaultValue',
      'remarks',
    ]);
  });

  it('rejects partial coordinate tuples for every database tool', async () => {
    await connectClientToServer();
    const cases = [
      { name: 'list-tables', arguments: { connectionId: '57' } },
      {
        name: 'get-table-details',
        arguments: { tableNames: ['users'], connectionId: '57' },
      },
      { name: 'create-tables', arguments: { tableDefinitions: [], connectionId: '57' } },
      { name: 'modify-tables', arguments: { alterations: [], connectionId: '57' } },
      { name: 'execute-query', arguments: { sql: 'SELECT 1', connectionId: '57' } },
    ];

    for (const testCase of cases) {
      const result = await client!.callTool(testCase);
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(result.isError, testCase.name).toBe(true);
      expect(content[0]?.text, testCase.name).toContain('-32602');
      expect(content[0]?.text, testCase.name).toContain(
        'connectionId, database, and schema must be provided together or all omitted.',
      );
    }
  });
});

interface JsonSchema {
  additionalProperties?: boolean;
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  minItems?: number;
  minLength?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string | string[];
}

const inputSchemaFor = (
  tools: Array<{ name: string; inputSchema: unknown }>,
  toolName: string,
): JsonSchema => {
  const tool = tools.find((t) => t.name === toolName);
  expect(tool, toolName).toBeDefined();
  return tool!.inputSchema as JsonSchema;
};

const propertySchema = (schema: JsonSchema, propertyName: string): JsonSchema => {
  const property = schema.properties?.[propertyName];
  expect(property, propertyName).toBeDefined();
  return property!;
};

const arrayItemSchema = (schema: JsonSchema): JsonSchema => {
  expect(schema.type).toBe('array');
  expect(schema.items).toBeDefined();
  return schema.items!;
};

const nonNullSchema = (schema: JsonSchema): JsonSchema =>
  schema.anyOf?.find((candidate) => candidate.type !== 'null') ?? schema;

const allowsNull = (schema: JsonSchema): boolean =>
  schema.type === 'null' ||
  (Array.isArray(schema.type) && schema.type.includes('null')) ||
  !!schema.anyOf?.some((candidate) => allowsNull(candidate));

const requiredFields = (schema: JsonSchema): string[] => schema.required ?? [];
