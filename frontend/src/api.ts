export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      const timeout = Error("The server took too long to respond. Please try again.");
      timeout.name = "TimeoutError";
      throw timeout;
    }
    throw Error("Could not reach the server. Check that the backend is running, then try again.");
  }
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw Error(
      typeof b?.detail === "string"
        ? b.detail
        : r.status >= 500
          ? "The server is temporarily unavailable. Check that the backend is running, then try again."
          : "Please check your entries and try again.",
    );
  }
  if (r.status === 204) return undefined as T;
  try {
    return await r.json();
  } catch {
    throw Error("The server returned an unreadable response. Please try again.");
  }
}
