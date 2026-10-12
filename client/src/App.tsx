import { Route, Routes } from 'react-router'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RegisterPage } from './pages/RegisterPage'
import { StatusPage } from './pages/StatusPage'

// Every page of the app and the address it lives at. The bookmarks page is added in 7.4.
function App() {
  return (
    <Routes>
      <Route path="/" element={<StatusPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
