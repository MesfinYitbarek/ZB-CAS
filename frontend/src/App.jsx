import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { LoadingPage } from './components/LoadingSpinner';

import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import Users from './pages/Users';
import UserProfile from './pages/UserProfile';
import Competencies from './pages/Competencies';
import Recommendations from './pages/Recommendations';
import Questions from './pages/Questions';
import Assessments from './pages/Assessments';
import AssessmentDetail from './pages/AssessmentDetail';
import TakeAssessment from './pages/TakeAssessment';
import Results from './pages/Results';
import Reports from './pages/Reports';
import Feedback from './pages/Feedback';
import ActivityLog from './pages/ActivityLog';

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <LoadingPage />;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" />;
  return children;
}

function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <Header onMobileToggle={() => setCollapsed(!collapsed)} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        
        {/* Main Dashboard */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <AppShell><Dashboard /></AppShell>
          </ProtectedRoute>
        } />
        
        {/* Admin Dashboard */}
        <Route path="/admin" element={
          <ProtectedRoute adminOnly>
            <AppShell><AdminDashboard /></AppShell>
          </ProtectedRoute>
        } />
        
        {/* User Management */}
        <Route path="/users" element={
          <ProtectedRoute adminOnly>
            <AppShell><Users /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/users/:id" element={
          <ProtectedRoute>
            <AppShell><UserProfile /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <AppShell><UserProfile /></AppShell>
          </ProtectedRoute>
        } />
        
        {/* Competency Management (Admin Only) */}
        <Route path="/competencies" element={
          <ProtectedRoute adminOnly>
            <AppShell><Competencies /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/recommendations" element={
          <ProtectedRoute adminOnly>
            <AppShell><Recommendations /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/questions" element={
          <ProtectedRoute adminOnly>
            <AppShell><Questions /></AppShell>
          </ProtectedRoute>
        } />
        
        {/* Assessments */}
        <Route path="/assessments" element={
          <ProtectedRoute>
            <AppShell><Assessments /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/assessments/:id" element={
          <ProtectedRoute>
            <AppShell><AssessmentDetail /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/assessments/:assessmentId/take" element={
          <ProtectedRoute>
            <TakeAssessment />
          </ProtectedRoute>
        } />
        
        {/* Results & Reports */}
        <Route path="/results" element={
          <ProtectedRoute>
            <AppShell><Results /></AppShell>
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute>
            <AppShell><Reports /></AppShell>
          </ProtectedRoute>
        } />
        
        {/* Feedback */}
        <Route path="/feedback" element={
          <ProtectedRoute>
            <AppShell><Feedback /></AppShell>
          </ProtectedRoute>
        } />
        
        {/* Activity Log (Admin Only) */}
        <Route path="/activity-log" element={
          <ProtectedRoute adminOnly>
            <AppShell><ActivityLog /></AppShell>
          </ProtectedRoute>
        } />
        
        {/* Profile - always points to current user */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <AppShell>
              <UserProfile />
            </AppShell>
          </ProtectedRoute>
        } />
        
        {/* 404 - Redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}
