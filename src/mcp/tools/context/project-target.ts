import { z } from 'zod';

export const projectTargetInputShape = {
  projectId: z
    .string()
    .refine((value) => value.trim() !== '', 'projectId must not be blank.')
    .describe(
      'NeoSQL project ID from list-projects or create-project. NeoSQL Desktop opens the project if needed. Omit it to use the project configured with --project-id, or the project currently open in NeoSQL Desktop.',
    )
    .optional(),
};

export interface ProjectTargetInput {
  projectId?: string | undefined;
}

/** Separate the call target from the operation input; the app reads it only from context. */
export const splitProjectTarget = <T extends ProjectTargetInput>(
  args: T,
): { projectId: string | undefined; input: Omit<T, 'projectId'> } => {
  const { projectId, ...input } = args;
  return { projectId: projectId?.trim(), input };
};

export interface ProjectConflictPayload {
  status: 'project_conflict';
  message: string;
  nextAction: string;
  requestSent: false;
}

export type ProjectTargetResolution =
  | { ok: true; projectId: string | undefined }
  | { ok: false; payload: ProjectConflictPayload };

/** --project-id fixes the target for every call; a different per-call projectId is rejected. */
export const resolveProjectTarget = (
  configuredProjectId: string | undefined,
  requestedProjectId: string | undefined,
): ProjectTargetResolution => {
  if (
    configuredProjectId === undefined ||
    requestedProjectId === undefined ||
    requestedProjectId === configuredProjectId
  ) {
    return { ok: true, projectId: requestedProjectId ?? configuredProjectId };
  }
  return {
    ok: false,
    payload: {
      status: 'project_conflict',
      message:
        `This NeoSQL MCP server is configured for project '${configuredProjectId}' (--project-id), ` +
        `so it cannot target project '${requestedProjectId}'. The operation was not sent.`,
      nextAction: `Omit projectId or pass '${configuredProjectId}'. To work in other projects, remove --project-id from the MCP client configuration.`,
      requestSent: false,
    },
  };
};
