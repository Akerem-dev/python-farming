import type { RuntimeEvent } from "./runtimeEvents";
import { RuntimeUnavailableError } from "./runtimeErrors";
import type { RuntimeRequest, RuntimeResponse } from "./runtimeProtocol";

type RuntimeEventListener = (event: RuntimeEvent) => void;

export interface RuntimeClient {
  send<TPayload = unknown>(request: RuntimeRequest): Promise<RuntimeResponse<TPayload>>;
  subscribe(listener: RuntimeEventListener): () => void;
}

class UnavailableRuntimeClient implements RuntimeClient {
  private readonly listeners = new Set<RuntimeEventListener>();

  async send<TPayload = unknown>(_request: RuntimeRequest): Promise<RuntimeResponse<TPayload>> {
    throw new RuntimeUnavailableError();
  }

  subscribe(listener: RuntimeEventListener) {
    this.listeners.add(listener);
    listener({ type: "runtime_status", status: "offline" });

    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const runtimeClient: RuntimeClient = new UnavailableRuntimeClient();
