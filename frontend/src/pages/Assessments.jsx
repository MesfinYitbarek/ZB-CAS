import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, Clock, ChevronLeft, ChevronRight, Target, Users, Eye, AlertCircle, Check, X, Shuffle, Edit2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const STATUS_ORDER = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

export default function Assessments() {
  const { isAdmin, user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [modal, setModal] = useState(null);

  const [questionSelectionMode, setQuestionSelectionMode] = useState('auto');
  const [autoSelectionConfig, setAutoSelectionConfig] = useState({
    totalQuestions: 10,
    questionTypes: {
      MCQ: 3,
      Rating: 2,
      TrueFalse: 2,
      MultiSelect: 1,
      ScenarioMCQ: 1,
      ShortAnswer: 1
    }
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 6,
    total: 0,
    totalPages: 0
  });

  const [supervisorStats, setSupervisorStats] = useState({
    pendingEvaluations: 0,
    completedEvaluations: 0
  });

  const initForm = () => ({
    competencyId: '',
    description: '',
    target: { department: '', position: '' },
    questionIds: [],
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '17:00',
    timeLimit: '',
    type: 'SelfAssessment',
    weight: { selfAssessment: 20, supervisor: 80 },
  });
  const [form, setForm] = useState(initForm());

  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data.competencies)).catch(() => { });

    if (user?.role === 'SUPERVISOR') {
      loadSupervisorStats();
    }
  }, [user?.role]);

  useEffect(() => {
    if (form.competencyId) {
      api
        .get('/questions', { params: { competencyId: form.competencyId } })
        .then(({ data }) => {
          setQuestions(data.data.questions);
          setForm(prev => ({ ...prev, questionIds: [] }));
          setQuestionSelectionMode('auto');
        })
        .catch(() => { });
    } else {
      setQuestions([]);
    }
  }, [form.competencyId]);

  const loadSupervisorStats = async () => {
    try {
      const res = await api.get('/supervisor/pending');
      const pendingCount = res.data.data.pendingEvaluations?.length || 0;

      const completedRes = await api.get('/supervisor/completed-count');
      const completedCount = completedRes.data.data.count || 0;

      setSupervisorStats({
        pendingEvaluations: pendingCount,
        completedEvaluations: completedCount
      });
    } catch (err) {
      console.error('Error loading supervisor stats:', err);
    }
  };

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let endpoint = '/assessments';
      let params = {
        page: pagination.page,
        limit: pagination.limit
      };

      if (filterStatus) params.status = filterStatus;

      if (user?.role === 'SUPERVISOR') {
        endpoint = '/assessments/active';
        params.supervisorView = true;
      } else if (user?.role === 'EMPLOYEE') {
        endpoint = '/assessments/active';
      }

      const { data } = await api.get(endpoint, { params });
      setItems(data.data.assessments || []);

      if (data.data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit)
        }));
      }
    } catch (err) {
      console.error('Fetch error:', err);
      show('Failed to load assessments.', 'error');
    }
    setLoading(false);
  }, [isAdmin, filterStatus, pagination.page, pagination.limit, user?.role]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setForm(initForm());
    setQuestionSelectionMode('auto');
    setModal('create');
  };

  const autoSelectQuestions = () => {
    if (!questions.length) {
      show('No questions available for this competency.', 'warning');
      return;
    }

    const selected = [];
    const availableByType = {};

    questions.forEach(q => {
      if (!availableByType[q.type]) availableByType[q.type] = [];
      availableByType[q.type].push(q);
    });

    Object.keys(availableByType).forEach(type => {
      availableByType[type] = shuffleArray(availableByType[type]);
    });

    Object.entries(autoSelectionConfig.questionTypes).forEach(([type, count]) => {
      if (count > 0 && availableByType[type]) {
        const picked = availableByType[type].slice(0, count);
        selected.push(...picked.map(q => q._id));
      }
    });

    if (selected.length === 0) {
      show('No questions match your selection criteria. Please adjust the configuration.', 'warning');
      return;
    }

    setForm(prev => ({ ...prev, questionIds: selected }));
    show(`${selected.length} questions automatically selected and shuffled.`, 'success');
  };

  const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const validateDateTime = () => {
    const start = new Date(`${form.startDate}T${form.startTime}`);
    const end = new Date(`${form.endDate}T${form.endTime}`);
    const now = new Date();

    if (!form.startDate || !form.endDate) {
      show('Start date and end date are required.', 'error');
      return false;
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      show('Invalid date or time format.', 'error');
      return false;
    }

    if (start <= now) {
      show('Start date and time must be in the future.', 'error');
      return false;
    }

    if (end <= start) {
      show('End date and time must be after start date and time.', 'error');
      return false;
    }

    const duration = (end - start) / (1000 * 60 * 60);
    if (duration < 1) {
      show('Assessment duration must be at least 1 hour.', 'error');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    try {
      if (!validateDateTime()) return;

      if (form.type === 'Combined') {
        const totalWeight = form.weight.selfAssessment + form.weight.supervisor;
        if (totalWeight !== 100) {
          show('For Combined assessments, weights must sum to 100%', 'error');
          return;
        }
      }

      if (form.type !== 'SupervisorOnly' && form.questionIds.length === 0) {
        show('Please select at least one question for this assessment.', 'error');
        return;
      }

      const startDateTime = new Date(`${form.startDate}T${form.startTime}`).toISOString();
      const endDateTime = new Date(`${form.endDate}T${form.endTime}`).toISOString();

      const payload = {
        ...form,
        questionIds: form.questionIds,
        startDate: startDateTime,
        endDate: endDateTime,
        timeLimit: form.timeLimit ? Number(form.timeLimit) : null,
      };

      await api.post('/assessments', payload);
      show('Assessment created successfully.', 'success');
      setModal(null);
      setPagination(prev => ({ ...prev, page: 1 }));
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to create assessment.', 'error');
    }
  };

  const changeStatus = async (id, newStatus) => {
    try {
      await api.patch(`/assessments/${id}/status`, { status: newStatus });
      show(`Status changed to ${newStatus}.`, 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to change status.', 'error');
    }
  };

  const toggleQuestion = (qId) => {
    setForm((prev) => ({
      ...prev,
      questionIds: prev.questionIds.includes(qId)
        ? prev.questionIds.filter((id) => id !== qId)
        : [...prev.questionIds, qId],
    }));
  };

  const getNextStatus = (current) => {
    if (current === 'SCHEDULED') return null;
    const idx = STATUS_ORDER.indexOf(current);
    if (idx < 0) return null;
    const nextIdx = idx + 1;
    if (nextIdx >= STATUS_ORDER.length) return null;
    return STATUS_ORDER[nextIdx];
  };

  const getStatusColor = (status) => {
    const colors = {
      DRAFT: 'bg-gray-300',
      SCHEDULED: 'bg-blue-500',
      ACTIVE: 'bg-green-500',
      COMPLETED: 'bg-brand-red',
      ARCHIVED: 'bg-gray-500',
    };
    return colors[status] || 'bg-gray-300';
  };

  const getStatusText = (status) => {
    const texts = {
      DRAFT: 'Draft',
      SCHEDULED: 'Scheduled',
      ACTIVE: 'Active',
      COMPLETED: 'Completed',
      ARCHIVED: 'Archived',
    };
    return texts[status] || status;
  };

  const getAssessmentTypeColor = (type) => {
    const colors = {
      SelfAssessment: 'bg-blue-100 text-blue-800',
      SupervisorOnly: 'bg-green-100 text-green-800',
      Combined: 'bg-purple-100 text-purple-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({
      page: 1,
      limit: newLimit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / newLimit)
    });
  };

  const viewPendingEvaluations = () => {
    nav('/supervisor/pending');
  };

  const requiresSupervisorEvaluation = (assessment) => {
    return assessment.type === 'SupervisorOnly' || assessment.type === 'Combined';
  };

  const handleScoreResults = async (assessmentId) => {
    setScoreConfirm(assessmentId);
  };

  const [scoreConfirm, setScoreConfirm] = useState(null);

  const executeScoreResults = async (assessmentId) => {
    setScoreConfirm(null);
    try {
      const res = await api.post(`/results/score/${assessmentId}`);
      show(res.data.message || 'Results scored successfully.', 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to score results.', 'error');
    }
  };

  const getQuestionTypeCount = (type) => {
    return questions.filter(q => q.type === type).length;
  };

  const getTotalAutoQuestions = () => {
    return Object.values(autoSelectionConfig.questionTypes).reduce((sum, count) => sum + count, 0);
  };

  const getTimeUntil = (dateStr) => {
    const now = new Date();
    const target = new Date(dateStr);
    const diff = target - now;
    if (diff <= 0) return 'Starting soon...';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    return `in ${minutes}m`;
  };

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Assessments</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? 'Create, schedule, and manage assessments.'
              : user?.role === 'SUPERVISOR'
                ? 'Your active assessments and evaluations.'
                : 'Your scheduled and active assessments.'
            }
          </p>
        </div>

        <div className="flex gap-3">
          {user?.role === 'SUPERVISOR' && supervisorStats.pendingEvaluations > 0 && (
            <button
              onClick={viewPendingEvaluations}
              className="relative px-4 py-2 bg-orange-100 text-orange-700 rounded-lg border border-orange-200 hover:bg-orange-200 transition-colors font-semibold flex items-center gap-2"
            >
              <Target className="w-4 h-4" />
              Pending Evaluations
              <span className="bg-orange-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {supervisorStats.pendingEvaluations}
              </span>
            </button>
          )}

          {isAdmin && (
            <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
              <Plus className="w-4 h-4" /> Create Assessment
            </button>
          )}
        </div>
      </div>

      {user?.role === 'SUPERVISOR' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Pending Evaluations</div>
                <div className="text-2xl font-bold text-brand-black">
                  {supervisorStats.pendingEvaluations}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Completed</div>
                <div className="text-2xl font-bold text-brand-black">
                  {supervisorStats.completedEvaluations}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Eye className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Active Assessments</div>
                <div className="text-2xl font-bold text-brand-black">
                  {items.filter(a => a.status === 'ACTIVE' && requiresSupervisorEvaluation(a)).length}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setFilterStatus('');
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${filterStatus === '' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
            >
              All
            </button>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setFilterStatus(s);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${filterStatus === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
              >
                {getStatusText(s)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select
              value={pagination.limit}
              onChange={handlePageSizeChange}
              className="px-3 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
            >
              <option value="6">6 per page</option>
              <option value="12">12 per page</option>
              <option value="24">24 per page</option>
              <option value="50">50 per page</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {items.length === 0 && (
              <div className="col-span-full text-center py-16 text-gray-400">
                {user?.role === 'SUPERVISOR'
                  ? 'No assessments requiring your evaluation at the moment.'
                  : user?.role === 'EMPLOYEE'
                    ? 'No scheduled or active assessments for you at the moment.'
                    : 'No assessments found.'
                }
              </div>
            )}
            {items.map((a) => {
              const next = getNextStatus(a.status);
              const isActive = a.status === 'ACTIVE';
              const isScheduled = a.status === 'SCHEDULED';
              const requiresSupervisor = requiresSupervisorEvaluation(a);

              return (
                <div key={a._id} className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all border border-gray-100 overflow-hidden">
                  <div className={`h-2 ${getStatusColor(a.status)}`} />
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${getAssessmentTypeColor(a.type)}`}>
                        {a.type}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${a.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                        a.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                          a.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                            a.status === 'COMPLETED' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                        }`}>
                        {getStatusText(a.status)}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-brand-black mb-2 line-clamp-2">
                      {a.description || 'Untitled Assessment'}
                    </h3>

                    <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      {a.competencyId?.name || 'No competency'}
                    </p>

                    {a.target?.department && (
                      <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Target: {a.target.department}
                        {a.target.position && ` • ${a.target.position}`}
                      </div>
                    )}

                    {isScheduled && (
                      <div className="bg-blue-50 border-l-4 border-blue-500 rounded p-2 mb-3">
                        <div className="text-xs text-blue-800 font-semibold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Starts {getTimeUntil(a.startDate)}
                        </div>
                        <div className="text-[10px] text-blue-600 mt-0.5">
                          {new Date(a.startDate).toLocaleString('en-US', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-4 text-xs text-gray-400 mb-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(a.startDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {a.timeLimit ? `${a.timeLimit} min` : 'No limit'}
                      </span>
                    </div>

                    {a.type === 'Combined' && (
                      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg mb-3">
                        <div className="flex justify-between">
                          <span>Self: {a.weight?.selfAssessment || 20}%</span>
                          <span>Supervisor: {a.weight?.supervisor || 80}%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-100 px-5 py-3 flex justify-between items-center bg-gray-50">
                    {isAdmin && next && a.status !== 'SCHEDULED' && (
                      <button
                        onClick={() => changeStatus(a._id, next)}
                        className="px-3 py-1.5 text-xs font-semibold text-brand-red border border-brand-red rounded-lg hover:bg-brand-red-muted transition-colors"
                      >
                        Move to {getStatusText(next)}
                      </button>
                    )}

                    {isAdmin && isScheduled && (
                      <span className="text-xs text-blue-600 flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3" />
                        Auto-activates {new Date(a.startDate).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    )}

                    {!isAdmin && isActive && !requiresSupervisor && (
                      <button
                        onClick={() => nav(`/assessments/${a._id}/take`)}
                        className="px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors"
                      >
                        Start Assessment
                      </button>
                    )}

                    {!isAdmin && isScheduled && (
                      <button
                        onClick={() => nav(`/assessments/${a._id}/take`)}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        View Details
                      </button>
                    )}

                    {user?.role === 'SUPERVISOR' && isActive && requiresSupervisor && (
                      <button
                        onClick={() => nav(`/assessments/${a._id}/evaluate`)}
                        className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Evaluate Team
                      </button>
                    )}

                    {user?.role === 'EMPLOYEE' && isActive && a.type === 'Combined' && (
                      <button
                        onClick={() => nav(`/assessments/${a._id}/take`)}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Start Self-Assessment
                      </button>
                    )}

                    {isAdmin && a.status === 'COMPLETED' && a.type === 'Combined' && (
                      <button
                        onClick={() => handleScoreResults(a._id)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
                      >
                        <Target className="w-3 h-3" />
                        Score Combined Results
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => nav(`/assessments/${a._id}`)}
                        className="text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors flex items-center gap-1"
                      >
                        Details <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {pagination.total > pagination.limit && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} assessments
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium ${pagination.page === pageNum
                          ? 'bg-brand-red text-white'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {scoreConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
              <Target className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-bold text-brand-black text-center mb-2">
              Score Combined Results?
            </h3>
            <p className="text-sm text-gray-600 text-center mb-4">
              Missing responses will be treated as 0. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setScoreConfirm(null)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => executeScoreResults(scoreConfirm)}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700"
              >
                Score Results
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={modal === 'create'} onClose={() => setModal(null)} title="Create Assessment" large>
        <div className="space-y-5">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Basic Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency *</label>
                <select
                  value={form.competencyId}
                  onChange={(e) => setForm({ ...form, competencyId: e.target.value, questionIds: [] })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                  required
                >
                  <option value="">— Select Competency —</option>
                  {competencies.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.category})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Assessment Type *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                >
                  <option value="SelfAssessment">Self Assessment</option>
                  <option value="SupervisorOnly">Supervisor Only</option>
                  <option value="Combined">Combined (Self + Supervisor)</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g., Communication Skills Assessment - Q1 2024"
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Schedule & Duration
            </h3>

            <div className="bg-blue-100 border-l-4 border-blue-500 p-2 rounded mb-3">
              <p className="text-[10px] text-blue-800 flex items-center gap-1">
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span>
                  <strong>Note:</strong> The assessment will automatically become active at the scheduled start time.
                  No manual activation is needed.
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date *</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time *</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date *</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  min={form.startDate || new Date().toISOString().split('T')[0]}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time *</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                  required
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time Limit per Attempt (minutes, Optional)</label>
              <input
                type="number"
                value={form.timeLimit}
                onChange={(e) => setForm({ ...form, timeLimit: e.target.value })}
                placeholder="e.g., 60 (leave empty for no limit)"
                min={1}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm max-w-xs"
              />
              <div className="text-xs text-gray-500 mt-1">
                Leave empty for unlimited time per attempt
              </div>
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
            <h3 className="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Target Audience (Optional)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Department</label>
                <input
                  value={form.target.department}
                  onChange={(e) => setForm({ ...form, target: { ...form.target, department: e.target.value } })}
                  placeholder="e.g., IT Department"
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Position</label>
                <input
                  value={form.target.position}
                  onChange={(e) => setForm({ ...form, target: { ...form.target, position: e.target.value } })}
                  placeholder="e.g., IT Officer 1"
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                />
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Leave empty to target all departments and positions
            </div>
          </div>

          {form.type === 'Combined' && (
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
              <h3 className="text-sm font-bold text-amber-800 mb-3">Combined Assessment Weights</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Self-Assessment Weight (%) *</label>
                  <input
                    type="number"
                    value={form.weight.selfAssessment}
                    onChange={(e) => {
                      const selfWeight = Number(e.target.value);
                      const supervisorWeight = 100 - selfWeight;
                      setForm({
                        ...form,
                        weight: {
                          selfAssessment: selfWeight,
                          supervisor: supervisorWeight
                        }
                      });
                    }}
                    min={0}
                    max={100}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Supervisor Weight (%)</label>
                  <input
                    type="number"
                    value={form.weight.supervisor}
                    readOnly
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-gray-100 text-sm"
                  />
                </div>
              </div>
              {form.weight.selfAssessment + form.weight.supervisor !== 100 && (
                <div className="flex items-center gap-2 text-red-600 text-xs mt-2">
                  <AlertCircle className="w-4 h-4" />
                  Weights must sum to 100%. Current: {form.weight.selfAssessment + form.weight.supervisor}%
                </div>
              )}
            </div>
          )}

          {questions.length > 0 && form.type !== 'SupervisorOnly' && (
            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-green-800 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Question Selection
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setQuestionSelectionMode('auto')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${questionSelectionMode === 'auto' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}
                  >
                    <Shuffle className="w-3 h-3 inline mr-1" />
                    Auto Select
                  </button>
                  <button
                    onClick={() => setQuestionSelectionMode('manual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${questionSelectionMode === 'manual' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}
                  >
                    <Edit2 className="w-3 h-3 inline mr-1" />
                    Manual Select
                  </button>
                </div>
              </div>

              {questionSelectionMode === 'auto' && (
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded-lg border border-green-200">
                    <div className="text-xs text-gray-600 mb-2">
                      Configure how many questions of each type to randomly select. Questions will be shuffled for fairness.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {['MCQ', 'Rating', 'TrueFalse', 'MultiSelect', 'ScenarioMCQ', 'ShortAnswer', 'Matching', 'Ordering', 'DragDropClassification'].map(type => {
                        const available = getQuestionTypeCount(type);
                        return (
                          <div key={type} className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-700 flex-1">
                              {type}
                              <span className="text-gray-400 ml-1">({available} available)</span>
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={available}
                              value={autoSelectionConfig.questionTypes[type] || 0}
                              onChange={(e) => {
                                const val = Math.min(Number(e.target.value), available);
                                setAutoSelectionConfig(prev => ({
                                  ...prev,
                                  questionTypes: {
                                    ...prev.questionTypes,
                                    [type]: val
                                  }
                                }));
                              }}
                              className="w-16 h-8 px-2 rounded border border-gray-300 text-sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200">
                      <span className="text-xs font-semibold text-gray-700">
                        Total Questions: {getTotalAutoQuestions()}
                      </span>
                      <button
                        onClick={autoSelectQuestions}
                        disabled={getTotalAutoQuestions() === 0}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <Shuffle className="w-3 h-3" />
                        Shuffle & Select
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {questionSelectionMode === 'manual' && (
                <div className="border border-green-200 rounded-lg bg-white max-h-64 overflow-y-auto p-2 space-y-1">
                  {questions.map((q) => (
                    <label
                      key={q._id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.questionIds.includes(q._id)}
                        onChange={() => toggleQuestion(q._id)}
                        className="w-4 h-4 text-brand-red focus:ring-brand-red rounded"
                      />
                      <span className="flex-1 line-clamp-1">{q.text}</span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {q.type}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                <Check className="w-3 h-3 text-green-600" />
                {form.questionIds.length} question(s) selected
              </div>
            </div>
          )}

          {form.type === 'SupervisorOnly' && questions.length > 0 && (
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-orange-800 mb-1">
                    OD Question Selection (Optional)
                  </h4>
                  <p className="text-xs text-orange-700 mb-3">
                    For Supervisor-Only assessments, supervisors provide a single overall score per employee (not per question). Questions selected here are for OD reference purposes only and will not be used in scoring.
                  </p>
                  <div className="border border-orange-200 rounded-lg bg-white max-h-48 overflow-y-auto p-2 space-y-1">
                    {questions.map((q) => (
                      <label
                        key={q._id}
                        className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.questionIds.includes(q._id)}
                          onChange={() => toggleQuestion(q._id)}
                          className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded"
                        />
                        <span className="flex-1 line-clamp-1">{q.text}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {q.type}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-orange-600 mt-2">
                    {form.questionIds.length} reference question(s) selected
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={() => setModal(null)}
            className="px-5 py-2.5 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              (form.type === 'Combined' && form.weight.selfAssessment + form.weight.supervisor !== 100) ||
              !form.competencyId ||
              !form.startDate ||
              !form.endDate ||
              (form.type !== 'SupervisorOnly' && form.questionIds.length === 0)
            }
            className="px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Assessment
          </button>
        </div>
      </Modal>
    </div>
  );
}