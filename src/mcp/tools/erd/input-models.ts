import { z } from 'zod';

const stringArraySchema = z.array(z.string());

const importedKeyDefSchema = z
  .object({
    fkName: z.string().describe('Foreign key constraint name'),
    fkColumnName: z.string().describe('Foreign key column name in this table'),
    pkTableName: z.string().describe('Referenced (primary key) table name'),
    pkColumnName: z.string().describe('Referenced (primary key) column name'),
    deferrable: z.boolean().describe('Whether the foreign key is DEFERRABLE (PostgreSQL / Oracle)'),
    initiallyDeferred: z
      .boolean()
      .describe('True if INITIALLY DEFERRED, false if INITIALLY IMMEDIATE'),
  })
  .strict();

const indexDefSchema = z
  .object({
    indexName: z.string().describe('Index name'),
    columnNames: stringArraySchema.describe('Column names included in the index'),
    unique: z.boolean().describe('Whether the index enforces uniqueness'),
  })
  .strict();

const constraintDefSchema = z
  .object({
    name: z.string().describe('Constraint name'),
    type: z.string().describe('Constraint type: UNIQUE, CHECK, or EXCLUSION (PostgreSQL only)'),
    columns: stringArraySchema.describe('Column names for UNIQUE constraint'),
    expression: z.string().describe("Expression for CHECK constraint (e.g., 'age >= 18')"),
    exclusionClause: z
      .string()
      .describe(
        "Raw EXCLUDE clause body for EXCLUSION (e.g., 'USING gist (room WITH =, during WITH &&)')",
      ),
    deferrable: z.boolean().describe('Whether the constraint is DEFERRABLE (PostgreSQL / Oracle)'),
    initiallyDeferred: z
      .boolean()
      .describe('True if INITIALLY DEFERRED, false if INITIALLY IMMEDIATE'),
    comment: z.string().describe('Optional comment'),
  })
  .strict();

const columnDefSchema = z
  .object({
    name: z.string().describe('Column name'),
    type: z
      .string()
      .describe('Column data type (e.g. VARCHAR, BIGINT, INT, TEXT, BOOLEAN, DATE, TIMESTAMP)'),
    size: z.number().int().describe('Column size (e.g. 255 for VARCHAR(255))'),
    decimalDigits: z.number().int().describe('Decimal digits for numeric types'),
    nullable: z.boolean().describe('Whether the column allows NULL (default: true)'),
    autoIncrement: z.boolean().describe('Whether the column is auto-increment'),
    defaultValue: z.string().describe('Default value expression'),
    remarks: z.string().describe('Column comment'),
  })
  .strict();

export const tableDefSchema = z
  .object({
    name: z.string().describe('Table name'),
    remarks: z.string().describe('Table comment'),
    columns: z.array(columnDefSchema).describe('Column definitions'),
    primaryKeys: stringArraySchema.describe('Primary key column names'),
    importedKeys: z
      .array(importedKeyDefSchema)
      .describe(
        'Foreign key definitions (real foreign keys only). To add NeoSQL virtual relations, create the ' +
          'tables first, then use erd-modify-tables foreignKeyOperations with virtual=true.',
      ),
    indexes: z.array(indexDefSchema).describe('Index definitions'),
    constraints: z
      .array(constraintDefSchema)
      .describe('Table-level constraint definitions (UNIQUE / CHECK / EXCLUSION)'),
  })
  .strict();

const columnOperationSchema = z
  .object({
    action: z.string().describe('Operation type: ADD, DROP, MODIFY, or RENAME'),
    columnName: z
      .string()
      .describe(
        'Target column name (existing column for DROP/MODIFY/RENAME, new column name for ADD)',
      ),
    newColumnName: z.string().describe('New column name (for RENAME only)'),
    afterColumn: z
      .string()
      .describe(
        "Place column after this column (MySQL/MariaDB only, for ADD/MODIFY). Use 'FIRST' to place at the beginning.",
      ),
    type: z
      .string()
      .describe('Column data type (e.g. VARCHAR, BIGINT). Required for ADD, optional for MODIFY.'),
    size: z.number().int().describe('Column size (e.g. 255 for VARCHAR(255))'),
    decimalDigits: z.number().int().describe('Decimal digits for numeric types'),
    nullable: z.boolean().describe('Whether the column allows NULL'),
    autoIncrement: z.boolean().describe('Whether the column is auto-increment'),
    defaultValue: z.string().describe('Default value expression'),
    remarks: z.string().describe('Column comment'),
  })
  .strict();

const indexOperationSchema = z
  .object({
    action: z.string().describe('Operation type: ADD or DROP'),
    indexName: z.string().describe('Index name'),
    columnNames: stringArraySchema.describe('Column names for the index (required for ADD)'),
    unique: z.boolean().describe('Whether the index enforces uniqueness (for ADD, default: false)'),
  })
  .strict();

const virtualRelationConditionSchema = z
  .object({
    side: z
      .enum(['child', 'parent'])
      .describe(
        "Which table the column belongs to: 'child' = this table (the fkColumnName side), " +
          "'parent' = the referenced table (pkTableName).",
      ),
    column: z.string().describe('Existing column name on that side'),
    value: z
      .union([z.string(), z.number()])
      .describe(
        'Fixed value the column equals (equality only). Numeric columns need a numeric value.',
      ),
  })
  .strict();

