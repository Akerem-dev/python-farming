export const runtimeLimits = {
  protocolVersion: 1,
  maxSourceBytes: 128 * 1024,
  maxStdinBytes: 64 * 1024,
  maxOutputBytes: 256 * 1024,
  minTimeoutMs: 250,
  maxTimeoutMs: 10_000,
} as const;

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${bytes / (1024 * 1024)} MB`;
  }

  return `${bytes / 1024} KB`;
}
