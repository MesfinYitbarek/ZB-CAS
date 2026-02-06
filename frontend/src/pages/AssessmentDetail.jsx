import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, Edit2, Trash2, Calendar, Clock, Users, FileText } from 'lucide-react';
import Modal from '../components/Modal';
import api from '../utils/api';

export default function AssessmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const { show } = useToast();
  const [assessment, setAssessment] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [competencies, setCompetencies] = useState([]);
  const [questions, setQuestions] = useState([]);

  const [form, setForm] = useState({
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

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/assessments/${id}`);
        setAssessment(data.data.assessment);
        setForm({
          competencyId: data.data.assessment.competencyId?._id || '',
          description: data.data.assessment.description,
          target: data.data.assessment.target,
          questionIds: data.data.assessment.questionIds.map((q) => q._id),
          startDate: data.data.assessment.startDate?.split('T')[0] || '',
          endDate: data.data.assessment.endDate?.split('T')[0] || '',
          timeLimit: data.data.assessment.timeLimit || '',
          type: data.data.assessment.type,
          weight: data.data.assessment.weight || { selfAssessment: 20, supervisor: 80 },
        });

        if (isAdmin) {
          const respRes = await api.get(`/responses/${id}/all`);
          setResponses(respRes.data.data.responses);
        }
      } catch (err) {
        show('Failed to load assessment.', 'error');
        nav('/assessments');
      }
      setLoading(false);
    };
    load();
  }, [id, isAdmin]);

  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data.competencies)).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.competencyId) {
      api
        .get('/questions', { params: { competencyId: form.competencyId } })
        .then(({ data }) => setQuestions(data.data.questions))
        .catch(() => {});
    }
  }, [form.competencyId]);

  const handleUpdate = async () => {
    try {
      await api.put(`/assessments/${id}`, form);
      show('Assessment updated.', 'success');
      setEditModal(false);
      window.location.reload();
    } catch (err) {
      show(err.response?.data?.message || 'Update failed.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this assessment? This cannot be undone.')) return;
    try {
      await api.delete(`/assessments/${id}`);
      show('Assessment deleted.', 'success');
      nav('/assessments');
    } catch (err) {
      show(err.response?.data?.message || 'Delete failed.', 'error');
    }
  };

  const toggleQuestion = (qId) => {
    setForm((prev) => ({
      ...prev,
      questionIds: prev.questionIds.includes(qId) ? prev.questionIds.filter((id) => id !== qId) : [...prev.questionIds, qId],
    }));
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!assessment) return null;

  const participantCount = [...new Set(responses.map((r) => r.userId?._id))].length;
  const completionRate = responses.length > 0 ? Math.round((responses.filter((r) => r.submittedAt).length / responses.length) * 100) : 0;

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => nav('/assessments')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold text-brand-black">{assessment.description || 'Assessment Details'}</h1>
          <p className="text-gray-500 mt-1">
            {assessment.competencyId?.name} · {assessment.type}
          </p>
        </div>
        {isAdmin && assessment.status === 'DRAFT' && (
          <div className="flex gap-2">
            <button onClick={() => setEditModal(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
            <button onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-brand-red/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-red" />
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Status</div>
              <span className={`badge badge-${assessment.status.toLowerCase()} mt-1`}>{assessment.status}</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Questions</div>
              <div className="text-2xl font-bold text-brand-black">{assessment.questionIds?.length || 0}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Participants</div>
              <div className="text-2xl font-bold text-brand-black">{participantCount}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Completion</div>
              <div className="text-2xl font-bold text-brand-black">{completionRate}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Assessment Info */}
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-display font-bold text-brand-black mb-4">Assessment Information</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Duration</div>
                  <div className="text-sm text-brand-black-soft">
                    {new Date(assessment.startDate).toLocaleDateString()} - {new Date(assessment.endDate).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Time Limit</div>
                  <div className="text-sm text-brand-black-soft">{assessment.timeLimit ? `${assessment.timeLimit} minutes` : 'No limit'}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Target</div>
                  <div className="text-sm text-brand-black-soft">
                    {assessment.target?.department || 'All Departments'} · {assessment.target?.position || 'All Positions'}
                  </div>
                </div>
              </div>
              {assessment.type === 'Combined' && (
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-xs text-gray-500 font-semibold uppercase">Weights</div>
                    <div className="text-sm text-brand-black-soft">
                      Self: {assessment.weight?.selfAssessment || 0}% · Supervisor: {assessment.weight?.supervisor || 0}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Questions List */}
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-display font-bold text-brand-black mb-4">Questions ({assessment.questionIds?.length || 0})</h3>
            {assessment.questionIds?.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No questions added yet.</p>
            ) : (
              <div className="space-y-2">
                {assessment.questionIds?.map((q, idx) => (
                  <div key={q._id} className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brand-black-soft line-clamp-2">{q.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-semibold">{q.type}</span>
                          {q.options?.length > 0 && <span className="text-xs text-gray-400">{q.options.length} options</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Responses */}
        {isAdmin && responses.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-display font-bold text-brand-black mb-4">Recent Responses</h3>
            <div className="space-y-3">
              {responses.slice(0, 10).map((r) => (
                <div key={r._id} className="p-3 border border-gray-100 rounded-lg">
                  <div className="font-semibold text-sm text-brand-black-soft">{r.userId?.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Q{r.questionId?.text?.substring(0, 30)}...
                  </div>
                  {r.submittedAt && (
                    <div className="text-xs text-green-600 mt-1 font-semibold">✓ Submitted</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Assessment" large>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency</label>
              <select value={form.competencyId} onChange={(e) => setForm({ ...form, competencyId: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                <option value="">— Select —</option>
                {competencies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
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
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
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
          {questions.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Questions</label>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {questions.map((q) => (
                  <label key={q._id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm">
                    <input type="checkbox" checked={form.questionIds.includes(q._id)} onChange={() => toggleQuestion(q._id)} className="w-4 h-4 text-brand-red focus:ring-brand-red rounded" />
                    <span className="flex-1 line-clamp-1">{q.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleUpdate} className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Save Changes
          </button>
        </div>
      </Modal>
    </div>
  );
}
