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

  it('returns the process-scoped mcpSessionId when getMcpSessionId is called', async () => {
    await connectClientToServer();
    const first = await client!.callTool({ name: 'getMcpSessionId', arguments: {} });
    const second = await client!.callTool({ name: 'getMcpSessionId', arguments: {} });

    expect(first.isError).not.toBe(true);
    expect(second.isError).not.toBe(true);
    const firstContent = first.content as Array<{ type: string; text?: string }>;
    const secondContent = second.content as Array<{ type: string; text?: string }>;
    expect(firstContent[0]?.text).toBe(mcpSessionId);
    expect(secondContent[0]?.text).toBe(mcpSessionId);
    expect(firstContent[0]?.text).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exposes the 9 ported embedded-server tools plus local test tools in tools/list', async () => {
    await connectClientToServer();
    const result = await client!.listTools();
    const toolNames = new Set(result.tools.map((t) => t.name));
    expect(toolNames).toEqual(
      new Set([
        'ping',
        'getMcpSessionId',
        'generateCode',
        'listTables',
        'getTableDetails',
        'setContext',
        'getContext',
        'getContextHelp',
        'createTables',
        'modifyTables',
        'executeQuery',
      ]),
    );
  });

  it('exposes embedded-server ToolParam descriptions in tools/list', async () => {
    await connectClientToServer();
    const result = await client!.listTools();

    const expectedDescriptions: Record<string, Record<string, string>> = {
      setContext: {
        projectId:
          "Project ID (e.g., '71ef287779c14fc6b3bb86f88acdb216'). Leave empty to keep current value.",
        connectionId: "Connection ID (e.g., '0', '1'). Leave empty to keep current value.",
        schema: "Schema name (e.g., 'public', 'dbo', 'default'). Leave empty to keep current value.",
        ddlExecute:
          'Whether to execute DDL immediately on the database when creating/modifying tables. Default is false (ERD only).',
        autoCommit:
          'Whether to auto-commit DML statements (INSERT/UPDATE/DELETE) when using executeQuery. Default is false (manual commit in NeoSQL UI).',
      },
      listTables: {
        schema:
          "Database schema name (e.g., 'public', 'dbo'). If omitted, uses current context schema.",
        search:
          'Search keyword to filter tables by name or comment (case-insensitive). If omitted, returns all tables.',
      },
      getTableDetails: {
        tableNames: 'List of table names to get details for (e.g. ["users", "orders", "products"])',
        schema: 'Database schema name. If omitted, uses current context schema.',
      },
      createTables: {
        tableDefinitions:
          'List of table definitions to create (e.g. [{name, remarks, columns, primaryKeys, ...}])',
        executeImmediately:
          'If true, execute DDL immediately on the database. Overrides context ddlExecute setting.',
      },
      modifyTables: {
        alterations:
          'List of table alterations. Each specifies a target table and the changes to apply.',
        executeImmediately:
          'If true, execute DDL immediately on the database. Overrides context ddlExecute setting.',
      },
      executeQuery: {
        sql: 'The SQL statement to execute. Must not be DDL (CREATE/ALTER/DROP/TRUNCATE).',
        autoCommit:
          'Whether to commit DML immediately. Default is false (manual commit, safer). ' +
          'MUST ask the user before setting to true. ' +
          'When false, the user can review and COMMIT/ROLLBACK in NeoSQL UI.',
      },
      generateCode: {
        tableName: 'Table name to generate code for',
        templatePackId: 'Template pack ID to use for code generation',
        schema: 'Database schema name. If omitted, uses current context schema.',
      },
    };

    for (const [toolName, parameterDescriptions] of Object.entries(expectedDescriptions)) {
      const tool = result.tools.find((t) => t.name === toolName);
      expect(tool, toolName).toBeDefined();
      const properties = tool!.inputSchema.properties as Record<
        string,
        { description?: string }
      >;

      for (const [parameterName, description] of Object.entries(parameterDescriptions)) {
        expect(properties[parameterName]?.description, `${toolName}.${parameterName}`).toBe(
          description,
        );
      }
    }
  });
});
