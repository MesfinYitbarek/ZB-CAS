import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList,
    CheckCircle,
    TrendingUp,
    Award,
    Target,
    Clock,
    BarChart3,
    User,
    AlertCircle,
    Calendar,
    ChevronRight
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

    const [pendingAssessments, setPendingAssessments] = useState([]);
    const [recentResults, setRecentResults] = useState([]);
    const [supervisor, setSupervisor] = useState(null);
    const [recentFeedback, setRecentFeedback] = useState([]);
    const [nextDeadline, setNextDeadline] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        try {
            // Single API call to fetch employee dashboard stats
            const res = await api.get('/dashboard/employee');
            const data = res.data.data;

            setStats(data.stats);
            setPendingAssessments(data.pendingAssessments || []);
            setRecentResults(data.recentResults || []);
            setSupervisor(data.supervisor);
            setRecentFeedback(data.recentFeedback || []);
            setNextDeadline(data.nextDeadline);
        } catch (err) {
            console.error('Failed to load employee dashboard:', err);
            showToast('Failed to load dashboard. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const getDaysLeft = (deadline) => {
        if (!deadline) return null;
        const days = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
        if (days < 0) return 'Overdue';
        if (days === 0) return 'Due today';
        if (days === 1) return '1 day left';
        return `${days} days left`;
    };

    const getPriorityColor = (daysLeft) => {
        if (daysLeft === 'Overdue') return 'text-red-700 bg-red-100';
        if (daysLeft === 'Due today') return 'text-orange-700 bg-orange-100';
        if (parseInt(daysLeft) <= 2) return 'text-orange-700 bg-orange-100';
        if (parseInt(daysLeft) <= 5) return 'text-yellow-700 bg-yellow-100';
        return 'text-green-700 bg-green-100';
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        if (score >= 40) return 'text-orange-600';
        return 'text-red-600';
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

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Pending Assessments */}
                <div className="bg-white rounded-xl shadow-card border border-gray-100">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-display font-bold text-brand-black">
                                Pending Assessments
                            </h3>
                            <p className="text-sm text-gray-500">
                                Assessments awaiting your completion
                            </p>
                        </div>
                        {pendingAssessments.length > 0 && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                                {pendingAssessments.length} pending
                            </span>
                        )}
                    </div>

                    {pendingAssessments.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-green-600" />
                            </div>
                            <h4 className="text-lg font-semibold text-brand-black mb-2">All Caught Up!</h4>
                            <p className="text-gray-500 text-sm">
                                You have no pending assessments at the moment.
                            </p>
                        </div>
                    ) : (
                        <div className="p-6 space-y-3">
                            {pendingAssessments.map((assessment) => {
                                const daysLeft = getDaysLeft(assessment.endDate);
                                const priorityColor = getPriorityColor(daysLeft);

                                return (
                                    <div
                                        key={assessment._id}
                                        className="group border border-gray-200 rounded-lg p-4 hover:border-brand-red hover:shadow-md transition-all cursor-pointer"
                                        onClick={() => nav(`/assessments/${assessment._id}`)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-brand-red/10 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-red group-hover:text-white transition-colors">
                                                <ClipboardList className="w-5 h-5 text-brand-red group-hover:text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="font-semibold text-brand-black">
                                                        {assessment.description}
                                                    </h4>
                                                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                                                        {assessment.competencyId?.name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 mt-2 text-xs">
                                                    <div className="flex items-center gap-1 text-gray-500">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{assessment.type}</span>
                                                    </div>
                                                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${priorityColor}`}>
                                                        <AlertCircle className="w-3 h-3" />
                                                        <span>{daysLeft}</span>
                                                    </div>
                                                </div>
                                                <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                                                    <div
                                                        className="bg-brand-red h-1.5 rounded-full transition-all"
                                                        style={{ width: `${assessment.progress || 0}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {assessment.progress || 0}% complete
                                                </p>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-brand-red transition-colors" />
                                        </div>
                                    </div>
                                );
                            })}

                            {pendingAssessments.length > 3 && (
                                <button
                                    onClick={() => nav('/assessments')}
                                    className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    View All Assessments
                                </button>
                            )}
                        </div>
                    )}
                </div>
                {/* Performance Summary Card */}
                {recentResults.length > 0 && (
                    <div className="mx-6 mb-6 p-4 bg-gradient-to-br from-brand-red/5 to-blue-500/5 rounded-lg border border-brand-red/10">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-brand-black">Performance Summary</h4>
                            <span className="text-xs text-gray-500">Last 30 days</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600">Average Score</p>
                                <p className={`text-2xl font-display font-bold ${getScoreColor(stats.avgScore)}`}>
                                    {stats.avgScore}%
                                </p>
                            </div>
                            <div className="w-px h-10 bg-gray-200" />
                            <div>
                                <p className="text-xs text-gray-600">Competencies</p>
                                <p className="text-2xl font-display font-bold text-brand-black">
                                    {stats.competenciesAssessed}
                                </p>
                            </div>
                            <div className="w-px h-10 bg-gray-200" />
                            <div>
                                <p className="text-xs text-gray-600">Completed</p>
                                <p className="text-2xl font-display font-bold text-brand-black">
                                    {stats.completedAssessments}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}