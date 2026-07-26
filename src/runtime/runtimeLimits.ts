import { runtimeProtocolVersion } from "./runtimeProtocol";

export const runtimeLimits = {
  protocolVersion: runtimeProtocolVersion,
  maxSingleFileSourceBytes: 128 * 1024,
  maxProjectSourceBytes: 256 * 1024,
  maxStdinContentBytes: 64 * 1024,
  maxOutputBytesPerStream: 256 * 1024,
  maxCombinedOutputBytes: 512 * 1024,
  minTimeoutMs: 250,
  maxTimeoutMs: 10_000,
} as const;

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${bytes / (1024 * 1024)} MB`;
  }

  return `${bytes / 1024} KB`;
}
