export interface NeosqlContext {
  projectId?: string;
  connectionId?: string;
  database?: string | null;
  schema?: string;
}

export interface NeosqlContextPatch {
  projectId?: string | undefined;
  connectionId?: string | undefined;
  database?: string | null | undefined;
  schema?: string | undefined;
}

export interface ContextStore {
  get(): NeosqlContext;
  set(patch: NeosqlContextPatch): NeosqlContext;
}

export const mergeContext = (current: NeosqlContext, patch: NeosqlContextPatch): NeosqlContext => {
  const next: NeosqlContext = { ...current };

  assignString(next, 'projectId', patch.projectId);
  assignString(next, 'connectionId', patch.connectionId);
  assignNullableString(next, 'database', patch.database);
  assignString(next, 'schema', patch.schema);

  return next;
};

export const createContextStore = (): ContextStore => {
  let current: NeosqlContext = {};

  return {
    get: () => ({ ...current }),
    set: (patch) => {
      current = mergeContext(current, patch);
      return { ...current };
    },
  };
};

const assignString = (
  target: NeosqlContext,
  key: 'projectId' | 'connectionId' | 'schema',
  value: string | undefined,
): void => {
  if (value === undefined || value.trim() === '') return;
  target[key] = value;
};

const assignNullableString = (
  target: NeosqlContext,
  key: 'database',
  value: string | null | undefined,
): void => {
  if (value === undefined) return;
  target[key] = value === null || value.trim() === '' ? null : value;
};
