import { ApiError, request } from './http'
import type { User } from './types'

export async function register(email: string, password: string): Promise<User> {
  const data = await request<{ user: User }>('/auth/register', { method: 'POST', body: { email, password } })
  return data.user
}

export async function login(email: string, password: string): Promise<User> {
  const data = await request<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } })
  return data.user
}

export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' })
}

// Asks the server who is logged in. Returns null when nobody is (a 401 is a normal answer, not an error).
export async function getMe(): Promise<User | null> {
  try {
    const data = await request<{ user: User }>('/auth/me')
    return data.user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}
