import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList,
    TrendingUp,
    Award,
    Target,
    Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

export default function EmployeeDashboard() {
    const { user } = useAuth();
    const nav = useNavigate();
    const { showToast } = useToast();

    const [stats, setStats] = useState({
        pendingAssessments: 0,
        completedAssessments: 0,
        totalAssessments: 0,
        avgScore: 0,
        competenciesAssessed: 0
    });

    const [loading, setLoading] = useState(true);
    const [assessments, setAssessments] = useState([]);

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        try {
            // Fetch dashboard stats and assessments in parallel
            const [dashRes, assessRes] = await Promise.all([
                api.get('/dashboard/employee'),
                api.get('/assessments/active')
            ]);

            const data = dashRes.data.data;
            setStats(data.stats);

            setAssessments(assessRes.data.data.assessments || []);
        } catch (err) {
            console.error('Failed to load employee dashboard:', err);
            showToast('Failed to load dashboard. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Separate assessments by status (USED FOR KPI COUNTS)
    const scheduledAssessments = assessments.filter(
        a => a.status === 'SCHEDULED'
    );

    const activeAssessments = assessments.filter(
        a => a.status === 'ACTIVE'
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-7 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-display font-bold text-brand-black">
                        Welcome back, {user?.name?.split(' ')[0]} 👋
                    </h1>
                    <p className="text-gray-500 mt-1">
                        {user?.position || 'Employee'} · {user?.department || 'Department'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-brand-red/10 rounded-lg">
                        <span className="text-sm font-semibold text-brand-red">
                            Employee ID: {user?.employeeId}
                        </span>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Pending Assessments */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                            <ClipboardList className="w-6 h-6 text-blue-600" />
                        </div>
                        <TrendingUp className="w-4 h-4 text-green-500 ml-auto" />
                    </div>

                    <div className="text-3xl font-display font-bold text-brand-black mb-1">
                        {stats.pendingAssessments}
                    </div>

                    <div className="text-sm font-semibold text-gray-700">
                        Pending Assessments
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                        {stats.completedAssessments} completed
                    </div>
                </div>

                {/* Average Score */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                            <Award className="w-6 h-6 text-green-600" />
                        </div>
                    </div>

                    <div className="text-3xl font-display font-bold text-brand-black mb-1">
                        {stats.avgScore}%
                    </div>

                    <div className="text-sm font-semibold text-gray-700">
                        Average Score
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                        Across {stats.competenciesAssessed} competencies
                    </div>
                </div>

                {/* Competencies */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                            <Target className="w-6 h-6 text-purple-600" />
                        </div>
                    </div>

                    <div className="text-3xl font-display font-bold text-brand-black mb-1">
                        {stats.competenciesAssessed}
                    </div>

                    <div className="text-sm font-semibold text-gray-700">
                        Competencies Assessed
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                        {stats.totalAssessments} total assessments
                    </div>
                </div>

                {/* Scheduled Count Card */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-orange-600" />
                        </div>
                    </div>

                    <div className="text-3xl font-display font-bold text-brand-black mb-1">
                        {scheduledAssessments.length}
                    </div>

                    <div className="text-sm font-semibold text-gray-700">
                        Upcoming Scheduled
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                        {activeAssessments.length} active now
                    </div>
                </div>
            </div>
        </div>
    );
}