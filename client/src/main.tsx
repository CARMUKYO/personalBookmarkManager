import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* BrowserRouter keeps the page in sync with the address bar, so links and the Back button work without reloads. */}
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
