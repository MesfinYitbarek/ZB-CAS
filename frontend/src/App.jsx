/* App.jsx
 * PERFORMANCE: All page-level components are now loaded via React.lazy() so
 * Vite splits them into separate chunks. The browser only downloads a chunk
 * when the user first navigates to that route, dramatically reducing the
 * initial JS bundle that must be parsed on first load.
 *
 * A shared <PageSuspense> wrapper shows a consistent loading spinner while
 * any lazy chunk is being fetched.
 */
import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { LoadingPage } from './components/LoadingSpinner';
import SupportWidget from './components/SupportWidget';
import SocketProvider from './context/SocketContext';

// ── Eager-loaded: Auth pages are tiny and needed before the app shell renders
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';

// ── Lazy-loaded: every page below becomes its own JS chunk ──────────────────
// Dashboards
const Dashboard           = lazy(() => import('./pages/Dashboard'));
const AdminDashboard      = lazy(() => import('./pages/AdminDashboard'));
const SupervisorDashboard = lazy(() => import('./pages/SupervisorDashboard'));
const EmployeeDashboard   = lazy(() => import('./pages/EmployeeDashboard'));

// User Management
const Users       = lazy(() => import('./pages/Users'));
const UserProfile = lazy(() => import('./pages/UserProfile'));

// Competency Management
const Competencies    = lazy(() => import('./pages/Competencies'));
const Recommendations = lazy(() => import('./pages/Recommendations'));
const Questions       = lazy(() => import('./pages/Questions'));

// Assessments
const Assessments          = lazy(() => import('./pages/Assessments'));
const AssessmentDetail     = lazy(() => import('./pages/AssessmentDetail'));
const AssessmentRequests   = lazy(() => import('./pages/AssessmentRequests'));
const TakeAssessment       = lazy(() => import('./pages/TakeAssessment'));
const SupervisorEvaluation = lazy(() => import('./pages/SupervisorEvaluation'));

