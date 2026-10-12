import { Outlet } from 'react-router'
import { TopBar } from './TopBar'

// The frame around every logged-in page. <Outlet /> is where react-router puts the current page.
export function AppLayout() {
  return (
    <>
      {/* Lets keyboard users jump past the top bar. It only appears when it has focus. */}
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <TopBar />
      <main className="page" id="main">
        <Outlet />
      </main>
    </>
  )
}
