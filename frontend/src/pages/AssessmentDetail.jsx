import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ArrowLeft, Edit2, Trash2, Users, FileText,
  Target, Bell, Check, Search, Tag,
  CalendarDays, Timer, ChevronDown, Building2, Award, CircleDot
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

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`p-2 rounded-lg ${accent}`}><Icon className="w-4 h-4" /></span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</div>
        <div className="text-sm font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, accent }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`p-1.5 rounded-lg ${accent}`}><Icon className="w-4 h-4" /></span>
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <span className="text-gray-500 w-24 flex-shrink-0">{label}</span>
      <span className="font-medium text-gray-800 capitalize">{value}</span>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusNote(status) {
  switch (status) {
    case 'DRAFT': return 'Assessment is being set up and not yet scheduled.';
    case 'SCHEDULED': return 'Scheduled and waiting to go live on the start date.';
    case 'ACTIVE': return 'Currently live — employees can take the assessment.';
    case 'COMPLETED': return 'Assessment period has ended.';
    case 'ARCHIVED': return 'Archived and no longer in use.';
    default: return '';
  }
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
  const [expandedIdx, setExpandedIdx] = useState(null);

  const [form, setForm] = useState({    competencyId: '',
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

  const STATUS_FLOW = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED'];
  const flowIdx = STATUS_FLOW.indexOf(assessment.status);
  const workflowSteps = [
    { key: 'DRAFT',     label: 'Draft',     sub: 'Setup' },
    { key: 'SCHEDULED', label: 'Scheduled', sub: 'Waiting' },
    { key: 'ACTIVE',    label: 'Active',    sub: 'In progress' },
    { key: 'COMPLETED', label: 'Completed', sub: 'Done' },
  ];

  const statusBar = {
    DRAFT:     'from-gray-400 to-gray-500',
    SCHEDULED: 'from-blue-500 to-blue-600',
    ACTIVE:    'from-green-500 to-green-600',
    COMPLETED: 'from-red-500 to-red-600',
    ARCHIVED:  'from-gray-500 to-gray-600',
  }[assessment.status] || 'from-gray-400 to-gray-500';

  const TYPE_ICON = {
    SelfAssessment: 'Self',
    SupervisorOnly: 'Sup.',
    Combined: 'Both',
  }[assessment.type];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => nav('/assessments')}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              title="Back to assessments"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg  font-bold text-brand-black truncate">
                  {assessment.competencyId?.name || 'Assessment'}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${STATUS_COLORS[assessment.status] || STATUS_COLORS.DRAFT}`}>
                  {assessment.status}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {isAdmin && assessment.status === 'DRAFT' && (
              <>
                <button
                  onClick={() => { setSearchResults([]); setEditModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* ── Hero / Overview card ── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className={`h-1.5 bg-gradient-to-r ${statusBar}`} />
          <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${TYPE_COLORS[assessment.type] || 'bg-gray-50 text-gray-600'}`}>
                  {assessment.type}
                </span>
                {assessment.purpose && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${PURPOSE_COLORS[assessment.purpose] || 'bg-gray-50 text-gray-600'}`}>
                    {assessment.purpose}
                  </span>
                )}
                {assessment.targetGroup && (
                  <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full font-medium capitalize">
                    {assessment.targetGroup.replace('-', ' ')}
                  </span>
                )}
              </div>

              {assessment.description && (
                <p className="mt-4 text-sm text-gray-600 leading-relaxed max-w-3xl">{assessment.description}</p>
              )}

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard icon={CalendarDays} label="Starts" value={fmtDate(assessment.startDate)} accent="text-blue-600 bg-blue-50" />
                <StatCard icon={CalendarDays} label="Ends" value={fmtDate(assessment.endDate)} accent="text-red-500 bg-red-50" />
                <StatCard icon={Timer} label="Time Limit" value={assessment.timeLimit ? `${assessment.timeLimit} min` : 'No limit'} accent="text-amber-600 bg-amber-50" />
                <StatCard icon={FileText} label="Questions" value={`${questionCount}`} accent="text-brand-red bg-brand-red/10" />
              </div>
            </div>

            {/* Lifecycle stepper */}
            <div className="lg:w-80 flex-shrink-0">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Lifecycle</div>
              <div className="flex items-center">
                {workflowSteps.map((s, i) => {
                  const done = i < flowIdx;
                  const current = i === flowIdx;
                  const activeColor = s.key === 'ACTIVE' ? 'bg-green-500' : 'bg-brand-red';
                  return (
                    <div key={s.key} className="flex items-center flex-1 last:flex-none">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                          done ? `${activeColor} text-white`
                          : current ? `${activeColor} text-white ring-4 ring-red-100`
                          : 'bg-gray-100 text-gray-400'
                        }`}>
                          {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                        </div>
                        <div className={`text-[10px] font-semibold mt-1 ${current ? 'text-gray-900' : done ? 'text-gray-600' : 'text-gray-300'}`}>
                          {s.label}
                        </div>
                      </div>
                      {i < workflowSteps.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-1.5 -mt-3 ${i < flowIdx ? (workflowSteps[i].key === 'ACTIVE' ? 'bg-green-400' : 'bg-brand-red') : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-xs text-gray-400 text-center">{statusNote(assessment.status)}</div>
            </div>
          </div>
        </div>

        {/* ── Detail cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Target Audience */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <SectionTitle icon={Users} title="Target Audience" accent="text-blue-600 bg-blue-50" />
            <div className="mt-3">
              <TargetAudienceDisplay assessment={assessment} />
            </div>
            {assessment.createdBy?.name && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                <CircleDot className="w-3.5 h-3.5 text-gray-400" />
                Created by <span className="font-semibold text-gray-700">{assessment.createdBy.name}</span>
                <span className="text-gray-300">·</span>
                {new Date(assessment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>

          {/* Reminder & Scoring */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <SectionTitle icon={Bell} title="Reminders & Scoring" accent="text-amber-600 bg-amber-50" />
            <div className="mt-3 space-y-3 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Reminder</span>
                <span className="font-medium">
                  {assessment.reminderDaysBefore ? `${assessment.reminderDaysBefore} day${assessment.reminderDaysBefore !== 1 ? 's' : ''} before` : '—'}
                </span>
              </div>
              {assessment.reminderSent && (
                <div className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-lg w-fit">
                  <Check className="w-3.5 h-3.5" /> Reminder sent
                </div>
              )}
              {assessment.type === 'Combined' && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-gray-500">Self-assessment</span>
                    <span className="font-bold text-gray-900">{assessment.weight?.selfAssessment || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-brand-red h-1.5 rounded-full transition-all" style={{ width: `${assessment.weight?.selfAssessment || 0}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mb-2 mt-3">
                    <span className="text-gray-500">Supervisor</span>
                    <span className="font-bold text-gray-900">{assessment.weight?.supervisor || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${assessment.weight?.supervisor || 0}%` }} />
                  </div>
                </div>
              )}
              {assessment.type !== 'Combined' && (
                <p className="text-xs text-gray-400">
                  {assessment.type === 'SelfAssessment' ? 'Scored from the employee\'s own self-assessment responses.' : 'Scored from supervisor evaluations of team members.'}
                </p>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <SectionTitle icon={Award} title="Assessment Summary" accent="text-brand-red bg-brand-red/10" />
            <div className="mt-3 space-y-3">
              <SummaryRow icon={Building2} label="Type" value={assessment.type} />
              <SummaryRow icon={Target} label="Purpose" value={assessment.purpose || '—'} />
              <SummaryRow icon={Tag} label="Target Group" value={assessment.targetGroup ? assessment.targetGroup.replace('-', ' ') : '—'} />
              <SummaryRow icon={FileText} label="Questions" value={`${questionCount} question${questionCount !== 1 ? 's' : ''}`} />
            </div>
          </div>
        </div>

        {/* ── Questions ── */}
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-brand-red/10"><FileText className="w-4 h-4 text-brand-red" /></span>
              <h2 className="text-sm font-bold text-gray-800">Questions</h2>
              <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{questionCount}</span>
            </div>
          </div>

          {questionCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <FileText className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No questions added to this assessment.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {assessment.questionIds?.map((q, idx) => {
                const open = expandedIdx === idx;
                return (
                  <div key={q._id} className="hover:bg-gray-50/50 transition-colors">
                    <button
                      onClick={() => setExpandedIdx(open ? null : idx)}
                      className="w-full flex items-start gap-3 text-left px-6 py-4"
                    >
                      <span className="flex-shrink-0 mt-0.5 w-7 h-7 bg-brand-red/10 text-brand-red text-xs font-bold rounded-full flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-relaxed line-clamp-2">{q.text}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{q.type}</span>
                          <span className="text-xs text-gray-400">{q.score} pt{q.score !== 1 ? 's' : ''}</span>
                          {q.targetGroup && (
                            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{q.targetGroup}</span>
                          )}
                          {q.options?.length > 0 && (
                            <span className="text-xs text-gray-400">{q.options.length} options</span>
                          )}
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div className="px-6 pb-4 pl-10">
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                          {q.scenario && (
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Scenario</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{q.scenario}</p>
                            </div>
                          )}
                          {q.options?.length > 0 ? (
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Options</p>
                              <ul className="space-y-1.5">
                                {q.options.map((opt, oi) => (
                                  <li key={oi} className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0 mt-0.5" />
                                    <span>{typeof opt === 'string' ? opt : (opt.text ?? JSON.stringify(opt))}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : q.type === 'TrueFalse' ? (
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Options</p>
                              <ul className="space-y-1.5">
                                {['True', 'False'].map((opt, oi) => (
                                  <li key={oi} className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0 mt-0.5" />
                                    <span>{opt}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : q.type === 'Rating' ? (
                            <p className="text-sm text-gray-400">1–5 rating scale.</p>
                          ) : (
                            <p className="text-sm text-gray-400">Open-ended / essay-style question.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
