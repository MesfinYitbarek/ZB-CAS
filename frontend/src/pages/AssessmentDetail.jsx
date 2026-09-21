import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ArrowLeft, Edit2, Trash2, Users, FileText,
  Target, Bell, Check, Search, Tag,
  CalendarDays, Timer, ChevronDown, Building2, Award, CircleDot, Repeat,
  CalendarClock, Loader2
} from 'lucide-react';
import Modal from '../components/Modal';
import api from '../utils/api';
import { useAssessmentDetail, useAllCompetencies, useDepartmentList, useQuestions, useEmployeeSearch } from '../hooks/queries';
import { queryKeys } from '../hooks/queryKeys';

const PURPOSES = [
  'Career Development', 'Succession Planning', 'Performance Improvement',
  'Training Needs Analysis', 'Promotion Readiness', 'Other',
];

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SCHEDULED: 'bg-gray-200 text-gray-700 border-gray-300',
  ACTIVE: 'bg-gray-200 text-gray-700 border-gray-300',
  COMPLETED: 'bg-red-100 text-red-700 border-red-200',
};

const TYPE_COLORS = {
  SelfAssessment: 'bg-gray-200 text-gray-800',
  SupervisorOnly: 'bg-brand-black text-white',
  Combined: 'bg-brand-red text-white',
};

const PURPOSE_COLORS = {
  'Career Development': 'bg-gray-100 text-gray-700',
  'Succession Planning': 'bg-gray-100 text-gray-700',
  'Performance Improvement': 'bg-gray-100 text-gray-700',
  'Training Needs Analysis': 'bg-gray-100 text-gray-700',
  'Promotion Readiness': 'bg-gray-100 text-gray-700',
  'Other': 'bg-gray-50 text-gray-600',
};

