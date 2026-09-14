import type { Profile } from './endpoint-resolver.js';

export const failureReasons = [
  'storage_unavailable',
  'initial_sync_failed',
  'initialization_failed',
  'missing_project_config',
] as const;
export const actionReasons = [
  'unlock_project',
  'cleanup_connections',
  'cleanup_members',
  'resolve_missing_driver',
  'project_access_blocked',
  'acknowledge_notice',
] as const;
export type ProjectActionReason = (typeof actionReasons)[number];
export type ProjectStatus =
  | { state: 'not_selected'; projectId: null }
  | { state: 'loading' | 'ready' | 'authentication_required'; projectId: string }
  | { state: 'failed'; projectId: string; reason: (typeof failureReasons)[number] }
  | { state: 'user_action_required'; projectId: string; reason: ProjectActionReason };
export type RuntimeStatus = { app: 'neosql'; profile: Profile } & (
  | { renderer: 'not_ready'; project: null }
  | { renderer: 'responsive'; project: ProjectStatus }
);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const isRuntimeStatus = (value: unknown, profile: Profile): value is RuntimeStatus => {
  if (!record(value) || value.app !== 'neosql' || value.profile !== profile) return false;
  if (value.renderer === 'not_ready') return value.project === null;
  if (value.renderer !== 'responsive' || !record(value.project)) return false;
  const project = value.project;
  if (project.state === 'not_selected')
    return project.projectId === null && project.reason === undefined;
  if (typeof project.projectId !== 'string' || !project.projectId.length) return false;
  if (project.state === 'failed') return failureReasons.some((reason) => reason === project.reason);
  if (project.state === 'user_action_required')
    return actionReasons.some((reason) => reason === project.reason);
  return (
    ['loading', 'ready', 'authentication_required'].includes(String(project.state)) &&
    project.reason === undefined
  );
};
