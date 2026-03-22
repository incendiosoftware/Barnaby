export const WORKSPACE_CONFIG_FILENAME = '.agentorchestrator.json'
export const WORKSPACE_BUNDLE_FILENAME = '.barnaby-workspace.json'
export const WORKSPACE_LOCK_DIRNAME = '.barnaby'
export const WORKSPACE_LOCK_FILENAME = 'active-token.json'
export const WORKSPACE_LOCK_HEARTBEAT_INTERVAL_MS = 5000
export const WORKSPACE_LOCK_STALE_MS = 30000
export const LEGACY_APPDATA_DIRNAME = 'Agent Orchestrator'
export const LEGACY_STORAGE_MIGRATION_MARKER = '.legacy-storage-migration-v1.json'
export const CHAT_HISTORY_STORAGE_KEY = 'agentorchestrator.chatHistory'
export const APP_STORAGE_DIRNAME = '.storage'
export const CHAT_HISTORY_FILENAME = 'chat-history.json'
export const APP_STATE_FILENAME = 'app-state.json'
export const PROVIDER_SECRETS_FILENAME = 'provider-secrets.json'
export const RUNTIME_LOG_FILENAME = 'runtime.log'
export const DEBUG_LOG_FILENAME = 'debug.log'
export const MAX_PERSISTED_CHAT_HISTORY_ENTRIES = 200
export const MAX_EXPLORER_NODES = 2500
export const MAX_FILE_PREVIEW_BYTES = 1024 * 1024
export const STARTUP_SPLASH_TIMEOUT_MS = 30000
export const EXPLORER_ALWAYS_IGNORED_DIRECTORIES = new Set([
  '.git',
  'dist',
  'dist-electron',
  'release',
  '.next',
  'out',
  '.turbo',
])
