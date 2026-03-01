import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ArrowLeft, Edit2, Trash2, Calendar, Clock, Users, FileText,
  Target, Bell, Briefcase, AlertCircle, Check, Search, Tag, BookOpen
} from 'lucide-react';
import Modal from '../components/Modal';
import api from '../utils/api';

const PURPOSES = [
  'Career Development', 'Succession Planning', 'Performance Improvement',
  'Training Needs Analysis', 'Promotion Readiness', 'Other',
];

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SCHEDULED: 'bg-blue-100 text-blue-700 border-blue-200',
  ACTIVE: 'bg-green-100 text-green-700 border-green-200',
  COMPLETED: 'bg-red-100 text-red-700 border-red-200',
  ARCHIVED: 'bg-gray-100 text-gray-500 border-gray-200',
};

const TYPE_COLORS = {
  SelfAssessment: 'bg-blue-50 text-blue-700',
  SupervisorOnly: 'bg-green-50 text-green-700',
  Combined: 'bg-purple-50 text-purple-700',
};

const PURPOSE_COLORS = {
  'Career Development': 'bg-indigo-50 text-indigo-700',
  'Succession Planning': 'bg-violet-50 text-violet-700',
  'Performance Improvement': 'bg-orange-50 text-orange-700',
  'Training Needs Analysis': 'bg-teal-50 text-teal-700',
  'Promotion Readiness': 'bg-emerald-50 text-emerald-700',
  'Other': 'bg-gray-50 text-gray-600',
};

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-gray-500" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
        <div className="text-sm text-gray-800">{children}</div>
      </div>
    </div>
  );
}

function TargetAudienceDisplay({ assessment }) {
  const ta = assessment.targetAudience;
  if (!ta) {
    return <span>{assessment.target?.department || 'All Departments'} · {assessment.target?.position || 'All Positions'}</span>;
  }
  if (ta.type === 'ALL_DEPARTMENTS') return <span className="text-green-700 font-medium">All Departments</span>;
  if (ta.type === 'DEPARTMENT_ALL') {
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {(ta.departments || []).map(d => (
          <span key={d} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">{d}</span>
        ))}
      </div>
    );
  }
  if (ta.type === 'SPECIFIC_EMPLOYEES') {
    return (
      <span className="text-brand-red font-medium">
        {ta.employeeIds?.length || 0} specific employee(s)
      </span>
    );
  }
  return <span>—</span>;
}

