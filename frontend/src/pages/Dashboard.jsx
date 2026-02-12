import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingPage } from '../components/LoadingSpinner';

export default function Dashboard() {
  const { user, isAdmin, isSupervisor, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // Smart routing based on user role
    if (isAdmin) {
      navigate('/dashboard', { replace: true }); // SmartDashboard will render AdminDashboard
    } else if (isSupervisor) {
      navigate('/dashboard', { replace: true }); // SmartDashboard will render SupervisorDashboard
    } else {
      navigate('/dashboard', { replace: true }); // SmartDashboard will render EmployeeDashboard
    }
  }, [user, isAdmin, isSupervisor, loading, navigate]);

  if (loading) {
    return <LoadingPage />;
  }

  return <LoadingPage />; 
}