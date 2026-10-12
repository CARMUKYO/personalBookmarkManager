import { Route, Routes } from 'react-router'
import { NotFoundPage } from './pages/NotFoundPage'
import { StatusPage } from './pages/StatusPage'

// Every page of the app and the address it lives at. Login, register and bookmarks are added in 7.2 to 7.4.
function App() {
  return (
    <Routes>
      <Route path="/" element={<StatusPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
