import type { ReactNode } from 'react'
import { Brand } from './Brand'

type AuthLayoutProps = {
  title: string
  lede: string // one short line under the title
  children: ReactNode
}

// The shared frame of the sign-in and create-account pages: logo at the top, a narrow centred column below.
export function AuthLayout({ title, lede, children }: AuthLayoutProps) {
  return (
    <div className="simple-page auth">
      <header>
        <Brand />
      </header>
      <main>
        <div className="content">
          <div>
            <h1>{title}</h1>
            <p className="lede">{lede}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
