import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const STATUS_ORDER = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

export default function Assessments() {
  const { isAdmin } = useAuth();
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
  }, []);

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

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/assessments' : '/assessments/active';
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (filterStatus) params.status = filterStatus;
      const { data } = await api.get(endpoint, { params });
      setItems(data.data.assessments);
      
      // Update pagination from API response
      if (data.data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit)
        }));
      }
    } catch (_) {
      show('Failed to load assessments.', 'error');
    }
    setLoading(false);
  }, [isAdmin, filterStatus, pagination.page, pagination.limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        questionIds: form.questionIds,
        startDate: form.startDate,
        endDate: form.endDate,
        timeLimit: form.timeLimit ? Number(form.timeLimit) : null,
      };
      await api.post('/assessments', payload);
      show('Assessment created.', 'success');
      setModal(null);
      // Reset to first page after creating new assessment
      setPagination(prev => ({ ...prev, page: 1 }));
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  const changeStatus = async (id, newStatus) => {
    try {
      await api.patch(`/assessments/${id}/status`, { status: newStatus });
      show(`Status changed to ${newStatus}.`, 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  const toggleQuestion = (qId) => {
    setForm((prev) => ({
      ...prev,
      questionIds: prev.questionIds.includes(qId) ? prev.questionIds.filter((id) => id !== qId) : [...prev.questionIds, qId],
    }));
  };

  const getNextStatus = (current) => {
    const idx = STATUS_ORDER.indexOf(current);
    return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
  };

  const getStatusColor = (status) => {
    const colors = {
      DRAFT: 'bg-gray-200',
      SCHEDULED: 'bg-blue-500',
      ACTIVE: 'bg-green-500',
      COMPLETED: 'bg-brand-red',
      ARCHIVED: 'bg-gray-400',
    };
    return colors[status] || 'bg-gray-300';
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

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Assessments</h1>
          <p className="text-gray-500 mt-1">{isAdmin ? 'Create, schedule, and manage assessments.' : 'Your active assessments.'}</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            <Plus className="w-4 h-4" /> Create Assessment
          </button>
        )}
      </div>

      {/* Filters (admin only) */}
      {isAdmin && (
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 flex-wrap">
            {['', 'DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setFilterStatus(s);
                  setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page when filtering
                }}
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                  filterStatus === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
          
          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select 
              value={pagination.limit} 
              onChange={handlePageSizeChange}
              className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
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
              <div className="col-span-full text-center py-16 text-gray-400">No assessments found.</div>
            )}
            {items.map((a) => {
              const next = getNextStatus(a.status);
              return (
                <div key={a._id} className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all border border-gray-100 overflow-hidden">
                  <div className={`h-1 ${getStatusColor(a.status)}`} />
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span>
                      <span className="text-xs text-gray-400">{a.type}</span>
                    </div>
                    <h3 className="text-base font-bold text-brand-black mb-2 line-clamp-2">{a.description || 'Untitled Assessment'}</h3>
                    <p className="text-sm text-gray-500 mb-3">{a.competencyId?.name || '—'}</p>
                    <div className="flex gap-4 text-xs text-gray-400 mb-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(a.startDate).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {a.timeLimit ? `${a.timeLimit} min` : 'No limit'}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 px-5 py-3 flex justify-between items-center bg-gray-50">
                    {isAdmin && next && (
                      <button onClick={() => changeStatus(a._id, next)} className="px-3 py-1.5 text-xs font-semibold text-brand-red border border-brand-red rounded-lg hover:bg-brand-red-muted transition-colors">
                        Move to {next}
                      </button>
                    )}
                    {!isAdmin && a.status === 'ACTIVE' && (
                      <button onClick={() => nav(`/assessments/${a._id}/take`)} className="px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors">
                        Start Assessment
                      </button>
                    )}
                    {/* Only show "Score Results" for non-SelfAssessment types when COMPLETED */}
                    {isAdmin && a.status === 'COMPLETED' && a.type !== 'SelfAssessment' && (
                      <button
                        onClick={() => {
                          api
                            .post(`/results/score/${a._id}`)
                            .then(() => {
                              show('Scoring triggered.', 'success');
                            })
                            .catch((e) => show(e.response?.data?.message || 'Failed', 'error'));
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Score Results
                      </button>
                    )}
                    <button onClick={() => nav(`/assessments/${a._id}`)} className="text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors">
                      Details →
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency</label>
              <select value={form.competencyId} onChange={(e) => setForm({ ...form, competencyId: e.target.value, questionIds: [] })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                <option value="">— Select —</option>
                {competencies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                <option value="SelfAssessment">Self Assessment</option>
                <option value="SupervisorOnly">Supervisor Only</option>
                <option value="Combined">Combined</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Communication Skills Q1 2024" className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          {form.type === 'Combined' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Self-Assessment Weight (%)</label>
                <input
                  type="number"
                  value={form.weight.selfAssessment}
                  onChange={(e) =>
                    setForm({ ...form, weight: { ...form.weight, selfAssessment: Number(e.target.value), supervisor: 100 - Number(e.target.value) } })
                  }
                  min={0}
                  max={100}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Supervisor Weight (%)</label>
                <input type="number" value={form.weight.supervisor} readOnly className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-gray-100 text-sm" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Department</label>
              <input value={form.target.department} onChange={(e) => setForm({ ...form, target: { ...form.target, department: e.target.value } })} placeholder="IT Department" className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Position</label>
              <input value={form.target.position} onChange={(e) => setForm({ ...form, target: { ...form.target, position: e.target.value } })} placeholder="IT Officer 1" className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time Limit (minutes)</label>
            <input type="number" value={form.timeLimit} onChange={(e) => setForm({ ...form, timeLimit: e.target.value })} placeholder="60" min={1} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm max-w-xs" />
          </div>
          {questions.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Select Questions</label>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {questions.map((q) => (
                  <label key={q._id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm">
                    <input type="checkbox" checked={form.questionIds.includes(q._id)} onChange={() => toggleQuestion(q._id)} className="w-4 h-4 text-brand-red focus:ring-brand-red rounded" />
                    <span className="flex-1 line-clamp-1">{q.text}</span>
                    <span className="text-xs text-gray-400">{q.type}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">{form.questionIds.length} question(s) selected</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Create Assessment
          </button>
        </div>
      </Modal>
    </div>
  );
}