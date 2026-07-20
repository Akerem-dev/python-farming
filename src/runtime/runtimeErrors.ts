export class RuntimeUnavailableError extends Error {
  readonly code = "RUNTIME_UNAVAILABLE";

  constructor(message = "Python çalışma motoru henüz başlatılmadı.") {
    super(message);
    this.name = "RuntimeUnavailableError";
  }
}

export class RuntimeProtocolError extends Error {
  readonly code = "RUNTIME_PROTOCOL_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RuntimeProtocolError";
  }
}
