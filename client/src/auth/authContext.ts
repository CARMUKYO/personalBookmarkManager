import { createContext } from 'react'
import type { User } from '../api/types'

// loading: still asking the server who is logged in. anonymous: nobody is.
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthContextValue = {
  user: User | null
  status: AuthStatus
  sessionExpired: boolean // true when we were signed out because the server stopped accepting our session
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
