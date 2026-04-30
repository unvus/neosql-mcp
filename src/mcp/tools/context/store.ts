export interface NeosqlContext {
  projectId?: string;
  connectionId?: string;
  schema?: string;
  ddlExecute?: boolean;
  autoCommit?: boolean;
}

export interface NeosqlContextPatch {
  projectId?: string | undefined;
  connectionId?: string | undefined;
  schema?: string | undefined;
  ddlExecute?: boolean | undefined;
  autoCommit?: boolean | undefined;
}

export interface ContextStore {
  get(): NeosqlContext;
  set(patch: NeosqlContextPatch): NeosqlContext;
}

export const mergeContext = (current: NeosqlContext, patch: NeosqlContextPatch): NeosqlContext => {
  const next: NeosqlContext = { ...current };

  assignString(next, 'projectId', patch.projectId);
  assignString(next, 'connectionId', patch.connectionId);
  assignString(next, 'schema', patch.schema);
  assignBoolean(next, 'ddlExecute', patch.ddlExecute);
  assignBoolean(next, 'autoCommit', patch.autoCommit);

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

const assignBoolean = (
  target: NeosqlContext,
  key: 'ddlExecute' | 'autoCommit',
  value: boolean | undefined,
): void => {
  if (value === undefined) return;
  target[key] = value;
};
