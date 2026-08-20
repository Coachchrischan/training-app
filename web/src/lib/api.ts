// The single persistence seam. Every feature talks to the server through this;
// no feature localStorage anywhere (zone rule, inherited from the TAC tool).

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => call<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => call<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => call<T>('DELETE', path, body),
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return iso(d)
}

export function todayIso(): string {
  return iso(new Date())
}

export function mondayOf(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return iso(d)
}

export function fmtDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}
