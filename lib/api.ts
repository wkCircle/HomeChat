export async function apiFetch(pathOrUrl: string, options: RequestInit = {}): Promise<Response> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${process.env.NEXT_PUBLIC_BACKEND_URL}${pathOrUrl}`;
  // gets credentials from input or defaults to 'include' to support cookie-based sessions by default
  // then override the setting into `opts`.
  const creds: RequestCredentials = (options.credentials as RequestCredentials) ?? 'include';
  const opts: RequestInit = { ...options, credentials: creds };

  let response = await fetch(url, opts);
  if (response.status !== 401) return response;

  // Try to refresh the session once
  try {
    const refreshRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/refresh`, { method: 'POST', credentials: creds });
    if (refreshRes.ok) {
      // retry original request
      response = await fetch(url, opts);
      return response;
    }
  } catch {
    // noop
  }

  // If refresh failed, redirect to login
  if (typeof window !== 'undefined') window.location.href = '/login?expired=1';
  return response;
}

export default apiFetch;
