let csrfToken:string|null=null;
export function setCsrfToken(value:string|null){csrfToken=value;}
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let r: Response;
  const headers=new Headers(options?.headers);
  if(csrfToken&&!['GET','HEAD','OPTIONS'].includes((options?.method??'GET').toUpperCase()))headers.set('X-CSRF-Token',csrfToken);
  try {
    r = await fetch(path, {
      ...options,
      credentials:'same-origin',
      headers,
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
    if(r.status===401&&!path.endsWith('/auth/login')&&!path.endsWith('/auth/session'))window.dispatchEvent(new Event('sdss-auth-required'));
    throw new ApiError(
      typeof b?.detail === "string"
        ? b.detail
        : r.status >= 500
          ? "The server is temporarily unavailable. Check that the backend is running, then try again."
          : "Please check your entries and try again.",
      r.status,
    );
  }
  if(!['GET','HEAD','OPTIONS'].includes((options?.method??'GET').toUpperCase()))window.dispatchEvent(new Event('sdss-data-changed'));
  if (r.status === 204) return undefined as T;
  try {
    return await r.json();
  } catch {
    throw Error("The server returned an unreadable response. Please try again.");
  }
}