export default function AssessmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const { show } = useToast();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [competencies, setCompetencies] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [targetGroups, setTargetGroups] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState({ name: '', department: '', position: '' });

  const [form, setForm] = useState({
    competencyId: '',
    targetGroup: '',
    purpose: '',
    reminderDaysBefore: '',
    description: '',
    targetAudience: { type: 'ALL_DEPARTMENTS', departments: [], employeeIds: [] },
    questionIds: [],
    startDate: '',
    endDate: '',
    timeLimit: '',
    type: 'SelfAssessment',
    weight: { selfAssessment: 20, supervisor: 80 },
  });

  const load = async () => {
    try {
      const { data } = await api.get(`/assessments/${id}`);
      const a = data.data.assessment;
      setAssessment(a);
      setForm({
        competencyId: a.competencyId?._id || '',
        targetGroup: a.targetGroup || '',
        purpose: a.purpose || '',
        reminderDaysBefore: a.reminderDaysBefore || '',
        description: a.description || '',
        targetAudience: a.targetAudience || { type: 'ALL_DEPARTMENTS', departments: [], employeeIds: [] },
        questionIds: a.questionIds?.map((q) => q._id) || [],
        startDate: a.startDate?.split('T')[0] || '',
        endDate: a.endDate?.split('T')[0] || '',
        timeLimit: a.timeLimit || '',
        type: a.type,
        weight: a.weight || { selfAssessment: 20, supervisor: 80 },
      });
    } catch (err) {
      show('Failed to load assessment.', 'error');
      nav('/assessments');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data.competencies)).catch(() => {});
    api.get('/assessments/employees/departments').then(({ data }) => setDepartments(data.data.departments)).catch(() => {});
  }, []);

  // Derive target groups from selected competency in edit form
  useEffect(() => {
    if (form.competencyId && competencies.length > 0) {
      const selected = competencies.find(c => c._id === form.competencyId);
      setTargetGroups(selected?.targetGroups?.map(t => t.targetGroup) || []);
    }
  }, [form.competencyId, competencies]);

  // Fetch questions when competencyId + targetGroup both set
  useEffect(() => {
    if (form.competencyId && form.targetGroup) {
      api.get('/questions', { params: { competencyId: form.competencyId, targetGroup: form.targetGroup } })
        .then(({ data }) => setQuestions(data.data.questions))
        .catch(() => {});
    } else {
      setQuestions([]);
    }
  }, [form.competencyId, form.targetGroup]);

  const handleEmployeeSearch = async () => {
    try {
      const { data } = await api.get('/assessments/employees/search', { params: employeeSearch });
      setSearchResults(data.data.employees);
    } catch { show('Employee search failed.', 'error'); }
  };

  const handleUpdate = async () => {
    try {
      const payload = {
        ...form,
        reminderDaysBefore: form.reminderDaysBefore ? Number(form.reminderDaysBefore) : null,
        timeLimit: form.timeLimit ? Number(form.timeLimit) : null,
      };
      await api.put(`/assessments/${id}`, payload);
      show('Assessment updated.', 'success');
      setEditModal(false);
      load();
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
      questionIds: prev.questionIds.includes(qId)
        ? prev.questionIds.filter((id) => id !== qId)
        : [...prev.questionIds, qId],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!assessment) return null;

  const questionCount = assessment.questionIds?.length || 0;

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Left Side - Scrollable Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sticky Header */}
        <div className="flex items-center gap-4 px-7 pt-7 pb-4 flex-shrink-0 bg-gray-50">
          <button onClick={() => nav('/assessments')} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold text-brand-black">{assessment.description || 'Assessment Details'}</h1>
            <p className="text-gray-500 text-sm">
              {assessment.competencyId?.name} · {assessment.type}
            </p>
          </div>
          {isAdmin && assessment.status === 'DRAFT' && (
            <div className="flex gap-2">
              <button onClick={() => setEditModal(true)} className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-100 transition-colors text-sm">
                <Edit2 className="w-4 h-4" /> Edit
              </button>
              <button onClick={handleDelete} className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          )}
        </div>

        {/* Sticky Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-7 pb-4 flex-shrink-0 bg-gray-50">
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-red/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-brand-red" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-semibold">Status</div>
                <span className={`badge badge-${assessment.status.toLowerCase()} text-[10px] py-0.5 px-2`}>{assessment.status}</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-semibold">Questions</div>
                <div className="text-lg font-bold text-brand-black">{assessment.questionIds?.length || 0}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-semibold">Type</div>
                <div className="text-sm font-bold text-brand-black">{assessment.type}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-7 pb-7 space-y-4">
          {/* Assessment Info */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h3 className="text-base font-semibold text-brand-black mb-3">Assessment Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Duration</div>
                  <div className="text-brand-black-soft">
                    {new Date(assessment.startDate).toLocaleDateString()} - {new Date(assessment.endDate).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Time Limit</div>
                  <div className="text-brand-black-soft">{assessment.timeLimit ? `${assessment.timeLimit} minutes` : 'No limit'}</div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 flex-shrink-0">Type</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${TYPE_COLORS[assessment.type] || 'bg-gray-50 text-gray-600'}`}>
                  {assessment.type}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Target</div>
                  <div className="text-brand-black-soft">
                    {assessment.target?.department || 'All Departments'} · {assessment.target?.position || 'All Positions'}
                  </div>
                </div>
              </div>
              {assessment.type === 'Combined' && (
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-xs text-gray-500 font-semibold uppercase">Weights</div>
                    <div className="text-brand-black-soft">
                      Self: {assessment.weight?.selfAssessment || 0}% · Supervisor: {assessment.weight?.supervisor || 0}%
                    </div>
                  </div>
                </div>
              </>
            )}

            <hr className="border-gray-100" />

            {/* Meta */}
            <div className="space-y-3">
              <InfoRow icon={Users} label="Created By">
                {assessment.createdBy?.name || '—'}
              </InfoRow>
              <InfoRow icon={Calendar} label="Created At">
                {new Date(assessment.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </InfoRow>
            </div>
          </div>
        </div>

        {/* ── Right: Scrollable questions pane ── */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">

            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-red" />
                Questions
                <span className="ml-1 bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{questionCount}</span>
              </h2>
            </div>

          {/* Questions List */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h3 className="text-base font-semibold text-brand-black mb-3">Questions ({assessment.questionIds?.length || 0})</h3>
            {assessment.questionIds?.length === 0 ? (
              <p className="text-gray-400 text-center py-8 text-sm">No questions added yet.</p>
            ) : (
              <div className="space-y-3">
                {assessment.questionIds?.map((q, idx) => (
                  <div key={q._id} className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brand-black-soft line-clamp-2">{q.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-semibold">{q.type}</span>
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
      </div>

      {/* Right Side - Inverted L Shape (Sticky Details Panel) */}
      <div className="w-80 flex-shrink-0 bg-gray-50 border-l border-gray-200">
        <div className="h-full overflow-y-auto custom-scrollbar p-6">
          <h3 className="text-lg font-semibold text-brand-black mb-4">Assessment Details</h3>
          <div className="space-y-4 text-sm">
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Competency</div>
              <div className="text-brand-black-soft font-medium">{assessment.competencyId?.name || 'Not specified'}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Description</div>
              <div className="text-brand-black-soft leading-relaxed">{assessment.description || 'No description provided'}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Created</div>
              <div className="text-brand-black-soft">{new Date(assessment.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Assessment" large>
        <div className="space-y-4">

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency</label>
              <select value={form.competencyId}
                onChange={(e) => setForm(prev => ({ ...prev, competencyId: e.target.value, targetGroup: '' }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm">
                <option value="">— Select —</option>
                {competencies.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.category})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Group *</label>
              <select value={form.targetGroup}
                onChange={(e) => setForm(prev => ({ ...prev, targetGroup: e.target.value }))}
                disabled={!form.competencyId}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm disabled:bg-gray-100 disabled:cursor-not-allowed">
                <option value="">{form.competencyId ? '— Select Target Group —' : '— Select competency first —'}</option>
                {targetGroups.map(tg => (
                  <option key={tg} value={tg}>{tg.charAt(0).toUpperCase() + tg.slice(1).replace('-', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm">
                <option value="SelfAssessment">Self Assessment</option>
                <option value="SupervisorOnly">Supervisor Only</option>
                <option value="Combined">Combined</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Purpose *</label>
              <select value={form.purpose} onChange={(e) => setForm(prev => ({ ...prev, purpose: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm">
                <option value="">— Select Purpose —</option>
                {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
              <input value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Reminder <span className="text-gray-400 font-normal text-xs">(days before deadline)</span>
              </label>
              <input type="number" min="1" max="30" placeholder="Optional"
                value={form.reminderDaysBefore}
                onChange={(e) => setForm(prev => ({ ...prev, reminderDaysBefore: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date</label>
              <input type="date" value={form.startDate}
                onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date</label>
              <input type="date" value={form.endDate}
                onChange={(e) => setForm(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
          </div>

          {/* Target Audience (edit) */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <label className="block text-sm font-semibold text-gray-700">Target Audience</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'ALL_DEPARTMENTS', label: 'All Departments' },
                { value: 'DEPARTMENT_ALL', label: 'Specific Dept(s)' },
                { value: 'SPECIFIC_EMPLOYEES', label: 'Specific Employee(s)' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(prev => ({ ...prev, targetAudience: { type: opt.value, departments: [], employeeIds: [] } }))}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    form.targetAudience.type === opt.value
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-red'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            {form.targetAudience.type === 'DEPARTMENT_ALL' && (
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1 bg-white">
                {departments.map(dept => (
                  <label key={dept} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input type="checkbox"
                      checked={form.targetAudience.departments.includes(dept)}
                      onChange={e => {
                        const depts = e.target.checked
                          ? [...form.targetAudience.departments, dept]
                          : form.targetAudience.departments.filter(d => d !== dept);
                        setForm(prev => ({ ...prev, targetAudience: { ...prev.targetAudience, departments: depts } }));
                      }}
                      className="w-4 h-4 accent-brand-red" />
                    {dept}
                  </label>
                ))}
              </div>
            )}

            {form.targetAudience.type === 'SPECIFIC_EMPLOYEES' && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" placeholder="Name…" value={employeeSearch.name}
                    onChange={e => setEmployeeSearch(prev => ({ ...prev, name: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-xs" />
                  <select value={employeeSearch.department}
                    onChange={e => setEmployeeSearch(prev => ({ ...prev, department: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-xs">
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input type="text" placeholder="Position…" value={employeeSearch.position}
                    onChange={e => setEmployeeSearch(prev => ({ ...prev, position: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-xs" />
                </div>
                <button type="button" onClick={handleEmployeeSearch}
                  className="w-full py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors flex items-center justify-center gap-1">
                  <Search className="w-3 h-3" /> Search Employees
                </button>
                {searchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y bg-white">
                    {searchResults.map(emp => {
                      const selected = form.targetAudience.employeeIds.includes(emp._id);
                      return (
                        <label key={emp._id} className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-gray-50 ${selected ? 'bg-red-50' : ''}`}>
                          <input type="checkbox" checked={selected}
                            onChange={e => {
                              const ids = e.target.checked
                                ? [...form.targetAudience.employeeIds, emp._id]
                                : form.targetAudience.employeeIds.filter(id => id !== emp._id);
                              setForm(prev => ({ ...prev, targetAudience: { ...prev.targetAudience, employeeIds: ids } }));
                            }}
                            className="w-4 h-4 accent-brand-red flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{emp.name}</p>
                            <p className="text-xs text-gray-400">{emp.department} · {emp.position}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                {form.targetAudience.employeeIds.length > 0 && (
                  <p className="text-xs text-brand-red font-semibold">{form.targetAudience.employeeIds.length} employee(s) selected</p>
                )}
              </div>
            )}
          </div>

          {/* Questions */}
          {questions.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Questions</label>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                {questions.map((q) => (
                  <label key={q._id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm">
                    <input type="checkbox" checked={form.questionIds.includes(q._id)} onChange={() => toggleQuestion(q._id)}
                      className="w-4 h-4 text-brand-red focus:ring-brand-red rounded" />
                    <span className="flex-1 line-clamp-1">{q.text}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{q.type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
          <button onClick={() => setEditModal(false)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleUpdate}
            className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Save Changes
          </button>
        </div>
      </Modal>
    </div>
  );
}
