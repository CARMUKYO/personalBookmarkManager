import { useEffect, useState, type ReactNode } from 'react'
import * as authApi from '../api/auth'
import type { User } from '../api/types'
import { AuthContext, type AuthStatus } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  function signedIn(nextUser: User) {
    setUser(nextUser)
    setStatus('authenticated')
  }

  function signedOut() {
    setUser(null)
    setStatus('anonymous')
  }

  // On page load, ask the server who is logged in. The token is in an httpOnly cookie that
  // JavaScript cannot read, so /me is the only way to find out, and it is why a reload keeps you logged in.
  useEffect(() => {
    let ignore = false // set on cleanup, so a stale answer cannot overwrite newer state
    authApi
      .getMe()
      // If the server cannot be reached we also end up here, so the app treats that like "not logged in".
      .catch(() => null)
      .then((me) => {
        if (ignore) return
        if (me) signedIn(me)
        else signedOut()
      })
    return () => {
      ignore = true
    }
  }, [])

  async function login(email: string, password: string) {
    signedIn(await authApi.login(email, password))
  }

  async function register(email: string, password: string) {
    // Signing up does not log you in on the server, so log in right after.
    await authApi.register(email, password)
    await login(email, password)
  }

  async function logout() {
    await authApi.logout()
    signedOut()
  }

  return <AuthContext.Provider value={{ user, status, login, register, logout }}>{children}</AuthContext.Provider>
}
