import type {
  DesktopReadyResult,
  PreparationFailureStatus,
  PreparationState,
} from '../../upstream/desktop-readiness.js';
import type { ProjectActionReason } from '../../upstream/runtime-status.js';

export const progressMessages: Record<PreparationState, string> = {
  activation_requesting: 'Could not connect to NeoSQL Desktop. Requesting app activation.',
  activation_requested: 'App activation was requested. Waiting for NeoSQL Desktop to become ready.',
  renderer_loading:
    'Connected to NeoSQL Desktop. Waiting for the app interface to finish initializing.',
  project_navigation: 'Requesting navigation to the configured project.',
  target_loading: 'Waiting for the configured project to become ready.',
  project_loading: 'Loading the selected project.',
  ready: 'The project is ready. Proceeding with the requested operation.',
};
const failureMessages: Record<PreparationFailureStatus, [string, string]> = {
  target_unavailable: ['The configured project could not be opened.', 'Check the project ID and access permissions in NeoSQL Desktop.'],
  project_lookup_failed: ['Could not look up the configured project.', 'Check NeoSQL Desktop and try again.'],
  project_navigation_failed: ['Could not confirm navigation to the configured project. The operation was not sent.', 'Check NeoSQL Desktop before trying again.'],
  project_mismatch: ['The active project differs from the configured project. The operation was not sent.', 'Check NeoSQL Desktop and run the tool again.'],
  installation_not_found: [
    'NeoSQL Desktop installation could not be found. Install NeoSQL Desktop and try again. If it is already installed, open it manually.',
    'Install NeoSQL Desktop or open the installed app manually, then run the tool again.',
  ],
  installation_check_failed: [
    'Could not check the NeoSQL Desktop installation. Open the app manually and try again.',
    'Open the app manually, then run the tool again.',
  ],
  activation_failed: [
    'Failed to request NeoSQL Desktop activation. Open the app manually and try again.',
    'Open the app manually, then run the tool again.',
  ],
  project_not_selected: [
    'NeoSQL Desktop is ready. Select a project in the app, then run the tool again.',
    'Select a project, then run the tool again.',
  ],
  project_load_failed: [
    'Failed to load the project. Check the error in NeoSQL Desktop.',
    'Check and resolve the project error in NeoSQL Desktop, then run the tool again.',
  ],
  authentication_required: [
    'Sign in to NeoSQL Desktop to use the selected account project, then run the tool again.',
    'Sign in to NeoSQL Desktop, then run the tool again.',
  ],
  readiness_timeout: [
    'Could not confirm readiness before the timeout. Check NeoSQL Desktop and try again.',
    'Check NeoSQL Desktop, then run the tool again.',
  ],
  user_action_required: [
    'Project initialization is waiting for your confirmation. Review and acknowledge the notice in NeoSQL Desktop, then run the tool again.',
    'Review and acknowledge the notice in NeoSQL Desktop, then run the tool again.',
  ],
  status_check_failed: [
    "Could not verify NeoSQL Desktop's current state. Check the app, then run the tool again.",
    'Check NeoSQL Desktop, then run the tool again.',
  ],
};
const actionMessages: Record<ProjectActionReason | 'unsaved_changes', [string, string]> = {
  unsaved_changes: ['Unsaved changes prevent project navigation.', 'Save or discard the changes in NeoSQL Desktop, then run the tool again.'],
  unlock_project: [
    'The project needs to be unlocked. Unlock it in NeoSQL Desktop, then run the tool again.',
    'Unlock the project in NeoSQL Desktop, then run the tool again.',
  ],
  cleanup_connections: [
    'Connection cleanup is required. Complete the connection cleanup in NeoSQL Desktop, then run the tool again.',
    'Complete the connection cleanup in NeoSQL Desktop, then run the tool again.',
  ],
  cleanup_members: [
    'Member cleanup is required. Complete the member cleanup in NeoSQL Desktop, then run the tool again.',
    'Complete the member cleanup in NeoSQL Desktop, then run the tool again.',
  ],
  resolve_missing_driver: [
    'A custom driver needs attention. Install it or choose Skip in NeoSQL Desktop, then run the tool again.',
    'Install the custom driver or choose Skip in NeoSQL Desktop, then run the tool again.',
  ],
  project_access_blocked: [
    'Access to the project is blocked. Review the notice in NeoSQL Desktop and resolve the restriction or select an accessible project, then run the tool again.',
    'Resolve the restriction or select an accessible project in NeoSQL Desktop, then run the tool again.',
  ],
  acknowledge_notice: failureMessages.user_action_required,
};
const lastStage: Record<PreparationState, string> = {
  activation_requesting: 'requesting app activation',
  activation_requested: 'waiting for the app to connect',
  renderer_loading: 'waiting for the app interface to initialize',
  project_navigation: 'requesting project navigation',
  target_loading: 'waiting for the configured project',
  project_loading: 'loading the selected project',
  ready: 'confirming readiness before starting the operation',
};
export const preparationPayload = (result: Exclude<DesktopReadyResult, { status: 'ready' }>) => {
  const [message, nextAction] =
    result.status === 'user_action_required' && result.reason
      ? actionMessages[result.reason]
      : failureMessages[result.status];
  return {
    status: result.status,
    message:
      result.status === 'readiness_timeout' && result.lastState
        ? `${message} Last observed stage: ${lastStage[result.lastState]}.`
        : message,
    nextAction,
    requestSent: false,
  };
};