const foreignKeyOperationSchema = z
  .object({
    action: z.string().describe('Operation type: ADD or DROP'),
    fkName: z
      .string()
      .describe(
        'Foreign key constraint name. With virtual=true: the virtual relation name; for a single-pair ' +
          'virtual ADD it may be empty to get a generated name (returned in virtualRelations.added). ' +
          'Names are unique per table across foreign keys and virtual relations.',
      ),
    fkColumnName: z
      .string()
      .describe(
        'Foreign key column name in this table (required for ADD). ' +
          'For a multi-column key or virtual relation, send one ADD per column pair with the same fkName.',
      ),
    pkTableName: z.string().describe('Referenced (primary key) table name (required for ADD)'),
    pkColumnName: z
      .string()
      .describe(
        'Referenced (primary key) column name (required for ADD). ' +
          'A non-identifying virtual relation may reference any existing column.',
      ),
    deferrable: z.boolean().describe('Whether the foreign key is DEFERRABLE (PostgreSQL / Oracle)'),
    initiallyDeferred: z
      .boolean()
      .describe('True if INITIALLY DEFERRED, false if INITIALLY IMMEDIATE'),
    virtual: z
      .boolean()
      .optional()
      .describe(
        'true = a NeoSQL virtual relation instead of a foreign key. It is stored only in NeoSQL, never ' +
          'produces DDL, and is never applied to the database. Use it for (1) a real FK the database ' +
          'intentionally does not enforce (e.g. for performance), or (2) a code/category mapping matched ' +
          'by columns plus fixed values, e.g. on table ha_category: fkColumnName cate_code -> ' +
          "ha_account.acnt_status with child conditions cate_ns = 'common' and cate_parent_code = " +
          "'acnt_status' (one relation per code group; another for acnt_type). The referenced table and all " +
          'columns must already exist (same connection and database; new columns are not created). ' +
          'Read tables with get-table-details first. ADD/DROP with virtual=true only touch virtual ' +
          'relations; a DROP without it never removes one. deferrable/initiallyDeferred are ignored.',
      ),
    identifying: z
      .boolean()
      .optional()
      .describe(
        'Virtual relations only (default false). true = identifying: may reference only primary key ' +
          'columns of the referenced table and cannot have conditions.',
      ),
    pkSchemaName: z
      .string()
      .optional()
      .describe(
        'Virtual relations only: schema of the referenced table when it is in another schema of the ' +
          'same database (not supported on SQLite). Omit or empty for the schema of this tool call.',
      ),
    conditions: z
      .array(virtualRelationConditionSchema)
      .optional()
      .describe(
        'Virtual relations only, non-identifying: fixed-value conditions (column = value) on either ' +
          'table, in addition to the column pairs. A condition column cannot also be in a column pair.',
      ),
  })
  .strict();

const constraintOperationSchema = z
  .object({
    action: z.string().describe('Operation type: ADD or DROP'),
    name: z.string().describe('Constraint name'),
    type: z
      .string()
      .describe(
        'Constraint type: UNIQUE, CHECK, or EXCLUSION (PostgreSQL only). Required for ADD.',
      ),
    columns: stringArraySchema.describe(
      'Column names for UNIQUE constraint (required for UNIQUE ADD)',
    ),
    expression: z
      .string()
      .describe("Expression for CHECK constraint (required for CHECK ADD, e.g., 'age >= 18')"),
    exclusionClause: z
      .string()
      .describe(
        "Raw EXCLUDE clause body (required for EXCLUSION ADD, e.g., 'USING gist (room WITH =, during WITH &&)')",
      ),
    deferrable: z.boolean().describe('Whether the constraint is DEFERRABLE (PostgreSQL / Oracle)'),
    initiallyDeferred: z
      .boolean()
      .describe('True if INITIALLY DEFERRED, false if INITIALLY IMMEDIATE'),
  })
  .strict();

export const remarksOperationSchema = z
  .object({
    modify: z
      .boolean()
      .optional()
      .describe(
        'Apply table comment only when true. Use true to intentionally set an empty comment.',
      ),
    remarks: z.string().optional().describe('New table comment. Empty string is allowed.'),
  })
  .strict();

export type McpRemarksOperation = z.infer<typeof remarksOperationSchema>;

export const primaryKeyOperationSchema = z
  .object({
    action: z.enum(['ADD', 'DROP']).describe('Primary key operation type: ADD or DROP'),
    columnName: z.string().describe('Primary key column name to add or drop'),
  })
  .strict();

export type McpPrimaryKeyOperation = z.infer<typeof primaryKeyOperationSchema>;

export const alterTableDefSchema = z
  .object({
    tableName: z.string().describe('Target table name to modify'),
    newTableName: z.string().describe('New table name (for rename). Omit if not renaming.'),
    remarksOperation: remarksOperationSchema
      .nullable()
      .optional()
      .describe(
        'Table comment operation. Omit, null, or set modify=false for no change. ' +
          'Set modify=true to apply remarks, including an intentional empty string.',
      ),
    primaryKeyOperations: z
      .array(primaryKeyOperationSchema)
      .nullable()
      .optional()
      .describe(
        'Primary key operations. Omit, null, or [] for no change. ' +
          'Use ADD to append a column to the current PK and DROP to remove one PK column. ' +
          'To drop all PK columns, send one DROP operation per current PK column.',
      ),
    columnOperations: z
      .array(columnOperationSchema)
      .describe('Column operations (ADD, DROP, MODIFY, RENAME)'),
    indexOperations: z.array(indexOperationSchema).describe('Index operations (ADD, DROP)'),
    foreignKeyOperations: z
      .array(foreignKeyOperationSchema)
      .describe(
        'Foreign key operations (ADD, DROP). With virtual=true, adds or drops a NeoSQL virtual relation ' +
          '(no DDL) instead; virtual operations run after the foreign key operations, DROPs before ADDs.',
      ),
    constraintOperations: z
      .array(constraintOperationSchema)
      .describe('Table-level constraint operations (UNIQUE / CHECK / EXCLUSION). ADD, DROP.'),
  })
  .strict();
