# NeoSQL MCP Privacy Policy

Effective date: September 29, 2026

This policy applies to information processed when you use the NeoSQL MCP server and
the `neosql-mcp` plugin provided by Unvus Co., Ltd. NeoSQL MCP runs on your computer,
forwards requests from MCP clients such as Claude to NeoSQL Desktop, and returns
the results to the client. NeoSQL Desktop handles database access and project operations.

You can use local projects without a NeoSQL account. The
[NeoSQL Privacy Policy](https://neosql.unvus.com/en/privacy) also applies to
NeoSQL Desktop's own usage statistics, accounts, and online services.

## 1. Data We Process

Depending on the tools you use and your project settings, the following information
may be processed.

| Category | Information |
| --- | --- |
| Operation targets | Project and connection identifiers, database and schema names |
| Database structure | Metadata such as tables, columns, relationships, constraints, and comments |
| SQL operations | SQL statements, execution results, and data in retrieved rows |
| Project operations | ERD models, metadata and template settings for code generation, and generated file paths |
| Installation and operation | Information used to check installation, such as the Desktop installation path; runtime status; and request and error records |

Plugin setup does not require you to enter personal information or database connection
details. Database connections use the connection details configured in NeoSQL Desktop.

Depending on the operations you request and the contents of your database, SQL statements,
query results, comments, and other content may contain personal information. Information
in tool responses is sent to the requesting MCP client. Sending information to an MCP
client and storing or synchronizing it through NeoSQL services are separate activities.
Sections 2 and 3 describe the data involved and the conditions for each.

## 2. How We Use and Store Data

This information is used to select operation targets, inspect schemas, execute SQL,
edit ERDs, generate code, check connection status, and provide error information.

Depending on the feature and project type, data may be stored in the following locations.

- **SQL editor documents and ERD models:** Stored on your computer for local projects.
  For account projects, they may be stored in NeoSQL services. Shared ERDs may be
  synchronized remotely according to the project's synchronization settings.
- **Generated source files:** Stored in the configured local project location.
- **Data changed through SQL:** Changes are applied to the database you connect to.
- **Diagnostic records:** May be recorded in local logs for the NeoSQL MCP server and
  Desktop, and in Desktop's in-memory MCP request history.

**NeoSQL MCP server logs:** Runtime status and error information are recorded in local
logs on your computer.

**NeoSQL Desktop logs:** MCP request bodies containing tool inputs, such as SQL, are
recorded in local logs on your computer.

## 3. External Transfers and Third-Party Processing

**MCP clients and their providers**

Tool execution results are returned to the requesting MCP client. Results may include
schema information, SQL, retrieved data, operation results, and file paths. For account
projects, sensitive information in SQL query results can be masked according to
NeoSQL Desktop's masking settings before being sent to the MCP client.

Local projects do not support this feature. Masking applies to query result values;
it does not automatically mask entire SQL request bodies or local logs.

The processing and retention of information sent to an MCP client are governed by
the policies of the client's provider and your settings.

Related policy: [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)

**Databases you connect to**

Desktop sends query and execution requests to the configured database. If you use a
remote database, requests are sent to that server and are subject to its access controls,
logging, and retention policies.

**NeoSQL services and project synchronization services**

SQL editor documents and ERD models in account projects may be stored in NeoSQL services.
Shared ERD documents may be transferred through the synchronization service configured
for the project. The [NeoSQL Privacy Policy](https://neosql.unvus.com/en/privacy)
applies to data processing by these services.

## 4. Data Retention and Deletion

| Data | Retention and deletion |
| --- | --- |
| Local SQL documents, ERDs, and generated files | Retained until you delete them through the relevant app or file system. |
| Data in connected databases | Subject to the database's retention, deletion, and backup policies. |
| NeoSQL MCP server logs | Accumulate in files and are not automatically deleted. You can delete the log files. |
| NeoSQL Desktop logs | Existing logs are replaced based on file size, rather than deleted after a set period. |
| NeoSQL Desktop's in-memory MCP request history | Removed from memory when you clear the history or fully quit NeoSQL Desktop. |
| Online project and synchronized data | Generally retained until you delete it or your use of the service ends. Additional retention for backups, security, legal obligations, or other purposes is governed by the [NeoSQL Privacy Policy](https://neosql.unvus.com/en/privacy). |
| Information sent to MCP clients | Subject to the provider's service agreement, privacy policy, and account settings. |

You can manage local files and logs through the relevant app or file system, and online
data through NeoSQL's management features. Requests to delete personal information
processed by the company follow the procedures described in the NeoSQL Privacy Policy.

## 5. Privacy Inquiries

You can send questions about NeoSQL MCP's processing of personal information, or requests
for access, correction, or deletion, to the contact below. Requests are handled in
accordance with applicable law and the relevant provisions of the
[NeoSQL Privacy Policy](https://neosql.unvus.com/en/privacy).

- Operator: Unvus Co., Ltd.
- Email: `contact@unvus.com`
