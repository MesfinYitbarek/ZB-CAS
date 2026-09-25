import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Calendar, Clock, ChevronLeft, Target, Users, AlertCircle,
  Check, Shuffle, Edit2, Bell, Search,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { useAllCompetencies, useDepartmentList, useQuestions, useEmployeeSearch } from '../hooks/queries';
import { queryKeys } from '../hooks/queryKeys';

const PURPOSES = [
  'Career Development',
  'Succession Planning',
  'Performance Improvement',
  'Training Needs Analysis',
  'Promotion Readiness',
  'Other',
];

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 };

const formatLead = (mins) => {
  if (!mins || mins <= 0) return '';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''}`;
  if (mins % 60 !== 0) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  if (mins < 2880) { const h = mins / 60; return `${h} hour${h !== 1 ? 's' : ''}`; }
  const d = mins / 1440; return Number.isInteger(d) ? `${d} day${d !== 1 ? 's' : ''}` : `${Math.floor(d)}d ${Math.floor((mins % 1440) / 60)}h`;
};

const initForm = () => ({
  competencyId: '',
  targetGroup: '',
  purpose: '',
  reminderValue: '',
  reminderUnit: 'days',
  description: '',
  targetAudience: { type: 'ALL_DEPARTMENTS', departments: [], employeeIds: [] },
  questionIds: [],
  reexamQuestionIds: [],
  startDate: '',
  startTime: '09:00',
  endDate: '',
  endTime: '17:00',
  timeLimit: '',
  maxAttempts: '',
  type: 'SelfAssessment',
  weight: { selfAssessment: 20, supervisor: 80 },
});

export default function AssessmentCreate() {
  const nav = useNavigate();
  const { show } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(initForm());
  const [targetGroups, setTargetGroups] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState({ name: '', department: '', position: '' });
  const [questionSelectionMode, setQuestionSelectionMode] = useState('auto');
  const [autoSelectionConfig, setAutoSelectionConfig] = useState({
    totalQuestions: 10,
    questionTypes: {
      MCQ: 3, Rating: 2, TrueFalse: 2, MultiSelect: 1, ScenarioMCQ: 1, ShortAnswer: 1
    }
  });
  const [saving, setSaving] = useState(false);

  const { data: competencies = [] } = useAllCompetencies();
  const { data: departments = [] } = useDepartmentList();

  const questionsQuery = useQuestions(
    { competencyId: form.competencyId ?? '', targetGroup: form.targetGroup ?? '' },
    { enabled: !!(form.competencyId && form.targetGroup) }
  );
  const questions = questionsQuery.data?.questions || [];

  const { data: searchData, refetch: refetchSearch } = useEmployeeSearch(employeeSearch, { enabled: false });
  const searchResults = searchData?.employees || [];

  // ── Auto-fill description from competency targetGroup ───────────────────
  useEffect(() => {
    if (!form.competencyId || !form.targetGroup) return;
    const selectedComp = competencies.find(c => c._id === form.competencyId);
    if (!selectedComp) return;
    const tgObj = selectedComp.targetGroups?.find(t => t.targetGroup === form.targetGroup);
    if (tgObj?.description) {
      setForm(prev => ({ ...prev, description: tgObj.description }));
    }
  }, [form.competencyId, form.targetGroup, competencies]);

  // ── Derive target groups ────────────────────────────────────────────────────
  useEffect(() => {
    if (form.competencyId) {
      const sel = competencies.find(c => c._id === form.competencyId);
      setTargetGroups(sel?.targetGroups?.map(t => t.targetGroup) || []);
      setForm(prev => ({ ...prev, targetGroup: '', questionIds: [] }));
      setQuestionSelectionMode('auto');
    } else {
      setTargetGroups([]);
    }
  }, [form.competencyId, competencies]);

  // ── Reset question selection whenever a new competency / target-group sets ──
  // the questions list ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (questionsQuery.data) {
      setForm(prev => ({ ...prev, questionIds: [] }));
      setQuestionSelectionMode('auto');
    }
  }, [questionsQuery.data]);

  // ── Employee search ──────────────────────────────────────────────────────────
  const handleEmployeeSearch = async () => {
    try {
      const res = await refetchSearch();
      const emps = res?.data?.employees || [];
      if (emps.length === 0) show('No employees found matching your criteria.', 'warning');
    } catch {
      show('Employee search failed.', 'error');
    }
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
    const end   = new Date(`${form.endDate}T${form.endTime}`);
    const now   = new Date();
    if (!form.startDate || !form.endDate) { show('Start date and end date are required.', 'error'); return false; }
    if (isNaN(start.getTime()) || isNaN(end.getTime())) { show('Invalid date or time format.', 'error'); return false; }
    if (start <= now) { show('Start date and time must be in the future.', 'error'); return false; }
    if (end <= start) { show('End date and time must be after start date and time.', 'error'); return false; }
    if ((end - start) / (1000 * 60 * 60) < 1) { show('Assessment duration must be at least 1 hour.', 'error'); return false; }
    return true;
  };

  const validateForm = () => {
    if (!form.competencyId) { show('Please select a competency.', 'error'); return false; }
    if (!form.targetGroup)  { show('Please select a target group.', 'error'); return false; }
    if (!form.purpose)      { show('Please select a purpose.', 'error'); return false; }
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

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/assessments', payload),
    onSuccess: () => {
      show('Assessment created successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.all });
      nav('/assessments');
    },
    onError: (err) => show(err.response?.data?.message || 'Failed to create assessment.', 'error'),
  });

  const handleSave = async () => {
    try {
      if (!validateDateTime()) return;
      if (!validateForm()) return;
      setSaving(true);
      const startDateTime = new Date(`${form.startDate}T${form.startTime}`).toISOString();
      const endDateTime   = new Date(`${form.endDate}T${form.endTime}`).toISOString();
      const payload = {
        competencyId: form.competencyId,
        targetGroup: form.targetGroup,
        purpose: form.purpose,
        reminderMinutesBefore: form.reminderValue ? Number(form.reminderValue) * UNIT_MINUTES[form.reminderUnit] : null,
        description: form.description,
        targetAudience: form.targetAudience,
        questionIds: form.questionIds,
        reexamQuestionIds: form.reexamQuestionIds,
        startDate: startDateTime,
        endDate: endDateTime,
        timeLimit: form.timeLimit ? Number(form.timeLimit) : null,
        maxAttempts: form.maxAttempts ? Number(form.maxAttempts) : null,
        type: form.type,
        weight: form.weight,
      };
      await createMutation.mutateAsync(payload);
    } catch {
      // handled by mutation onError
    } finally {
      setSaving(false);
    }
  };

  const toggleQuestion = (qId) => {
    setForm(prev => ({
      ...prev,
      questionIds: prev.questionIds.includes(qId)
        ? prev.questionIds.filter(id => id !== qId)
        : [...prev.questionIds, qId],
    }));
  };

  // Re-exam pool: a second question set served on retakes (attempt ≥ 2).
  // Never overlaps the main set.
  const toggleReexamQuestion = (qId) => {
    setForm(prev => {
      if (prev.questionIds.includes(qId)) return prev;
      return {
        ...prev,
        reexamQuestionIds: prev.reexamQuestionIds.includes(qId)
          ? prev.reexamQuestionIds.filter(id => id !== qId)
          : [...prev.reexamQuestionIds, qId],
      };
    });
  };

  const autoPickReexam = () => {
    const remaining = shuffleArray(questions.filter(q => !form.questionIds.includes(q._id)));
    const count = Math.min(form.questionIds.length || remaining.length, remaining.length);
    const picked = remaining.slice(0, count).map(q => q._id);
    setForm(prev => ({ ...prev, reexamQuestionIds: picked }));
    show(picked.length ? `${picked.length} re-exam question(s) auto-picked.` : 'No remaining questions to pick from.', picked.length ? 'success' : 'warning');
  };

  const getQuestionTypeCount = (type) => questions.filter(q => q.type === type).length;
  const getTotalAutoQuestions = () => Object.values(autoSelectionConfig.questionTypes).reduce((s, c) => s + c, 0);

  const canSubmit =
    form.competencyId && form.targetGroup && form.purpose &&
    form.startDate && form.endDate &&
    !(form.type === 'Combined' && form.weight.selfAssessment + form.weight.supervisor !== 100) &&
    (form.type === 'SupervisorOnly' || form.questionIds.length > 0);

  const actionButtons = (
    <div className="flex gap-3">
      <button onClick={() => nav('/assessments')}
        className="px-5 py-2.5 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
      <button onClick={handleSave}
        disabled={!canSubmit || saving || createMutation.isPending}
        className="px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
        <Plus className="w-4 h-4" /> {saving || createMutation.isPending ? 'Creating…' : 'Create Assessment'}
      </button>
    </div>
  );

  return (
    <div className="p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/assessments')} title="Back to assessments"
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-700" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-black">Create Assessment</h1>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Basic Information */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-card">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" /> Basic Information
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency *</label>
              <select value={form.competencyId} onChange={e => setForm(prev => ({ ...prev, competencyId: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" required>
                <option value="">— Select Competency —</option>
                {competencies.map(c => <option key={c._id} value={c._id}>{c.name} ({c.category})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Group *</label>
              <select value={form.targetGroup} onChange={e => setForm(prev => ({ ...prev, targetGroup: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm disabled:bg-gray-100 disabled:cursor-not-allowed" required disabled={!form.competencyId}>
                <option value="">{form.competencyId ? '— Select Target Group —' : '— Select a competency first —'}</option>
                {targetGroups.map(tg => <option key={tg} value={tg}>{tg.charAt(0).toUpperCase() + tg.slice(1).replace('-', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Assessment Type *</label>
              <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm">
                <option value="SelfAssessment">Self Assessment</option>
                <option value="SupervisorOnly">Supervisor Only</option>
                <option value="Combined">Combined (Self + Supervisor)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Purpose *</label>
              <select value={form.purpose} onChange={e => setForm(prev => ({ ...prev, purpose: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" required>
                <option value="">— Select Purpose —</option>
                {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <input value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g., Q1 2025 Communication Skills Assessment"
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" />
            {form.targetGroup && (
              <p className="mt-1 text-xs text-gray-500 italic">
                {form.description ? 'You can edit the auto-filled description above' : 'Selecting a target group will suggest a description here'}
              </p>
            )}
          </div>
        </div>

        {/* Schedule & Duration */}
        <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Schedule &amp; Duration
          </h3>
          <div className="bg-gray-200 border-l-4 border-gray-700 p-2 rounded mb-3">
            <p className="text-[10px] text-gray-700 flex items-center gap-1">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span><strong>Note:</strong> The assessment auto-activates at the scheduled start time.</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date *</label>
              <input type="date" value={form.startDate} onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time *</label>
              <input type="time" value={form.startTime} onChange={e => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date *</label>
              <input type="date" value={form.endDate} onChange={e => setForm(prev => ({ ...prev, endDate: e.target.value }))}
                min={form.startDate || new Date().toISOString().split('T')[0]}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time *</label>
              <input type="time" value={form.endTime} onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" required />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time Limit per Attempt (minutes, Optional)</label>
              <input type="number" value={form.timeLimit} onChange={e => setForm(prev => ({ ...prev, timeLimit: e.target.value }))}
                placeholder="e.g., 60 (leave empty for no limit)" min={1}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Number of Attempts (Optional)</label>
              <input type="number" value={form.maxAttempts} onChange={e => setForm(prev => ({ ...prev, maxAttempts: e.target.value }))}
                placeholder="e.g., 3 (leave empty for unlimited)" min={1}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-300">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-700" /> Reminder <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <div className="flex items-center gap-3">
              <input type="number" value={form.reminderValue} onChange={e => setForm(prev => ({ ...prev, reminderValue: e.target.value }))}
                placeholder="e.g., 2" min={1}
                className="w-32 h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" />
              <select value={form.reminderUnit} onChange={e => setForm(prev => ({ ...prev, reminderUnit: e.target.value }))}
                className="h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm">
                <option value="minutes">Minute(s)</option>
                <option value="hours">Hour(s)</option>
                <option value="days">Day(s)</option>
              </select>
              <span className="text-sm text-gray-600">before end date</span>
            </div>
            {form.reminderValue && (
              <p className="mt-1 text-xs text-gray-700">Participants will be notified {formatLead(Number(form.reminderValue) * UNIT_MINUTES[form.reminderUnit])} before the assessment ends.</p>
            )}
          </div>
        </div>

        {/* Target Audience */}
        <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Target Audience
          </h3>
          <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
            <label className="block text-sm font-semibold text-gray-700">Target Audience *</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'ALL_DEPARTMENTS', label: 'All Departments' },
                { value: 'DEPARTMENT_ALL',  label: 'Specific Dept(s)' },
                { value: 'SPECIFIC_EMPLOYEES', label: 'Specific Employee(s)' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(prev => ({ ...prev, targetAudience: { type: opt.value, departments: [], employeeIds: [] } }))}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${form.targetAudience.type === opt.value ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-300 hover:border-brand-red'}`}>
                  {opt.label}
                </button>
              ))}
            </div>

            {form.targetAudience.type === 'ALL_DEPARTMENTS' && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">All active employees across all departments will be assigned this assessment.</p>
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
                        <input type="checkbox" checked={form.targetAudience.departments.includes(dept)}
                          onChange={e => {
                            const depts = e.target.checked
                              ? [...form.targetAudience.departments, dept]
                              : form.targetAudience.departments.filter(d => d !== dept);
                            setForm(prev => ({ ...prev, targetAudience: { ...prev.targetAudience, departments: depts } }));
                          }}
                          className="w-4 h-4 accent-brand-red" />
                        <span className="text-gray-700">{dept}</span>
                      </label>
                    ))}
                  </div>
                )}
                {form.targetAudience.departments.length > 0 && (
                  <p className="text-xs text-brand-red font-medium mt-1">{form.targetAudience.departments.length} department(s) selected</p>
                )}
              </div>
            )}

            {form.targetAudience.type === 'SPECIFIC_EMPLOYEES' && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" placeholder="Search by name…" value={employeeSearch.name}
                    onChange={e => setEmployeeSearch(prev => ({ ...prev, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleEmployeeSearch()}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red" />
                  <select value={employeeSearch.department} onChange={e => setEmployeeSearch(prev => ({ ...prev, department: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red">
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input type="text" placeholder="Filter by position…" value={employeeSearch.position}
                    onChange={e => setEmployeeSearch(prev => ({ ...prev, position: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleEmployeeSearch()}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-brand-red" />
                </div>
                <button type="button" onClick={handleEmployeeSearch}
                  className="w-full py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors flex items-center justify-center gap-1">
                  <Search className="w-3 h-3" /> Search Employees
                </button>
                {searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y bg-white">
                    {searchResults.map(emp => {
                      const selected = form.targetAudience.employeeIds.includes(emp._id);
                      return (
                        <label key={emp._id}
                          className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${selected ? 'bg-red-50' : ''}`}>
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
                          {selected && <Check className="w-3 h-3 text-brand-red flex-shrink-0" />}
                        </label>
                      );
                    })}
                  </div>
                )}
                {form.targetAudience.employeeIds.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-brand-red font-semibold bg-red-50 px-3 py-1.5 rounded-lg">
                    <Users className="w-3 h-3" /> {form.targetAudience.employeeIds.length} employee(s) selected
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Combined Weights */}
        {form.type === 'Combined' && (
          <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Combined Assessment Weights</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Self-Assessment Weight (%) *</label>
                <input type="number" value={form.weight.selfAssessment}
                  onChange={e => { const w = Number(e.target.value); setForm(prev => ({ ...prev, weight: { selfAssessment: w, supervisor: 100 - w } })); }}
                  min={0} max={100}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Supervisor Weight (%)</label>
                <input type="number" value={form.weight.supervisor} readOnly
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-gray-100 text-sm" />
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

        {/* Question Selection */}
        {form.competencyId && form.targetGroup && questions.length > 0 && form.type !== 'SupervisorOnly' && (
          <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Check className="w-4 h-4" /> Question Selection</h3>
              <div className="flex gap-2">
                <button onClick={() => setQuestionSelectionMode('auto')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${questionSelectionMode === 'auto' ? 'bg-brand-black text-white' : 'bg-white text-gray-700 border border-gray-400'}`}>
                  <Shuffle className="w-3 h-3 inline mr-1" /> Auto Select
                </button>
                <button onClick={() => setQuestionSelectionMode('manual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${questionSelectionMode === 'manual' ? 'bg-brand-black text-white' : 'bg-white text-gray-700 border border-gray-400'}`}>
                  <Edit2 className="w-3 h-3 inline mr-1" /> Manual Select
                </button>
              </div>
            </div>

            {questionSelectionMode === 'auto' && (
              <div className="bg-white p-3 rounded-lg border border-gray-300">
                <div className="text-xs text-gray-600 mb-2">Configure how many questions of each type to randomly select.</div>
                <div className="grid grid-cols-2 gap-3">
                  {['MCQ','Rating','TrueFalse','MultiSelect','ScenarioMCQ','ShortAnswer','Matching','Ordering','DragDropClassification'].map(type => {
                    const available = getQuestionTypeCount(type);
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700 flex-1">{type} <span className="text-gray-400">({available} available)</span></label>
                        <input type="number" min={0} max={available} value={autoSelectionConfig.questionTypes[type] || 0}
                          onChange={e => { const val = Math.min(Number(e.target.value), available); setAutoSelectionConfig(prev => ({ ...prev, questionTypes: { ...prev.questionTypes, [type]: val } })); }}
                          className="w-16 h-8 px-2 rounded border border-gray-300 text-sm" />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200">
                  <span className="text-xs font-semibold text-gray-700">Total Questions: {getTotalAutoQuestions()}</span>
                  <button onClick={autoSelectQuestions} disabled={getTotalAutoQuestions() === 0}
                    className="px-3 py-1.5 bg-brand-black text-white rounded-lg text-xs font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                    <Shuffle className="w-3 h-3" /> Shuffle &amp; Select
                  </button>
                </div>
              </div>
            )}

            {questionSelectionMode === 'manual' && (
              <div className="border border-gray-300 rounded-lg bg-white max-h-64 overflow-y-auto p-2 space-y-1">
                {questions.map(q => (
                  <label key={q._id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm">
                    <input type="checkbox" checked={form.questionIds.includes(q._id)} onChange={() => toggleQuestion(q._id)}
                      className="w-4 h-4 text-brand-red focus:ring-brand-red rounded" />
                    <span className="flex-1 line-clamp-1">{q.text}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{q.type}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
              <Check className="w-3 h-3 text-gray-700" /> {form.questionIds.length} question(s) selected
            </div>
          </div>
        )}

        {/* Re-exam Question Pool (optional second set for retakes) */}
        {form.competencyId && form.targetGroup && questions.length > 0 && form.type !== 'SupervisorOnly' && (
          <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Check className="w-4 h-4" /> Re-exam Questions
                <span className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">optional</span>
              </h3>
              <button onClick={autoPickReexam} disabled={questions.length === 0}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-1">
                <Shuffle className="w-3 h-3" /> Auto-pick
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Second set for retakes (attempt 2+): users who redo this assessment get these instead of the main set — e.g. after an HR-granted retake.</p>
            <div className="border border-gray-200 rounded-lg bg-white max-h-48 overflow-y-auto p-2 space-y-1">
              {questions.filter(q => !form.questionIds.includes(q._id)).map(q => (
                <label key={q._id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm">
                  <input type="checkbox" checked={form.reexamQuestionIds.includes(q._id)} onChange={() => toggleReexamQuestion(q._id)}
                    className="w-4 h-4 text-brand-red focus:ring-brand-red rounded" />
                  <span className="flex-1 line-clamp-1">{q.text}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{q.type}</span>
                </label>
              ))}
              {questions.filter(q => !form.questionIds.includes(q._id)).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">All available questions are in the main set.</p>
              )}
            </div>
            <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
              <Check className="w-3 h-3 text-gray-700" /> {form.reexamQuestionIds.length} re-exam question(s) selected
            </div>
          </div>
        )}

        {form.competencyId && form.targetGroup && questions.length === 0 && (
          <div className="bg-gray-100 p-3 rounded-xl border border-gray-300 text-xs text-gray-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> No questions found for this competency and target group combination.
          </div>
        )}
        {(!form.competencyId || !form.targetGroup) && form.type !== 'SupervisorOnly' && (
          <div className="bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 text-center">
            Select a competency and target group above to load and select questions.
          </div>
        )}
        {form.type === 'SupervisorOnly' && questions.length > 0 && form.competencyId && form.targetGroup && (
          <div className="bg-gray-100 p-4 rounded-xl border border-gray-300">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-gray-700 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-1">OD Question Selection (Optional)</h4>
                <p className="text-xs text-gray-700 mb-3">For Supervisor-Only assessments, questions are for reference only.</p>
                <div className="border border-gray-300 rounded-lg bg-white max-h-48 overflow-y-auto p-2 space-y-1">
                  {questions.map(q => (
                    <label key={q._id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm">
                      <input type="checkbox" checked={form.questionIds.includes(q._id)} onChange={() => toggleQuestion(q._id)}
                        className="w-4 h-4 text-gray-700 focus:ring-gray-700 rounded" />
                      <span className="flex-1 line-clamp-1">{q.text}</span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{q.type}</span>
                    </label>
                  ))}
                </div>
                <div className="text-xs text-gray-700 mt-2">{form.questionIds.length} reference question(s) selected</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
        {actionButtons}
      </div>
    </div>
  );
}
