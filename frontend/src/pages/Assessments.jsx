import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, Clock, ChevronLeft, ChevronRight, Target, Users, Eye } from 'lucide-react';
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
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 6,
    total: 0,
    totalPages: 0
  });

  // Supervisor-specific stats
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
    endDate: '',
    timeLimit: '',
    type: 'SelfAssessment',
    weight: { selfAssessment: 20, supervisor: 80 },
  });
  const [form, setForm] = useState(initForm());

  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data.competencies)).catch(() => {});
    
    // Load supervisor stats if supervisor
    if (user?.role === 'SUPERVISOR') {
      loadSupervisorStats();
    }
  }, [user?.role]);

  useEffect(() => {
    if (form.competencyId) {
      api
        .get('/questions', { params: { competencyId: form.competencyId } })
        .then(({ data }) => setQuestions(data.data.questions))
        .catch(() => {});
    } else {
      setQuestions([]);
    }
  }, [form.competencyId]);

  const loadSupervisorStats = async () => {
    try {
      const res = await api.get('/supervisor/pending');
      const pendingCount = res.data.data.pendingEvaluations?.length || 0;
      
      // Get completed evaluations count (you might need to add this endpoint)
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
      
      // If supervisor, they should see active assessments they need to evaluate
      if (user?.role === 'SUPERVISOR') {
        endpoint = '/assessments/active';
        // Add supervisor filter to show assessments they need to evaluate
        params.supervisorView = true;
      } else if (user?.role === 'EMPLOYEE') {
        endpoint = '/assessments/active';
      }
      
      const { data } = await api.get(endpoint, { params });
      setItems(data.data.assessments || []);
      
      // Update pagination from API response
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
    setModal('create');
  };

  const handleSave = async () => {
    try {
      // Validate Combined assessment weights sum to 100
      if (form.type === 'Combined') {
        const totalWeight = form.weight.selfAssessment + form.weight.supervisor;
        if (totalWeight !== 100) {
          show('For Combined assessments, weights must sum to 100%', 'error');
          return;
        }
      }

      const payload = {
        ...form,
        questionIds: form.questionIds,
        startDate: form.startDate,
        endDate: form.endDate,
        timeLimit: form.timeLimit ? Number(form.timeLimit) : null,
      };
      await api.post('/assessments', payload);
      show('Assessment created successfully.', 'success');
      setModal(null);
      // Reset to first page after creating new assessment
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
    const idx = STATUS_ORDER.indexOf(current);
    return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
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

  // Pagination handlers
  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({
      page: 1, // Reset to first page when changing limit
      limit: newLimit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / newLimit)
    });
  };

  const viewPendingEvaluations = () => {
    nav('/supervisor/pending');
  };

  // Check if assessment requires supervisor evaluation
  const requiresSupervisorEvaluation = (assessment) => {
    return assessment.type === 'SupervisorOnly' || assessment.type === 'Combined';
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
              : 'Your active assessments.'
            }
          </p>
        </div>
        
        <div className="flex gap-3">
          {/* Supervisor Pending Evaluations Badge */}
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

      {/* Supervisor Stats Cards */}
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

      {/* Filters (admin only) */}
      {isAdmin && (
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setFilterStatus('');
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                filterStatus === '' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
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
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                  filterStatus === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {getStatusText(s)}
              </button>
            ))}
          </div>
          
          {/* Page size selector */}
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

      {/* Cards */}
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
                  : 'No assessments found.'
                }
              </div>
            )}
            {items.map((a) => {
              const next = getNextStatus(a.status);
              const isActive = a.status === 'ACTIVE';
              const requiresSupervisor = requiresSupervisorEvaluation(a);
              
              return (
                <div key={a._id} className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all border border-gray-100 overflow-hidden">
                  <div className={`h-2 ${getStatusColor(a.status)}`} />
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${getAssessmentTypeColor(a.type)}`}>
                        {a.type}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        a.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
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
                    {isAdmin && next && (
                      <button 
                        onClick={() => changeStatus(a._id, next)} 
                        className="px-3 py-1.5 text-xs font-semibold text-brand-red border border-brand-red rounded-lg hover:bg-brand-red-muted transition-colors"
                      >
                        Move to {getStatusText(next)}
                      </button>
                    )}
                    
                    {!isAdmin && isActive && !requiresSupervisor && (
                      <button 
                        onClick={() => nav(`/assessments/${a._id}/take`)} 
                        className="px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors"
                      >
                        Start Assessment
                      </button>
                    )}
                    
                    {/* Supervisor can evaluate */}
                    {user?.role === 'SUPERVISOR' && isActive && requiresSupervisor && (
                      <button 
                        onClick={() => nav(`/assessments/${a._id}/evaluate`)} 
                        className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Evaluate Team
                      </button>
                    )}
                    
                    {/* Employee can start self-assessment for Combined */}
                    {user?.role === 'EMPLOYEE' && isActive && a.type === 'Combined' && (
                      <button 
                        onClick={() => nav(`/assessments/${a._id}/take`)} 
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Start Self-Assessment
                      </button>
                    )}
                    
                    {/* Score Results for admin */}
                    {isAdmin && a.status === 'COMPLETED' && (
                      <button
                        onClick={async () => {
                          try {
                            await api.post(`/results/score/${a._id}`);
                            show('Scoring completed successfully.', 'success');
                            fetch();
                          } catch (err) {
                            show(err.response?.data?.message || 'Failed to score results.', 'error');
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Score Results
                      </button>
                    )}
                    
                    <button 
                      onClick={() => nav(`/assessments/${a._id}`)} 
                      className="text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors flex items-center gap-1"
                    >
                      Details <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
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
                    // Show pages around current page
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
                        className={`w-9 h-9 rounded-lg text-sm font-medium ${
                          pagination.page === pageNum
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

      {/* Create Modal */}
      <Modal open={modal === 'create'} onClose={() => setModal(null)} title="Create Assessment" large>
        <div className="space-y-4">
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
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <input 
              value={form.description} 
              onChange={(e) => setForm({ ...form, description: e.target.value })} 
              placeholder="e.g., Communication Skills Assessment - Q1 2024" 
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" 
            />
          </div>
          
          {form.type === 'Combined' && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <h4 className="text-sm font-semibold text-blue-800 mb-2">Combined Assessment Weights</h4>
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
                  <div className="text-xs text-gray-500 mt-1">
                    Weight for employee's self-assessment score
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Supervisor Weight (%)</label>
                  <input 
                    type="number" 
                    value={form.weight.supervisor} 
                    readOnly 
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-gray-100 text-sm" 
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Automatically calculated
                  </div>
                </div>
              </div>
              {form.weight.selfAssessment + form.weight.supervisor !== 100 && (
                <div className="text-red-600 text-xs mt-2">
                  ⚠️ Weights must sum to 100%. Current total: {form.weight.selfAssessment + form.weight.supervisor}%
                </div>
              )}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Department (Optional)</label>
              <input 
                value={form.target.department} 
                onChange={(e) => setForm({ ...form, target: { ...form.target, department: e.target.value } })} 
                placeholder="e.g., IT Department" 
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" 
              />
              <div className="text-xs text-gray-500 mt-1">
                Leave empty to target all departments
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Position (Optional)</label>
              <input 
                value={form.target.position} 
                onChange={(e) => setForm({ ...form, target: { ...form.target, position: e.target.value } })} 
                placeholder="e.g., IT Officer 1" 
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" 
              />
              <div className="text-xs text-gray-500 mt-1">
                Leave empty to target all positions
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date *</label>
              <input 
                type="date" 
                value={form.startDate} 
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} 
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
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" 
                required 
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time Limit (minutes, Optional)</label>
            <input 
              type="number" 
              value={form.timeLimit} 
              onChange={(e) => setForm({ ...form, timeLimit: e.target.value })} 
              placeholder="e.g., 60 (leave empty for no limit)" 
              min={1} 
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm max-w-xs" 
            />
            <div className="text-xs text-gray-500 mt-1">
              Time limit per attempt. Leave empty for unlimited time.
            </div>
          </div>
          
          {questions.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Select Questions</label>
              <div className="text-xs text-gray-500 mb-2">
                {form.type === 'SupervisorOnly' 
                  ? 'Supervisor evaluations use a single score (not per-question). Questions selected here are for reference only.'
                  : 'Select questions for this assessment.'
                }
              </div>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto custom-scrollbar p-2 space-y-1">
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
                    <span className="text-xs text-gray-400">{q.type}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                {form.questionIds.length} question(s) selected
                {form.type === 'SupervisorOnly' && ' (for reference only)'}
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button 
            onClick={() => setModal(null)} 
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={form.type === 'Combined' && (form.weight.selfAssessment + form.weight.supervisor !== 100)}
            className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Assessment
          </button>
        </div>
      </Modal>
    </div>
  );
}