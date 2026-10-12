// The only place that calls fetch. Everything else in the app goes through request().

// One entry per invalid field, e.g. { path: 'email', message: 'Invalid email' }.
export type ApiErrorDetail = { path: string; message: string }

// Thrown for every failed request, so the UI can show error.message and check error.code.
export class ApiError extends Error {
  status: number // HTTP status, or 0 when the server could not be reached
  code: string // e.g. 'VALIDATION_ERROR', 'NOT_FOUND', 'NETWORK_ERROR'
  details?: ApiErrorDetail[]

  constructor(status: number, code: string, message: string, details?: ApiErrorDetail[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// Called when the server says "not logged in" (401) to a normal request, which means the session ran out
// (or the cookie was removed) while the app was open. AuthProvider sets this so it can sign the user out.
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

// path starts after /api, e.g. request('/auth/login', ...) calls /api/auth/login.
export async function request<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      // The login token lives in an httpOnly cookie. The browser sends it for us; JavaScript never sees it.
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.')
  }

  // 204 means success with no body (used by logout and delete).
  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    // /auth/* routes answer 401 as part of their normal job (wrong password, "nobody is logged in"),
    // so only a 401 from any other route means the session ended.
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.()

    // Errors look like { error: { code, message, details? } }. Fall back to safe defaults if they do not.
    const error = data?.error
    throw new ApiError(
      res.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `Request failed with status ${res.status}`,
      error?.details,
    )
  }

  return data as T
}
