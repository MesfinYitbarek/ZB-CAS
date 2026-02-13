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
import TeamResults from './pages/TeamResults';
import SupervisorEvaluation from './pages/SupervisorEvaluation';
import EmployeeDashboard from './pages/EmployeeDashboard';


/* =========================================================
   Protected Route
========================================================= */

function ProtectedRoute({ children, adminOnly, supervisorOnly }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) return <LoadingPage />;

  if (!user) return <Navigate to="/login" replace />;

  if (adminOnly && !isAdmin)
    return <Navigate to="/dashboard" replace />;

  if (supervisorOnly && user.role !== 'SUPERVISOR')
    return <Navigate to="/dashboard" replace />;

  return children;
}


/* =========================================================
   App Shell Layout (FIXED MOBILE MENU SUPPORT)
========================================================= */

function AppShell({ children }) {

  // Desktop collapse state
  const [collapsed, setCollapsed] = useState(false);

  // Mobile open state (THIS FIXES YOUR ISSUE)
  const [mobileOpen, setMobileOpen] = useState(false);


  const toggleCollapsed = () => {
    setCollapsed(prev => !prev);
  };

  const toggleMobile = () => {
    setMobileOpen(prev => !prev);
  };

  const closeMobile = () => {
    setMobileOpen(false);
  };


  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onNavClick={closeMobile}
        onMobileClose={closeMobile}
      />


      {/* Main content */}
      <div
        className={`
          flex-1 flex flex-col min-w-0 transition-all duration-200
          ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}
        `}
      >

        {/* Header */}
        <Header onMobileToggle={toggleMobile} />


        {/* Page Content */}
        <main className="flex-1">
          {children}
        </main>

      </div>

    </div>
  );
}



/* =========================================================
   Smart Dashboard Routing
========================================================= */

function SmartDashboard() {

  const { user } = useAuth();

  if (user.role === 'HR_ADMIN')
    return <AdminDashboard />;

  if (user.role === 'SUPERVISOR')
    return <SupervisorDashboard />;
  
  if (user.role === 'EMPLOYEE')
    return <EmployeeDashboard />;

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

        <Route
          path="/reset-password/:token"
          element={<ResetPassword />}
        />

        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />


        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppShell>
                <SmartDashboard />
              </AppShell>
            </ProtectedRoute>
          }
        />


        {/* Admin Dashboard */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AppShell>
                <AdminDashboard />
              </AppShell>
            </ProtectedRoute>
          }
        />


        {/* Supervisor Dashboard */}
        <Route
          path="/supervisor"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell>
                <SupervisorDashboard />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessments/:assessmentId/evaluate"
          element={
            <ProtectedRoute allowedRoles={['SUPERVISOR']}>
              <SupervisorEvaluation />
            </ProtectedRoute>
          }
        />

        {/* Users */}
        <Route
          path="/users"
          element={
            <ProtectedRoute adminOnly>
              <AppShell>
                <Users />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/users/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <UserProfile />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppShell>
                <UserProfile />
              </AppShell>
            </ProtectedRoute>
          }
        />


        {/* Competencies */}
        <Route
          path="/competencies"
          element={
            <ProtectedRoute adminOnly>
              <AppShell>
                <Competencies />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/recommendations"
          element={
            <ProtectedRoute adminOnly>
              <AppShell>
                <Recommendations />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/questions"
          element={
            <ProtectedRoute adminOnly>
              <AppShell>
                <Questions />
              </AppShell>
            </ProtectedRoute>
          }
        />


        {/* Assessments */}
        <Route
          path="/assessments"
          element={
            <ProtectedRoute>
              <AppShell>
                <Assessments />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/assessments/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <AssessmentDetail />
              </AppShell>
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


        {/* Results */}
        <Route
          path="/results"
          element={
            <ProtectedRoute>
              <AppShell>
                <Results />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Reports */}
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <AppShell>
                <Reports />
              </AppShell>
            </ProtectedRoute>
          }
        />


        {/* Feedback */}
        <Route
          path="/feedback"
          element={
            <ProtectedRoute>
              <AppShell>
                <Feedback />
              </AppShell>
            </ProtectedRoute>
          }
        />


        {/* Activity Log */}
        <Route
          path="/activity-log"
          element={
            <ProtectedRoute adminOnly>
              <AppShell>
                <ActivityLog />
              </AppShell>
            </ProtectedRoute>
          }
        />


        {/* Supervisor */}
        <Route
          path="/my-team"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell>
                <MyTeam />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-team/evaluations"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell>
                <PendingEvaluations />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-team/results"
          element={
            <ProtectedRoute supervisorOnly>
              <AppShell>
                <TeamResults />
              </AppShell>
            </ProtectedRoute>
          }
        />



        {/* 404 */}
        <Route
          path="*"
          element={<Navigate to="/dashboard" replace />}
        />

      </Routes>

    </BrowserRouter>

  );

}