function TargetAudienceDisplay({ assessment }) {
  const ta = assessment.targetAudience;
  if (!ta) {
    return <span>{assessment.target?.department || 'All Departments'} · {assessment.target?.position || 'All Positions'}</span>;
  }
  if (ta.type === 'ALL_DEPARTMENTS') return <span className="text-gray-700 font-medium">All Departments</span>;
  if (ta.type === 'DEPARTMENT_ALL') {
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {(ta.departments || []).map(d => (
          <span key={d} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">{d}</span>
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
    default: return '';
  }
}

export default function AssessmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [editModal, setEditModal] = useState(false);
  const [targetGroups, setTargetGroups] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState({ name: '', department: '', position: '' });
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [deadlineModal, setDeadlineModal] = useState(false);
  const [deadlineForm, setDeadlineForm] = useState({ endDate: '', endTime: '17:00', startDate: '', startTime: '09:00' });
  const [extending, setExtending] = useState(false);

  const [form, setForm] = useState({    competencyId: '',
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
    maxAttempts: '',
    type: 'SelfAssessment',
    weight: { selfAssessment: 20, supervisor: 80 },
  });

  const { data: assessmentData, isLoading: loading } = useAssessmentDetail(id, {
    onError: () => {
      show('Failed to load assessment.', 'error');
      nav('/assessments');
    },
  });
  const assessment = assessmentData?.assessment || null;

  const { data: competencies = [] } = useAllCompetencies();
  const { data: departments = [] } = useDepartmentList();

  const { data: questionsData } = useQuestions(
    { competencyId: form.competencyId, targetGroup: form.targetGroup },
    { enabled: !!(form.competencyId && form.targetGroup) }
  );
  const questions = questionsData?.questions || [];

  const { data: searchData, refetch: refetchSearch } = useEmployeeSearch(employeeSearch, { enabled: false });
  const searchResults = searchData?.employees || [];

  useEffect(() => {
    if (!assessment) return;
    const a = assessment;
    setForm({
      competencyId: a.competencyId?.id || a.competencyId?._id || '',
      targetGroup: a.targetGroup || '',
      purpose: a.purpose || '',
      reminderDaysBefore: a.reminderDaysBefore || '',
      description: a.description || '',
      targetAudience: a.targetAudience || { type: 'ALL_DEPARTMENTS', departments: [], employeeIds: [] },
      questionIds: a.questionIds?.map((q) => q._id) || [],
      startDate: a.startDate?.split('T')[0] || '',
      startTime: a.startDate ? new Date(a.startDate).toISOString().slice(11, 16) : '09:00',
      endDate: a.endDate?.split('T')[0] || '',
      endTime: a.endDate ? new Date(a.endDate).toISOString().slice(11, 16) : '17:00',
      timeLimit: a.timeLimit || '',
      maxAttempts: a.maxAttempts ?? '',
      type: a.type,
      weight: a.weight || { selfAssessment: 20, supervisor: 80 },
    });
  }, [assessment]);

  // Derive target groups from selected competency in edit form
  useEffect(() => {
    if (form.competencyId && competencies.length > 0) {
      const selected = competencies.find(c => c._id === form.competencyId);
      setTargetGroups(selected?.targetGroups?.map(t => t.targetGroup) || []);
    }
  }, [form.competencyId, competencies]);

  const openEditModal = () => {
    queryClient.removeQueries({ queryKey: queryKeys.assessments.employeesSearch });
    setEditModal(true);
  };

  const handleEmployeeSearch = async () => {
    try {
      await refetchSearch();
    } catch { show('Employee search failed.', 'error'); }
  };

  const updateMutation = useMutation({
    mutationFn: (payload) => api.put(`/assessments/${id}`, payload),
    onSuccess: () => {
      show('Assessment updated.', 'success');
      setEditModal(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.all });
    },
    onError: (err) => show(err.response?.data?.message || 'Update failed.', 'error'),
  });

  const handleUpdate = async () => {
    try {
      const { startTime, endTime, ...rest } = form;
      const startDateTime = form.startDate && startTime
        ? new Date(`${form.startDate}T${startTime}`).toISOString()
        : form.startDate || undefined;
      const endDateTime = form.endDate && endTime
        ? new Date(`${form.endDate}T${endTime}`).toISOString()
        : form.endDate || undefined;
      if (startDateTime && endDateTime && new Date(endDateTime) <= new Date(startDateTime)) {
        show('End date must be after start date.', 'error');
        return;
      }
      const payload = {
        ...rest,
        startDate: startDateTime,
        endDate: endDateTime,
        reminderDaysBefore: form.reminderDaysBefore ? Number(form.reminderDaysBefore) : null,
        timeLimit: form.timeLimit ? Number(form.timeLimit) : null,
        maxAttempts: form.maxAttempts ? Number(form.maxAttempts) : null,
      };
      await updateMutation.mutateAsync(payload);
    } catch {}
  };

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/assessments/${id}`),
    onSuccess: () => {
      show('Assessment deleted.', 'success');
      nav('/assessments');
    },
    onError: (err) => show(err.response?.data?.message || 'Delete failed.', 'error'),
  });

  const handleDelete = async () => {
    if (!window.confirm('Delete this assessment? This cannot be undone.')) return;
    try {
      await deleteMutation.mutateAsync();
    } catch {}
  };

  const toggleQuestion = (qId) => {
    setForm((prev) => ({
      ...prev,
      questionIds: prev.questionIds.includes(qId)
        ? prev.questionIds.filter((id) => id !== qId)
        : [...prev.questionIds, qId],
    }));
  };

  const openDeadlineModal = () => {
    if (!assessment?.endDate) return;
    const end = new Date(assessment.endDate);
    const base = {
      endDate: end.toISOString().split('T')[0],
      endTime: end.toISOString().slice(11, 16),
    };
    if (assessment?.status === 'SCHEDULED' && assessment?.startDate) {
      const start = new Date(assessment.startDate);
      setDeadlineForm({
        ...base,
        startDate: start.toISOString().split('T')[0],
        startTime: start.toISOString().slice(11, 16),
      });
    } else {
      setDeadlineForm(base);
    }
    setDeadlineModal(true);
  };

  const extendMutation = useMutation({
    mutationFn: (payload) => api.patch(`/assessments/${id}/deadline`, payload),
    onSuccess: () => {
      show('Assessment dates extended successfully.', 'success');
      setDeadlineModal(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.all });
    },
    onError: (err) => show(err.response?.data?.message || 'Failed to extend deadline.', 'error'),
  });

  const handleExtendDeadline = async () => {
    if (!deadlineForm.endDate) { show('Please select a new end date.', 'error'); return; }
    const newEnd = new Date(`${deadlineForm.endDate}T${deadlineForm.endTime}`);
    if (isNaN(newEnd.getTime()) || newEnd <= new Date()) {
      show('The new deadline must be in the future.', 'error');
      return;
    }
    let payload = { endDate: newEnd.toISOString() };
    if (assessment?.status === 'SCHEDULED') {
      if (!deadlineForm.startDate) { show('Please select a new start date.', 'error'); return; }
      const newStart = new Date(`${deadlineForm.startDate}T${deadlineForm.startTime}`);
      if (isNaN(newStart.getTime()) || newStart <= new Date()) {
        show('The start date must be in the future.', 'error');
        return;
      }
      if (newEnd <= newStart) {
        show('The end date must be after the start date.', 'error');
        return;
      }
      payload.startDate = newStart.toISOString();
    }
    setExtending(true);
    try {
      await extendMutation.mutateAsync(payload);
    } catch {}
    setExtending(false);
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
    SCHEDULED: 'from-gray-600 to-gray-900',
    ACTIVE:    'from-gray-600 to-gray-900',
    COMPLETED: 'from-red-500 to-red-600',
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
            {isAdmin && (assessment.status === 'ACTIVE' || assessment.status === 'SCHEDULED') && (
              <button
                onClick={openDeadlineModal}
                className="flex items-center gap-1.5 px-2 py-1 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <CalendarClock className="w-3 h-3" /> Extend Deadline
              </button>
            )}
            {isAdmin && assessment.status === 'DRAFT' && (
              <>
                <button
                  onClick={openEditModal}
                  className="flex items-center gap-1.5 px-2 py-1 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete
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
                <StatCard icon={CalendarDays} label="Starts" value={fmtDate(assessment.startDate)} accent="text-gray-700 bg-gray-100" />
                <StatCard icon={CalendarDays} label="Ends" value={fmtDate(assessment.endDate)} accent="text-red-500 bg-red-50" />
                <StatCard icon={Timer} label="Time Limit" value={assessment.timeLimit ? `${assessment.timeLimit} min` : 'No limit'} accent="text-gray-700 bg-gray-100" />
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
                  const activeColor = s.key === 'ACTIVE' ? 'bg-brand-black' : 'bg-brand-red';
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
                        <div className={`h-0.5 flex-1 mx-1.5 -mt-3 ${i < flowIdx ? (workflowSteps[i].key === 'ACTIVE' ? 'bg-brand-black' : 'bg-brand-red') : 'bg-gray-200'}`} />
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
            <SectionTitle icon={Users} title="Target Audience" accent="text-gray-700 bg-gray-100" />
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
            <SectionTitle icon={Bell} title="Reminders & Scoring" accent="text-gray-700 bg-gray-100" />
            <div className="mt-3 space-y-3 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Reminder</span>
                <span className="font-medium">
                  {assessment.reminderDaysBefore ? `${assessment.reminderDaysBefore} day${assessment.reminderDaysBefore !== 1 ? 's' : ''} before` : '—'}
                </span>
              </div>
              {assessment.reminderSent && (
                <div className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg w-fit">
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
                    <div className="bg-gray-700 h-1.5 rounded-full transition-all" style={{ width: `${assessment.weight?.supervisor || 0}%` }} />
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
              <SummaryRow icon={Repeat} label="Attempts" value={assessment.maxAttempts ?? 'Unlimited'} />
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
                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{q.targetGroup}</span>
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
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Attempts <span className="text-gray-400 font-normal text-xs">(blank = unlimited)</span>
              </label>
              <input type="number" min="1" placeholder="e.g., 3"
                value={form.maxAttempts}
                onChange={(e) => setForm(prev => ({ ...prev, maxAttempts: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Time Limit <span className="text-gray-400 font-normal text-xs">(minutes, blank = none)</span>
              </label>
              <input type="number" min="1" placeholder="e.g., 60"
                value={form.timeLimit}
                onChange={(e) => setForm(prev => ({ ...prev, timeLimit: e.target.value }))}
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time</label>
              <input type="time" value={form.startTime}
                onChange={(e) => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date</label>
              <input type="date" value={form.endDate}
                onChange={(e) => setForm(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time</label>
              <input type="time" value={form.endTime}
                onChange={(e) => setForm(prev => ({ ...prev, endTime: e.target.value }))}
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

      {/* ── Extend Deadline Modal ── */}
      <Modal open={deadlineModal} onClose={() => setDeadlineModal(false)} title="Extend Dates">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Set new dates for <span className="font-semibold text-gray-900">{assessment.competencyId?.name || 'this assessment'}</span>.
          </p>
          {assessment?.status === 'SCHEDULED' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">New Start Date *</label>
                <input type="date" value={deadlineForm.startDate}
                  onChange={e => setDeadlineForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time *</label>
                <input type="time" value={deadlineForm.startTime}
                  onChange={e => setDeadlineForm(prev => ({ ...prev, startTime: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">New End Date *</label>
              <input type="date" value={deadlineForm.endDate}
                onChange={e => setDeadlineForm(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time *</label>
              <input type="time" value={deadlineForm.endTime}
                onChange={e => setDeadlineForm(prev => ({ ...prev, endTime: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1.5">
            {assessment?.status === 'SCHEDULED' && (
              <div className="flex items-center justify-between">
                <span>Current start</span>
                <span className="font-semibold text-gray-700">
                  {new Date(assessment.startDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>Current deadline</span>
              <span className="font-semibold text-gray-700">
                {new Date(assessment.endDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeadlineModal(false)}
              className="px-2 py-1 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleExtendDeadline} disabled={extending}
              className="px-2 py-1 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5">
              {extending && <Loader2 className="w-2 h-2 animate-spin" />}
              Extend Deadline
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
