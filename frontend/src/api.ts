export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw Error(
      typeof b.detail === "string"
        ? b.detail
        : "Please check your entries and try again.",
    );
  }
  return r.status === 204 ? undefined as T : r.json();
}
