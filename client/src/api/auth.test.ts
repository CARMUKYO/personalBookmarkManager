import { describe, expect, it, vi } from 'vitest'
import { getMe, login, logout, register } from './auth'

const user = { id: 1, email: 'a@example.com', createdAt: '2024-01-01T00:00:00.000Z' }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fakeFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('auth api', () => {
  it('login posts the credentials and returns the user', async () => {
    const fetchMock = fakeFetch(json(200, { user }))

    expect(await login('a@example.com', 'secret123')).toEqual(user)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'a@example.com', password: 'secret123' })
  })

  it('register posts the credentials and returns the user', async () => {
    const fetchMock = fakeFetch(json(201, { user }))

    expect(await register('a@example.com', 'secret123')).toEqual(user)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/register')
  })

  it('logout posts to /auth/logout', async () => {
    const fetchMock = fakeFetch(new Response(null, { status: 204 }))

    await expect(logout()).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/logout')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })

  it('getMe returns the user when logged in', async () => {
    fakeFetch(json(200, { user }))

    expect(await getMe()).toEqual(user)
  })

  it('getMe returns null on a 401, because "nobody is logged in" is a normal answer', async () => {
    fakeFetch(json(401, { error: { code: 'UNAUTHORIZED', message: 'Not logged in' } }))

    expect(await getMe()).toBeNull()
  })

  it('getMe still throws for other failures', async () => {
    fakeFetch(json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }))

    await expect(getMe()).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' })
  })
})
