import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList,
    TrendingUp,
    Award,
    Target,
    Calendar,
    ChevronRight,
    Clock,
    Play,
    Eye
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

    const [nextDeadline, setNextDeadline] = useState(null);
    const [loading, setLoading] = useState(true);

    // ── NEW: assessments state (both SCHEDULED and ACTIVE) ──────────────────
    const [assessments, setAssessments] = useState([]);

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        try {
            // Fetch dashboard stats and assessments in parallel
            const [dashRes, assessRes] = await Promise.all([
                api.get('/dashboard/employee'),
                api.get('/assessments/active')    // now returns SCHEDULED + ACTIVE
            ]);

            const data = dashRes.data.data;
            setStats(data.stats);
            setNextDeadline(data.nextDeadline);

            // Set assessments from the active endpoint
            setAssessments(assessRes.data.data.assessments || []);
        } catch (err) {
            console.error('Failed to load employee dashboard:', err);
            showToast('Failed to load dashboard. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // ── Separate assessments by status ──────────────────────────────────────
    const scheduledAssessments = assessments.filter(a => a.status === 'SCHEDULED');
    const activeAssessments = assessments.filter(a => a.status === 'ACTIVE');

    // ── Helpers ─────────────────────────────────────────────────────────────
    const getTimeUntil = (dateStr) => {
        const now = new Date();
        const target = new Date(dateStr);
        const diff = target - now;
        if (diff <= 0) return 'Starting soon...';
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const getAssessmentTypeColor = (type) => {
        const colors = {
            SelfAssessment: 'bg-blue-100 text-blue-800',
            SupervisorOnly: 'bg-green-100 text-green-800',
            Combined: 'bg-purple-100 text-purple-800',
        };
        return colors[type] || 'bg-gray-100 text-gray-800';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-7 space-y-6">
            {/* Header with Welcome Message */}
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
                    <div className="text-sm font-semibold text-gray-700">Pending Assessments</div>
                    <div className="text-xs text-gray-500 mt-1">
                        {stats.completedAssessments} completed
                    </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                            <Award className="w-6 h-6 text-green-600" />
                        </div>
                    </div>
                    <div className="text-3xl font-display font-bold text-brand-black mb-1">
                        {stats.avgScore}%
                    </div>
                    <div className="text-sm font-semibold text-gray-700">Average Score</div>
                    <div className="text-xs text-gray-500 mt-1">
                        Across {stats.competenciesAssessed} competencies
                    </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                            <Target className="w-6 h-6 text-purple-600" />
                        </div>
                    </div>
                    <div className="text-3xl font-display font-bold text-brand-black mb-1">
                        {stats.competenciesAssessed}
                    </div>
                    <div className="text-sm font-semibold text-gray-700">Competencies Assessed</div>
                    <div className="text-xs text-gray-500 mt-1">
                        {stats.totalAssessments} total assessments
                    </div>
                </div>

                {/* NEW: Scheduled count card */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-orange-600" />
                        </div>
                    </div>
                    <div className="text-3xl font-display font-bold text-brand-black mb-1">
                        {scheduledAssessments.length}
                    </div>
                    <div className="text-sm font-semibold text-gray-700">Upcoming Scheduled</div>
                    <div className="text-xs text-gray-500 mt-1">
                        {activeAssessments.length} active now
                    </div>
                </div>
            </div>

            {/* Next Deadline Banner */}
            {nextDeadline && (
                <div className="bg-gradient-to-r from-brand-red to-red-600 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                <Calendar className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <p className="text-white/80 text-sm font-medium">Next Deadline</p>
                                <h3 className="text-xl font-display font-bold">{nextDeadline.name}</h3>
                                <p className="text-white/90 text-sm mt-1">
                                    Due: {new Date(nextDeadline.date).toLocaleDateString('en-US', {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <div className="text-3xl font-display font-bold">{nextDeadline.daysLeft}</div>
                                <p className="text-white/80 text-sm">days left</p>
                            </div>
                            <button
                                onClick={() => nav(`/assessments/${nextDeadline.id}`)}
                                className="px-6 py-3 bg-white text-brand-red rounded-xl font-semibold hover:bg-gray-100 transition-colors flex items-center gap-2"
                            >
                                Continue Assessment
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ACTIVE ASSESSMENTS SECTION ─────────────────────────────────── */}
            {activeAssessments.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <h2 className="text-lg font-display font-bold text-brand-black">
                            Active Assessments
                        </h2>
                        <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                            {activeAssessments.length}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeAssessments.map((a) => (
                            <div
                                key={a._id}
                                className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all border border-gray-100 overflow-hidden"
                            >
                                <div className="h-2 bg-green-500" />
                                <div className="p-5">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${getAssessmentTypeColor(a.type)}`}>
                                            {a.type}
                                        </span>
                                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                                            Active
                                        </span>
                                    </div>

                                    <h3 className="text-base font-bold text-brand-black mb-2 line-clamp-2">
                                        {a.description || 'Untitled Assessment'}
                                    </h3>

                                    <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
                                        <Target className="w-3 h-3" />
                                        {a.competencyId?.name || 'No competency'}
                                    </p>

                                    <div className="flex gap-4 text-xs text-gray-400 mb-4">
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            Ends {new Date(a.endDate).toLocaleDateString('en-US', {
                                                month: 'short', day: 'numeric'
                                            })}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {a.timeLimit ? `${a.timeLimit} min` : 'No limit'}
                                        </span>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 px-5 py-3 flex justify-between items-center bg-gray-50">
                                    <button
                                        onClick={() => nav(`/assessments/${a._id}/take`)}
                                        className="px-4 py-2 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors flex items-center gap-1"
                                    >
                                        <Play className="w-3 h-3" />
                                        {a.type === 'Combined' ? 'Start Self-Assessment' : 'Start Assessment'}
                                    </button>
                                    <button
                                        onClick={() => nav(`/assessments/${a._id}`)}
                                        className="text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors flex items-center gap-1"
                                    >
                                        Details <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── SCHEDULED (UPCOMING) ASSESSMENTS SECTION ───────────────────── */}
            {scheduledAssessments.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <h2 className="text-lg font-display font-bold text-brand-black">
                            Upcoming Assessments
                        </h2>
                        <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                            {scheduledAssessments.length}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {scheduledAssessments.map((a) => (
                            <div
                                key={a._id}
                                className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all border border-gray-100 overflow-hidden opacity-90"
                            >
                                <div className="h-2 bg-blue-500" />
                                <div className="p-5">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${getAssessmentTypeColor(a.type)}`}>
                                            {a.type}
                                        </span>
                                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                                            Scheduled
                                        </span>
                                    </div>

                                    <h3 className="text-base font-bold text-brand-black mb-2 line-clamp-2">
                                        {a.description || 'Untitled Assessment'}
                                    </h3>

                                    <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
                                        <Target className="w-3 h-3" />
                                        {a.competencyId?.name || 'No competency'}
                                    </p>

                                    <div className="bg-blue-50 border-l-4 border-blue-500 rounded p-3 mb-3">
                                        <div className="text-xs text-blue-800">
                                            <strong>Starts:</strong>{' '}
                                            {new Date(a.startDate).toLocaleString('en-US', {
                                                month: 'short', day: 'numeric', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </div>
                                        <div className="text-xs text-blue-600 mt-1 font-semibold flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Starts in {getTimeUntil(a.startDate)}
                                        </div>
                                    </div>

                                    <div className="flex gap-4 text-xs text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            Ends {new Date(a.endDate).toLocaleDateString('en-US', {
                                                month: 'short', day: 'numeric'
                                            })}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {a.timeLimit ? `${a.timeLimit} min` : 'No limit'}
                                        </span>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 px-5 py-3 flex justify-between items-center bg-gray-50">
                                    <button
                                        onClick={() => nav(`/assessments/${a._id}/take`)}
                                        className="px-4 py-2 text-xs font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                                    >
                                        <Eye className="w-3 h-3" />
                                        View Details
                                    </button>
                                    <button
                                        onClick={() => nav(`/assessments/${a._id}`)}
                                        className="text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors flex items-center gap-1"
                                    >
                                        Details <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state if no assessments at all */}
            {assessments.length === 0 && (
                <div className="bg-white rounded-xl shadow-card border border-gray-100 p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <ClipboardList className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-display font-bold text-brand-black mb-2">
                        No Assessments Available
                    </h3>
                    <p className="text-sm text-gray-500">
                        There are no scheduled or active assessments for you at the moment.
                    </p>
                </div>
            )}
        </div>
    );
}
