import { describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './http'

// Replaces the browser's fetch with a fake that returns the given response.
function fakeFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('request', () => {
  it('calls /api + path with the same-origin cookie setting and no body for a GET', async () => {
    const fetchMock = fakeFetch(json(200, { ok: true }))

    await request('/things')

    expect(fetchMock).toHaveBeenCalledWith('/api/things', {
      method: 'GET',
      headers: undefined,
      body: undefined,
      credentials: 'same-origin',
    })
  })

  it('sends a JSON body with the right header', async () => {
    const fetchMock = fakeFetch(json(201, { ok: true }))

    await request('/things', { method: 'POST', body: { name: 'x' } })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"name":"x"}')
  })

  it('returns the parsed JSON on success', async () => {
    fakeFetch(json(200, { user: { id: 1 } }))

    expect(await request('/things')).toEqual({ user: { id: 1 } })
  })

  it('returns undefined for 204 No Content', async () => {
    fakeFetch(new Response(null, { status: 204 }))

    expect(await request('/things', { method: 'DELETE' })).toBeUndefined()
  })

  it('turns the server error shape into an ApiError', async () => {
    const details = [{ path: 'email', message: 'Invalid email' }]
    fakeFetch(json(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details } }))

    const error = await request('/auth/register', { method: 'POST', body: {} }).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Invalid request', details })
  })

  it('still produces an ApiError when the error response is not JSON', async () => {
    fakeFetch(new Response('<html>Bad gateway</html>', { status: 502 }))

    const error = await request('/things').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN_ERROR', message: 'Request failed with status 502' })
  })

  it('turns a network failure into an ApiError with code NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await request('/things').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })
})
