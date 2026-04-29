export interface NeosqlContext {
  projectId?: string;
  connectionId?: string;
  schema?: string;
  ddlExecute?: boolean;
  autoCommit?: boolean;
}

export interface ContextStore {
  get(): NeosqlContext;
  set(patch: Partial<NeosqlContext>): NeosqlContext;
}

export const createContextStore = (): ContextStore => {
  let current: NeosqlContext = {};

  return {
    get: () => ({ ...current }),
    set: (patch) => {
      current = { ...current, ...patch };
      return { ...current };
    },
  };
};
