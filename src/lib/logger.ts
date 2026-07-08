type LogLevel = "debug" | "info" | "warn" | "error";

const COLORS: Record<LogLevel, string> = {
  debug: "#7c8ba0",
  info: "#6bb3f0",
  warn: "#f0b86b",
  error: "#f06b6b",
};

function timestamp(): string {
  return new Date().toISOString().split("T")[1]?.slice(0, 12) ?? "";
}

function createLogger(name: string) {
  const enabled = true;

  function log(level: LogLevel, msg: string, data?: unknown) {
    if (!enabled) return;
    const style = `color:${COLORS[level]};font-weight:600`;
    const prefix = `%c[${timestamp()}] [${name}]`;
    if (data !== undefined) {
      console.log(`${prefix} ${msg}`, style, data);
    } else {
      console.log(`${prefix} ${msg}`, style);
    }
  }

  return {
    debug: (msg: string, data?: unknown) => log("debug", msg, data),
    info: (msg: string, data?: unknown) => log("info", msg, data),
    warn: (msg: string, data?: unknown) => log("warn", msg, data),
    error: (msg: string, data?: unknown) => log("error", msg, data),
  };
}

export const log = {
  app: createLogger("app"),
  library: createLogger("library"),
  reader: createLogger("reader"),
  toolbar: createLogger("toolbar"),
  annotations: createLogger("annotations"),
  highlight: createLogger("highlight"),
  store: createLogger("store"),
  pdf: createLogger("pdf"),
  ai: createLogger("ai"),
  narrator: createLogger("narrator"),
  explore: createLogger("explore"),
};
