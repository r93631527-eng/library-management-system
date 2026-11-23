import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell, Toast } from './components/Layout'
import { useApp } from './context/useApp'

const RoleSelectionPage = lazy(() => import('./pages/AuthPages').then((pages) => ({ default: pages.RoleSelectionPage })))
const WelcomePage = lazy(() => import('./pages/AuthPages').then((pages) => ({ default: pages.WelcomePage })))
const RoleAuthPage = lazy(() => import('./pages/AuthPages').then((pages) => ({ default: pages.RoleAuthPage })))
const LoginPage = lazy(() => import('./pages/AuthPages').then((pages) => ({ default: pages.LoginPage })))
const RegisterPage = lazy(() => import('./pages/AuthPages').then((pages) => ({ default: pages.RegisterPage })))
const AdminSetupPage = lazy(() => import('./pages/AuthPages').then((pages) => ({ default: pages.AdminSetupPage })))
const AdminRecoveryPage = lazy(() => import('./pages/AuthPages').then((pages) => ({ default: pages.AdminRecoveryPage })))
const AdminDashboard = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.AdminDashboard })))
const CategoriesSubjectsPage = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.CategoriesSubjectsPage })))
const IssueReturnPage = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.IssueReturnPage })))
const ManageBooks = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.ManageBooks })))
const ManageLibrariansPage = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.ManageLibrariansPage })))
const ManageResources = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.ManageResources })))
const ManageStudents = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.ManageStudents })))
const NotificationsPage = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.NotificationsPage })))
const ReportsPage = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.ReportsPage })))
const SettingsPage = lazy(() => import('./pages/AdminPages').then((pages) => ({ default: pages.SettingsPage })))
const BooksCatalog = lazy(() => import('./pages/StudentPages').then((pages) => ({ default: pages.BooksCatalog })))
const DigitalSearchPage = lazy(() => import('./pages/StudentPages').then((pages) => ({ default: pages.DigitalSearchPage })))
const MyBooks = lazy(() => import('./pages/StudentPages').then((pages) => ({ default: pages.MyBooks })))
const ResourcesPage = lazy(() => import('./pages/StudentPages').then((pages) => ({ default: pages.ResourcesPage })))
const AiSummarizerPage = lazy(() => import('./pages/StudentPages').then((pages) => ({ default: pages.AiSummarizerPage })))
const StudentDashboard = lazy(() => import('./pages/StudentPages').then((pages) => ({ default: pages.StudentDashboard })))

function PageLoading() {
  return <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">Loading library page...</div>
}

function ProtectedRoute() {
  const { user, ready } = useApp()
  const location = useLocation()
  if (!ready) return <div className="p-8 text-sm text-muted">Connecting to the library...</div>
  return user ? <AppShell /> : <Navigate to="/" replace state={{ from: location }} />
}

function StudentRoute({ children }) {
  const { user } = useApp()
  return user?.role === 'admin' ? <Navigate to="/admin" replace /> : children ?? <StudentDashboard />
}

function AdminRoute({ children }) {
  const { user } = useApp()
  return user?.role === 'admin' ? children : <Navigate to={user ? '/student' : '/'} replace />
}

function ResourceEditorRoute() {
  const { user } = useApp()
  return user?.role === 'admin' || user?.canManageResources
    ? <ManageResources />
    : <Navigate to="/student/resources" replace />
}

function RegistrationRoute() {
  const { role } = useParams()
  if (role === 'student') return <RegisterPage />
  if (role === 'admin') return <AdminSetupPage />
  return <Navigate to="/" replace />
}

function AppRoutes() {
  const { user, ready, apiError, refresh } = useApp()
  const [welcomeOpen, setWelcomeOpen] = useState(() => !window.sessionStorage.getItem('libraai-welcome-seen'))
  const [roleSelectionAfterWelcome, setRoleSelectionAfterWelcome] = useState(false)
  if (welcomeOpen) return <Suspense fallback={<PageLoading />}><WelcomePage onContinue={() => {
    window.sessionStorage.setItem('libraai-welcome-seen', 'true')
    setRoleSelectionAfterWelcome(true)
    setWelcomeOpen(false)
  }} /></Suspense>
  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">Connecting to LibraAI...</div>
  if (apiError) return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-5 text-center"><h1 className="font-display text-xl font-semibold">Library server unavailable</h1><p className="max-w-md text-sm text-muted">{apiError}</p><button className="button button-primary" onClick={() => refresh().catch(() => undefined)}>Try again</button></main>
  return <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={<RoleSelectionPage showForSignedIn={roleSelectionAfterWelcome} />} />
      <Route path="/auth/:role" element={<RoleAuthPage />} />
      <Route path="/login/:role" element={<LoginPage />} />
      <Route path="/register/:role" element={<RegistrationRoute />} />
      <Route path="/reset-librarian" element={<AdminRecoveryPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/student" element={<StudentRoute />} />
        <Route path="/student/search" element={<DigitalSearchPage />} />
        <Route path="/student/books" element={<BooksCatalog />} />
        <Route path="/student/my-books" element={<MyBooks />} />
        <Route path="/student/resources" element={<ResourcesPage />} />
        <Route path="/ai-summarizer" element={<AiSummarizerPage />} />
        <Route path="/student/ai-summarizer" element={<Navigate to="/ai-summarizer" replace />} />
        <Route path="/student/manage-resources" element={<ResourceEditorRoute />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/books" element={<AdminRoute><ManageBooks /></AdminRoute>} />
        <Route path="/admin/issues" element={<AdminRoute><IssueReturnPage /></AdminRoute>} />
        <Route path="/admin/resources" element={<AdminRoute><ManageResources /></AdminRoute>} />
        <Route path="/admin/students" element={<AdminRoute><ManageStudents /></AdminRoute>} />
        <Route path="/admin/librarians" element={<AdminRoute><ManageLibrariansPage /></AdminRoute>} />
        <Route path="/admin/catalog" element={<AdminRoute><CategoriesSubjectsPage /></AdminRoute>} />
        <Route path="/admin/reports" element={<AdminRoute><ReportsPage /></AdminRoute>} />
        <Route path="/admin/notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="*" element={<Navigate to={user?.role === 'admin' ? '/admin' : '/student'} replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <Toast />
  </Suspense>
}

export default function App() {
  return <AppRoutes />
}