// Results & Reports
const Results    = lazy(() => import('./pages/Results'));
const ResultDetail = lazy(() => import('./pages/ResultDetail'));
const ReportsLayout   = lazy(() => import('./pages/ReportsLayout'));
const ReportsOverview  = lazy(() => import('./pages/reports/analytics/OverviewPage'));
const ReportsDepartment = lazy(() => import('./pages/reports/analytics/DepartmentPage'));
const ReportsCompetency = lazy(() => import('./pages/reports/analytics/CompetencyPage'));
const ReportsGenerated = lazy(() => import('./pages/reports/generated/GeneratedPage'));
const Feedback   = lazy(() => import('./pages/Feedback'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const FAQs = lazy(() => import('./pages/FAQs'));

// Supervisor Pages
const MyTeam             = lazy(() => import('./pages/MyTeam'));
const PendingEvaluations = lazy(() => import('./pages/PendingEvaluations'));

// User Manual
const UserManual = lazy(() => import('./pages/UserManual'));

// ── Suspense wrapper ─────────────────────────────────────────────────────────
// Wraps every lazy route so a consistent spinner appears while chunks load.
function PageSuspense({ children }) {
  return <Suspense fallback={<LoadingPage />}>{children}</Suspense>;
}


/* =========================================================
   Protected Route
   - adminOnly      → activeRole must be HR_ADMIN
   - supervisorOnly → activeRole must be SUPERVISOR
   - allowedRoles   → activeRole must be in the list
========================================================= */
function ProtectedRoute({ children, adminOnly, supervisorOnly, allowedRoles }) {
  const { user, loading, activeRole } = useAuth();

  if (loading) return <LoadingPage />;
  if (!user)   return <Navigate to="/login" replace />;

  if (adminOnly && activeRole !== 'HR_ADMIN')
    return <Navigate to="/dashboard" replace />;

  if (supervisorOnly && activeRole !== 'SUPERVISOR')
    return <Navigate to="/dashboard" replace />;

  if (allowedRoles && !allowedRoles.includes(activeRole))
    return <Navigate to="/dashboard" replace />;

  return children;
}


/* =========================================================
   App Shell Layout
========================================================= */
function AppShell({ children }) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);

  return (
    <SocketProvider>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((p) => !p)}
          mobileOpen={mobileOpen}
          onNavClick={() => setMobileOpen(false)}
          onMobileClose={() => setMobileOpen(false)}
        />

        <div
          className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
            collapsed ? 'lg:ml-[65px]' : 'lg:ml-[220px]'
          }`}
        >
          <Header onMobileToggle={() => setMobileOpen((p) => !p)} />

          <main className="flex-1">{children}</main>

          <SupportWidget />
        </div>
      </div>
    </SocketProvider>
  );
}


/* =========================================================
   Smart Dashboard – renders the correct dashboard based on
   the user's current activeRole
========================================================= */
function SmartDashboard() {
  const { activeRole } = useAuth();

  if (activeRole === 'HR_ADMIN')   return <AdminDashboard />;
  if (activeRole === 'SUPERVISOR') return <SupervisorDashboard />;
  if (activeRole === 'EMPLOYEE')   return <EmployeeDashboard />;

  return <Dashboard />;
}


/* =========================================================
   Main App
========================================================= */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />


        {/* ── Dashboard ─────────────────────────────────────────────────── */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><SmartDashboard /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />

        {/* Admin dashboard (direct URL access) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><PageSuspense><AdminDashboard /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />

        {/* Supervisor dashboard (direct URL access) */}
        <Route
          path="/supervisor"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell><PageSuspense><SupervisorDashboard /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />

        {/* Supervisor evaluation (no AppShell – full-page) */}
        <Route
          path="/assessments/:assessmentId/evaluate"
          element={
            <ProtectedRoute allowedRoles={['SUPERVISOR']}>
              <PageSuspense><SupervisorEvaluation /></PageSuspense>
            </ProtectedRoute>
          }
        />


        {/* ── Assessment Requests (from ZB_SP) ────────────────────────── */}
        <Route
          path="/assessment-requests"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><PageSuspense><AssessmentRequests /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />

         {/* ── Users ─────────────────────────────────────────────────────── */}
        <Route
          path="/users"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><PageSuspense><Users /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:id"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><UserProfile /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><UserProfile /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />


        {/* ── Competencies ──────────────────────────────────────────────── */}
        <Route
          path="/competencies"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><PageSuspense><Competencies /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/recommendations"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><PageSuspense><Recommendations /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/questions"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><PageSuspense><Questions /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />


        {/* ── Assessments ───────────────────────────────────────────────── */}
        <Route
          path="/assessments"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><Assessments /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessments/:id"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><AssessmentDetail /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessments/:assessmentId/take"
          element={
            <ProtectedRoute>
              <PageSuspense><TakeAssessment /></PageSuspense>
            </ProtectedRoute>
          }
        />


        {/* ── Results / Reports / Feedback ──────────────────────────────── */}
        <Route
          path="/results"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><Results /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/results/:id"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><ResultDetail /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><ReportsLayout /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        >
          <Route index element={<PageSuspense><ReportsOverview /></PageSuspense>} />
          <Route path="overview" element={<PageSuspense><ReportsOverview /></PageSuspense>} />
          <Route path="department" element={<PageSuspense><ReportsDepartment /></PageSuspense>} />
          <Route path="competency" element={<PageSuspense><ReportsCompetency /></PageSuspense>} />
          <Route path="generated" element={<PageSuspense><ReportsGenerated /></PageSuspense>} />
        </Route>
        <Route
          path="/feedback"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><Feedback /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />


        {/* ── Activity Log ──────────────────────────────────────────────── */}
        <Route
          path="/activity-log"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><PageSuspense><ActivityLog /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />

        {/* ── FAQ Management ─────────────────────────────────────────────── */}
        <Route
          path="/faqs"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><PageSuspense><FAQs /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />



        {/* ── Supervisor ────────────────────────────────────────────────── */}
        <Route
          path="/my-team"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell><PageSuspense><MyTeam /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluations"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell><PageSuspense><PendingEvaluations /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />


        {/* 404 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

        {/* ── User Manual (all roles) ────────────────────────────────── */}
        <Route
          path="/manual"
          element={
            <ProtectedRoute>
              <AppShell><PageSuspense><UserManual /></PageSuspense></AppShell>
            </ProtectedRoute>
          }
        />

      </Routes>
    </BrowserRouter>
  );
}