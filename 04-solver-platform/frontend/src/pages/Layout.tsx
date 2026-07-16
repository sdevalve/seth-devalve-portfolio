import { Outlet } from 'react-router-dom'
import NavBar from '@/components/NavBar'

const Layout = () => (
  <div className="min-h-screen bg-slate-50">
    <NavBar />
    <main className="max-w-screen-2xl mx-auto px-4 py-6">
      <Outlet />
    </main>
  </div>
)

export default Layout
