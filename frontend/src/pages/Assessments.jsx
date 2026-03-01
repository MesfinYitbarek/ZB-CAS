import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Calendar, Clock, ChevronLeft, ChevronRight, Target, Users, Eye,
  AlertCircle, Check, X, Shuffle, Edit2, Bell, Briefcase, Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const STATUS_ORDER = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];
const PURPOSES = [
  'Career Development',
  'Succession Planning',
  'Performance Improvement',
  'Training Needs Analysis',
  'Promotion Readiness',
  'Other',
];

export default function Assessments() {
  const { isAdmin, isSupervisor, isEmployee, user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [targetGroups, setTargetGroups] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState({ name: '', department: '', position: '' });
  const [filterStatus, setFilterStatus] = useState('');
  const [modal, setModal] = useState(null);

  const [questionSelectionMode, setQuestionSelectionMode] = useState('auto');
  const [autoSelectionConfig, setAutoSelectionConfig] = useState({
    totalQuestions: 10,
    questionTypes: {
      MCQ: 3, Rating: 2, TrueFalse: 2, MultiSelect: 1, ScenarioMCQ: 1, ShortAnswer: 1
    }
  });

  const [pagination, setPagination] = useState({ page: 1, limit: 6, total: 0, totalPages: 0 });
  const [supervisorStats, setSupervisorStats] = useState({ pendingEvaluations: 0, completedEvaluations: 0 });

  const initForm = () => ({
    competencyId: '',
    targetGroup: '',
    purpose: '',
    reminderDaysBefore: '',
    description: '',
    targetAudience: { type: 'ALL_DEPARTMENTS', departments: [], employeeIds: [] },
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
  const [scoreConfirm, setScoreConfirm] = useState(null);

  // ── Load competencies and departments on mount ────────────────────────────
  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data.competencies)).catch(() => {});
    api.get('/assessments/employees/departments').then(({ data }) => setDepartments(data.data.departments)).catch(() => {});
    if (isSupervisor) loadSupervisorStats();
  }, [isSupervisor]);

  // ── Derive target groups from selected competency ─────────────────────────
  useEffect(() => {
    if (form.competencyId) {
      const selectedCompetency = competencies.find(c => c._id === form.competencyId);
      const tgs = selectedCompetency?.targetGroups?.map(t => t.targetGroup) || [];
      setTargetGroups(tgs);
      setForm(prev => ({ ...prev, targetGroup: '', questionIds: [] }));
      setQuestionSelectionMode('auto');
    } else {
      setTargetGroups([]);
      setQuestions([]);
    }
  }, [form.competencyId, competencies]);

  // ── Fetch questions when BOTH competencyId AND targetGroup are selected ───
  useEffect(() => {
    if (form.competencyId && form.targetGroup) {
      api
        .get('/questions', { params: { competencyId: form.competencyId, targetGroup: form.targetGroup } })
        .then(({ data }) => {
          setQuestions(data.data.questions);
          setForm(prev => ({ ...prev, questionIds: [] }));
          setQuestionSelectionMode('auto');
        })
        .catch(() => {});
    } else {
      setQuestions([]);
    }
  }, [form.competencyId, form.targetGroup]);

  const loadSupervisorStats = async () => {
    try {
      const res = await api.get('/supervisor/pending');
      const pendingCount = res.data.data.pendingEvaluations?.length || 0;
      const completedRes = await api.get('/supervisor/completed-count');
      const completedCount = completedRes.data.data.count || 0;
      setSupervisorStats({ pendingEvaluations: pendingCount, completedEvaluations: completedCount });
    } catch (err) {
      console.error('Error loading supervisor stats:', err);
    }
  };

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      let endpoint = '/assessments';
      let params = { page: pagination.page, limit: pagination.limit };
      
      // Only apply status filter for admin or if explicitly requested
      if (filterStatus && isAdmin) {
        params.status = filterStatus;
      }
      
      // For non-admin users, use the active endpoint which already has the filtering logic
      if (isSupervisor || isEmployee) {
        endpoint = '/assessments/active';
        // Add supervisorView flag for supervisors
        if (isSupervisor) {
          params.supervisorView = true;
        }
        // Don't send status filter for active endpoint as it already filters for SCHEDULED/ACTIVE
        delete params.status;
      }
      
      const { data } = await api.get(endpoint, { params });
      
      // For employees and supervisors, the backend already filters to only show assessments that include them
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
  }, [isAdmin, isSupervisor, isEmployee, filterStatus, pagination.page, pagination.limit, show]);

  useEffect(() => { fetchAssessments(); }, [fetchAssessments]);

  // ── Employee search for SPECIFIC_EMPLOYEES ────────────────────────────────
  const handleEmployeeSearch = async () => {
    try {
      const { data } = await api.get('/assessments/employees/search', { params: employeeSearch });
      setSearchResults(data.data.employees);
      if (data.data.employees.length === 0) show('No employees found matching your criteria.', 'warning');
    } catch {
      show('Employee search failed.', 'error');
    }
  };

  const openCreate = () => {
    setForm(initForm());
    setTargetGroups([]);
    setQuestions([]);
    setSearchResults([]);
    setEmployeeSearch({ name: '', department: '', position: '' });
    setQuestionSelectionMode('auto');
    setModal('create');
  };

  const autoSelectQuestions = () => {
    if (!questions.length) { show('No questions available.', 'warning'); return; }
    const selected = [];
    const availableByType = {};
    questions.forEach(q => {
      if (!availableByType[q.type]) availableByType[q.type] = [];
      availableByType[q.type].push(q);
    });
    Object.keys(availableByType).forEach(type => { availableByType[type] = shuffleArray(availableByType[type]); });
    Object.entries(autoSelectionConfig.questionTypes).forEach(([type, count]) => {
      if (count > 0 && availableByType[type]) {
        selected.push(...availableByType[type].slice(0, count).map(q => q._id));
      }
    });
    if (selected.length === 0) { show('No questions match your selection criteria.', 'warning'); return; }
    setForm(prev => ({ ...prev, questionIds: selected }));
    show(`${selected.length} questions selected and shuffled.`, 'success');
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
    if (!form.startDate || !form.endDate) { show('Start date and end date are required.', 'error'); return false; }
    if (isNaN(start.getTime()) || isNaN(end.getTime())) { show('Invalid date or time format.', 'error'); return false; }
    if (start <= now) { show('Start date and time must be in the future.', 'error'); return false; }
    if (end <= start) { show('End date and time must be after start date and time.', 'error'); return false; }
    if ((end - start) / (1000 * 60 * 60) < 1) { show('Assessment duration must be at least 1 hour.', 'error'); return false; }
    return true;
  };

  const validateForm = () => {
    if (!form.competencyId) { show('Please select a competency.', 'error'); return false; }
    if (!form.targetGroup) { show('Please select a target group.', 'error'); return false; }
    if (!form.purpose) { show('Please select a purpose.', 'error'); return false; }
    if (form.targetAudience.type === 'DEPARTMENT_ALL' && form.targetAudience.departments.length === 0) {
      show('Please select at least one department.', 'error'); return false;
    }
    if (form.targetAudience.type === 'SPECIFIC_EMPLOYEES' && form.targetAudience.employeeIds.length === 0) {
      show('Please select at least one employee.', 'error'); return false;
    }
    if (form.type === 'Combined' && form.weight.selfAssessment + form.weight.supervisor !== 100) {
      show('For Combined assessments, weights must sum to 100%.', 'error'); return false;
    }
    if (form.type !== 'SupervisorOnly' && form.questionIds.length === 0) {
      show('Please select at least one question.', 'error'); return false;
    }
    return true;
  };

  const handleSave = async () => {
    try {
      if (!validateDateTime()) return;
      if (!validateForm()) return;

      const startDateTime = new Date(`${form.startDate}T${form.startTime}`).toISOString();
      const endDateTime = new Date(`${form.endDate}T${form.endTime}`).toISOString();

      const payload = {
        competencyId: form.competencyId,
        targetGroup: form.targetGroup,
        purpose: form.purpose,
        reminderDaysBefore: form.reminderDaysBefore ? Number(form.reminderDaysBefore) : null,
        description: form.description,
        targetAudience: form.targetAudience,
        questionIds: form.questionIds,
        startDate: startDateTime,
        endDate: endDateTime,
        timeLimit: form.timeLimit ? Number(form.timeLimit) : null,
        type: form.type,
        weight: form.weight,
      };

      await api.post('/assessments', payload);
      show('Assessment created successfully.', 'success');
      setModal(null);
      setPagination(prev => ({ ...prev, page: 1 }));
      fetchAssessments();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to create assessment.', 'error');
    }
  };

  const changeStatus = async (id, newStatus) => {
    try {
      await api.patch(`/assessments/${id}/status`, { status: newStatus });
      show(`Status changed to ${newStatus}.`, 'success');
      fetchAssessments();
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
    if (idx < 0 || idx + 1 >= STATUS_ORDER.length) return null;
    return STATUS_ORDER[idx + 1];
  };

  const getStatusColor = (status) => ({
    DRAFT: 'bg-gray-300', SCHEDULED: 'bg-blue-500', ACTIVE: 'bg-green-500',
    COMPLETED: 'bg-brand-red', ARCHIVED: 'bg-gray-500',
  }[status] || 'bg-gray-300');

  const getStatusText = (status) => ({
    DRAFT: 'Draft', SCHEDULED: 'Scheduled', ACTIVE: 'Active',
    COMPLETED: 'Completed', ARCHIVED: 'Archived',
  }[status] || status);

  const getAssessmentTypeColor = (type) => ({
    SelfAssessment: 'bg-blue-100 text-blue-800',
    SupervisorOnly: 'bg-green-100 text-green-800',
    Combined: 'bg-purple-100 text-purple-800',
  }[type] || 'bg-gray-100 text-gray-800');

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) setPagination(prev => ({ ...prev, page }));
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({ page: 1, limit: newLimit, total: pagination.total, totalPages: Math.ceil(pagination.total / newLimit) });
  };

  const requiresSupervisorEvaluation = (assessment) =>
    assessment.type === 'SupervisorOnly' || assessment.type === 'Combined';

  const handleScoreResults = (assessmentId) => setScoreConfirm(assessmentId);

  const executeScoreResults = async (assessmentId) => {
    setScoreConfirm(null);
    try {
      const res = await api.post(`/results/score/${assessmentId}`);
      show(res.data.message || 'Results scored successfully.', 'success');
      fetchAssessments();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to score results.', 'error');
    }
  };

  const getQuestionTypeCount = (type) => questions.filter(q => q.type === type).length;
  const getTotalAutoQuestions = () => Object.values(autoSelectionConfig.questionTypes).reduce((s, c) => s + c, 0);

  const getTimeUntil = (dateStr) => {
    const diff = new Date(dateStr) - new Date();
    if (diff <= 0) return 'Starting soon...';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    return `in ${minutes}m`;
  };

  const formatTargetAudience = (a) => {
    if (!a.targetAudience) return a.target?.department || 'All Departments';
    if (a.targetAudience.type === 'ALL_DEPARTMENTS') return 'All Departments';
    if (a.targetAudience.type === 'DEPARTMENT_ALL') return a.targetAudience.departments?.join(', ') || 'Specific Departments';
    if (a.targetAudience.type === 'SPECIFIC_EMPLOYEES') return `${a.targetAudience.employeeIds?.length || 0} specific employee(s)`;
    return 'All Departments';
  };

  // ─── TARGET AUDIENCE PICKER ───────────────────────────────────────────────
  const TargetAudiencePicker = () => (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <label className="block text-sm font-semibold text-gray-700">Target Audience *</label>

      <div className="grid grid-cols-3 gap-2">
        {[
          { value: 'ALL_DEPARTMENTS', label: 'All Departments' },
          { value: 'DEPARTMENT_ALL', label: 'Specific Dept(s)' },
          { value: 'SPECIFIC_EMPLOYEES', label: 'Specific Employee(s)' },
        ].map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setForm(prev => ({ ...prev, targetAudience: { type: opt.value, departments: [], employeeIds: [] } }))}
            className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
              form.targetAudience.type === opt.value
                ? 'bg-brand-red text-white border-brand-red'
                : 'bg-white text-gray-600 border-gray-300 hover:border-brand-red'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {form.targetAudience.type === 'ALL_DEPARTMENTS' && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          All active employees across all departments will be assigned this assessment.
        </p>
      )}

      {form.targetAudience.type === 'DEPARTMENT_ALL' && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Select Departments *</label>
          {departments.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No departments found.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1 bg-white">
              {departments.map(dept => (
                <label key={dept} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={form.targetAudience.departments.includes(dept)}
                    onChange={e => {
                      const depts = e.target.checked
                        ? [...form.targetAudience.departments, dept]
                        : form.targetAudience.departments.filter(d => d !== dept);
                      setForm(prev => ({ ...prev, targetAudience: { ...prev.targetAudience, departments: depts } }));
                    }}
                    className="w-4 h-4 accent-brand-red"
                  />
                  <span className="text-gray-700">{dept}</span>
                </label>
              ))}
            </div>
          )}
          {form.targetAudience.departments.length > 0 && (
            <p className="text-xs text-brand-red font-medium mt-1">
              {form.targetAudience.departments.length} department(s) selected
            </p>
          )}
        </div>
      )}

      {form.targetAudience.type === 'SPECIFIC_EMPLOYEES' && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Search by name…"
              value={employeeSearch.name}
              onChange={e => setEmployeeSearch(prev => ({ ...prev, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleEmployeeSearch()}
              className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red"
            />
            <select
              value={employeeSearch.department}
              onChange={e => setEmployeeSearch(prev => ({ ...prev, department: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input
              type="text"
              placeholder="Filter by position…"
              value={employeeSearch.position}
              onChange={e => setEmployeeSearch(prev => ({ ...prev, position: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleEmployeeSearch()}
              className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red"
            />
          </div>
          <button
            type="button"
            onClick={handleEmployeeSearch}
            className="w-full py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors flex items-center justify-center gap-1"
          >
            <Search className="w-3 h-3" /> Search Employees
          </button>

          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y bg-white">
              {searchResults.map(emp => {
                const selected = form.targetAudience.employeeIds.includes(emp._id);
                return (
                  <label
                    key={emp._id}
                    className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${selected ? 'bg-red-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={e => {
                        const ids = e.target.checked
                          ? [...form.targetAudience.employeeIds, emp._id]
                          : form.targetAudience.employeeIds.filter(id => id !== emp._id);
                        setForm(prev => ({ ...prev, targetAudience: { ...prev.targetAudience, employeeIds: ids } }));
                      }}
                      className="w-4 h-4 accent-brand-red flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.department} · {emp.position}</p>
                    </div>
                    {selected && <Check className="w-3 h-3 text-brand-red flex-shrink-0" />}
                  </label>
                );
              })}
            </div>
          )}

          {form.targetAudience.employeeIds.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-brand-red font-semibold bg-red-50 px-3 py-1.5 rounded-lg">
              <Users className="w-3 h-3" />
              {form.targetAudience.employeeIds.length} employee(s) selected
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex justify-between items-start mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Assessments</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? 'Create, schedule, and manage assessments.'
              : isSupervisor
                ? 'Your active assessments and evaluations.'
                : 'Your scheduled and active assessments.'}
          </p>
        </div>
        <div className="flex gap-3">
          {isSupervisor && supervisorStats.pendingEvaluations > 0 && (
            <button
              onClick={() => nav('/supervisor/pending')}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 flex-shrink-0">
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><Target className="w-5 h-5 text-blue-600" /></div>
              <div><div className="text-xs text-gray-500 uppercase font-semibold">Pending Evaluations</div><div className="text-2xl font-bold text-brand-black">{supervisorStats.pendingEvaluations}</div></div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center"><Users className="w-5 h-5 text-green-600" /></div>
              <div><div className="text-xs text-gray-500 uppercase font-semibold">Completed</div><div className="text-2xl font-bold text-brand-black">{supervisorStats.completedEvaluations}</div></div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center"><Eye className="w-5 h-5 text-purple-600" /></div>
              <div><div className="text-xs text-gray-500 uppercase font-semibold">Active Assessments</div><div className="text-2xl font-bold text-brand-black">{items.filter(a => a.status === 'ACTIVE' && requiresSupervisorEvaluation(a)).length}</div></div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setFilterStatus(''); setPagination(prev => ({ ...prev, page: 1 })); }}
              className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${filterStatus === '' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
              All
            </button>
            {STATUS_ORDER.map((s) => (
              <button key={s} onClick={() => { setFilterStatus(s); setPagination(prev => ({ ...prev, page: 1 })); }}
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${filterStatus === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                {getStatusText(s)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select value={pagination.limit} onChange={handlePageSizeChange}
              className="px-3 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm">
              <option value="6">6 per page</option>
              <option value="12">12 per page</option>
              <option value="24">24 per page</option>
              <option value="50">50 per page</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {items.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-400">
                  {user?.role === 'SUPERVISOR'
                    ? 'No assessments requiring your evaluation at the moment.'
                    : user?.role === 'EMPLOYEE'
                      ? 'No scheduled or active assessments for you at the moment.'
                      : 'No assessments found.'
                  }
                </div>
              )}
              {items.map((a, index) => {
                const next = getNextStatus(a.status);
                const isActive = a.status === 'ACTIVE';
                const isScheduled = a.status === 'SCHEDULED';
                const requiresSupervisor = requiresSupervisorEvaluation(a);

                return (
                  <div 
                    key={a._id} 
                    className="bg-white rounded-lg shadow-sm hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 ease-out border border-gray-200 overflow-hidden flex flex-col group"
                    style={{ animation: `fadeIn 0.4s ease-out ${index * 50}ms both` }}
                  >
                    <div className={`h-1.5 ${getStatusColor(a.status)}`} />
                    <div className="p-3 flex-1">
                      {/* Header: Type & Status */}
                      <div className="flex justify-between items-center mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${getAssessmentTypeColor(a.type)}`}>
                          {a.type}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${a.status === 'DRAFT' ? 'bg-gray-100 text-gray-600' :
                          a.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                            a.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                              a.status === 'COMPLETED' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                          }`}>
                          {getStatusText(a.status)}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-gray-900 mb-1.5 line-clamp-2 leading-tight">
                        {a.description || 'Untitled Assessment'}
                      </h3>

                      {/* Competency */}
                      <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                        <Target className="w-3 h-3 text-gray-400" />
                        {a.competencyId?.name || 'No competency'}
                      </p>

                      {/* Target - inline */}
                      {a.target?.department && (
                        <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {a.target.department}{a.target.position && ` • ${a.target.position}`}
                        </p>
                      )}

                      {/* Scheduled countdown - compact */}
                      {isScheduled && (
                        <div className="bg-blue-50/70 border border-blue-100 rounded-md px-2 py-1.5 mb-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-blue-700 font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Starts {getTimeUntil(a.startDate)}
                            </span>
                            <span className="text-[10px] text-blue-500">
                              {new Date(a.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Date & Duration - inline */}
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(a.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {a.timeLimit ? `${a.timeLimit}m` : '∞'}
                        </span>
                      </div>

                      {/* Combined weights - subtle */}
                      {a.type === 'Combined' && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-[10px] text-gray-500">
                          <span>Self: {a.weight?.selfAssessment || 20}%</span>
                          <span>Sup: {a.weight?.supervisor || 80}%</span>
                        </div>
                      )}
                    </div>

                    {/* Action Footer */}
                    <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/50 flex justify-between items-center">
                      {isAdmin && next && a.status !== 'SCHEDULED' && (
                        <button
                          onClick={() => changeStatus(a._id, next)}
                          className="px-2 py-1 text-[11px] font-medium text-brand-red border border-brand-red/30 rounded hover:bg-brand-red/5 transition-colors"
                        >
                          {getStatusText(next)}
                        </button>
                      )}

                      {isAdmin && isScheduled && (
                        <span className="text-[10px] text-blue-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Auto
                        </span>
                      )}

                      {!isAdmin && isActive && !requiresSupervisor && (
                        <button
                          onClick={() => nav(`/assessments/${a._id}/take`)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-brand-red text-white rounded hover:bg-brand-red-dark transition-colors"
                        >
                          Start
                        </button>
                      )}

                      {!isAdmin && isScheduled && (
                        <button
                          onClick={() => nav(`/assessments/${a._id}/take`)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      )}

                      {user?.role === 'SUPERVISOR' && isActive && requiresSupervisor && (
                        <button
                          onClick={() => nav(`/assessments/${a._id}/evaluate`)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        >
                          Evaluate
                        </button>
                      )}

                      {user?.role === 'EMPLOYEE' && isActive && a.type === 'Combined' && (
                        <button
                          onClick={() => nav(`/assessments/${a._id}/take`)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          Self-Assess
                        </button>
                      )}

                      {isAdmin && a.status === 'COMPLETED' && a.type === 'Combined' && (
                        <button
                          onClick={() => handleScoreResults(a._id)}
                          className="px-2.5 py-1 text-[11px] font-medium text-white bg-purple-600 rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                        >
                          <Target className="w-3 h-3" />
                          Score
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => nav(`/assessments/${a._id}`)}
                          className="text-[11px] font-medium text-gray-400 hover:text-brand-red transition-colors flex items-center gap-0.5"
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
      </div>
    </div>
  );
}