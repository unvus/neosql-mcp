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
  throw new Error('createContextStore: not implemented');
};
