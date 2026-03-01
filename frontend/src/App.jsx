/* App.jsx */
import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { LoadingPage } from './components/LoadingSpinner';

// Auth Pages
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';

// Dashboards
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import SupervisorDashboard from './pages/SupervisorDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';

// User Management
import Users from './pages/Users';
import UserProfile from './pages/UserProfile';

// Competency Management
import Competencies from './pages/Competencies';
import Recommendations from './pages/Recommendations';
import Questions from './pages/Questions';

// Assessments
import Assessments from './pages/Assessments';
import AssessmentDetail from './pages/AssessmentDetail';
import TakeAssessment from './pages/TakeAssessment';

// Results & Reports
import Results from './pages/Results';
import Reports from './pages/Reports';
import Feedback from './pages/Feedback';
import ActivityLog from './pages/ActivityLog';

// Supervisor Pages
import MyTeam from './pages/MyTeam';
import PendingEvaluations from './pages/PendingEvaluations';
import SupervisorEvaluation from './pages/SupervisorEvaluation';


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
          collapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        <Header onMobileToggle={() => setMobileOpen((p) => !p)} />

        <main className="flex-1">{children}</main>
      </div>
    </div>
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
              <AppShell><SmartDashboard /></AppShell>
            </ProtectedRoute>
          }
        />

        {/* Admin dashboard (direct URL access) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><AdminDashboard /></AppShell>
            </ProtectedRoute>
          }
        />

        {/* Supervisor dashboard (direct URL access) */}
        <Route
          path="/supervisor"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell><SupervisorDashboard /></AppShell>
            </ProtectedRoute>
          }
        />

        {/* Supervisor evaluation (no AppShell – full-page) */}
        <Route
          path="/assessments/:assessmentId/evaluate"
          element={
            <ProtectedRoute allowedRoles={['SUPERVISOR']}>
              <SupervisorEvaluation />
            </ProtectedRoute>
          }
        />


        {/* ── Users ─────────────────────────────────────────────────────── */}
        <Route
          path="/users"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><Users /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:id"
          element={
            <ProtectedRoute>
              <AppShell><UserProfile /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppShell><UserProfile /></AppShell>
            </ProtectedRoute>
          }
        />


        {/* ── Competencies ──────────────────────────────────────────────── */}
        <Route
          path="/competencies"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><Competencies /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/recommendations"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><Recommendations /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/questions"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><Questions /></AppShell>
            </ProtectedRoute>
          }
        />


        {/* ── Assessments ───────────────────────────────────────────────── */}
        <Route
          path="/assessments"
          element={
            <ProtectedRoute>
              <AppShell><Assessments /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessments/:id"
          element={
            <ProtectedRoute>
              <AppShell><AssessmentDetail /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessments/:assessmentId/take"
          element={
            <ProtectedRoute>
              <TakeAssessment />
            </ProtectedRoute>
          }
        />


        {/* ── Results / Reports / Feedback ──────────────────────────────── */}
        <Route
          path="/results"
          element={
            <ProtectedRoute>
              <AppShell><Results /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <AppShell><Reports /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/feedback"
          element={
            <ProtectedRoute>
              <AppShell><Feedback /></AppShell>
            </ProtectedRoute>
          }
        />


        {/* ── Activity Log ──────────────────────────────────────────────── */}
        <Route
          path="/activity-log"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><ActivityLog /></AppShell>
            </ProtectedRoute>
          }
        />


        {/* ── Supervisor ────────────────────────────────────────────────── */}
        <Route
          path="/my-team"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell><MyTeam /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluations"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell><PendingEvaluations /></AppShell>
            </ProtectedRoute>
          }
        />


        {/* 404 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

      </Routes>
    </BrowserRouter>
  );
}
