// Small fetch wrapper for the Adlogues Billing API. Errors carry the server's message.
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is it running?')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok && (res.status === 502 || res.status === 504) && !(data as { error?: string }).error) {
    // The dev proxy answers 502 when the API server isn't running
    throw new ApiError(res.status, 'Cannot reach the API server. Run "npm run dev" and check the [api] lines in the terminal.')
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('adl:signed-out'))
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`)
  }
  return data as T
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')
