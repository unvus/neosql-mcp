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
    importedKeys: z.array(importedKeyDefSchema).describe('Foreign key definitions'),
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

const foreignKeyOperationSchema = z
  .object({
    action: z.string().describe('Operation type: ADD or DROP'),
    fkName: z.string().describe('Foreign key constraint name'),
    fkColumnName: z.string().describe('Foreign key column name in this table (required for ADD)'),
    pkTableName: z.string().describe('Referenced (primary key) table name (required for ADD)'),
    pkColumnName: z.string().describe('Referenced (primary key) column name (required for ADD)'),
    deferrable: z.boolean().describe('Whether the foreign key is DEFERRABLE (PostgreSQL / Oracle)'),
    initiallyDeferred: z
      .boolean()
      .describe('True if INITIALLY DEFERRED, false if INITIALLY IMMEDIATE'),
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

export const alterTableDefSchema = z
  .object({
    tableName: z.string().describe('Target table name to modify'),
    newTableName: z.string().describe('New table name (for rename). Omit if not renaming.'),
    newRemarks: z.string().describe('New table comment. Omit if not changing.'),
    newPrimaryKeys: stringArraySchema.describe(
      'New primary key column names. Omit if not changing PK.',
    ),
    columnOperations: z
      .array(columnOperationSchema)
      .describe('Column operations (ADD, DROP, MODIFY, RENAME)'),
    indexOperations: z.array(indexOperationSchema).describe('Index operations (ADD, DROP)'),
    foreignKeyOperations: z
      .array(foreignKeyOperationSchema)
      .describe('Foreign key operations (ADD, DROP)'),
    constraintOperations: z
      .array(constraintOperationSchema)
      .describe('Table-level constraint operations (UNIQUE / CHECK / EXCLUSION). ADD, DROP.'),
  })
  .strict();
