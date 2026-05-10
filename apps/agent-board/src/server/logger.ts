type LogLevel = "info" | "warn" | "error" | "debug";

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields
  };
  console.log(JSON.stringify(line));
}

export async function time<T>(
  event: string,
  fields: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now();
  log("debug", `${event}.start`, fields);

  try {
    const result = await fn();
    log("info", `${event}.ok`, {
      ...fields,
      durationMs: Math.round(performance.now() - startedAt)
    });
    return result;
  } catch (error) {
    log("error", `${event}.error`, {
      ...fields,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
