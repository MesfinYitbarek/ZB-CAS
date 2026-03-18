import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Calendar, Clock, ChevronLeft, ChevronRight, Target, Users, Eye,
  AlertCircle, Check, X, Shuffle, Edit2, Bell, Briefcase, Search, Copy,
  LayoutGrid, CalendarDays, ChevronDown, ChevronUp
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

// ─── Status / type config ─────────────────────────────────────────────────────
const STATUS_META = {
  DRAFT:     { dot: 'bg-gray-400',    bar: 'bg-gray-300',    badge: 'bg-gray-100 text-gray-700',     label: 'Draft'     },
  SCHEDULED: { dot: 'bg-blue-500',    bar: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-800',     label: 'Scheduled' },
  ACTIVE:    { dot: 'bg-green-500',   bar: 'bg-green-400',   badge: 'bg-green-100 text-green-800',   label: 'Active'    },
  COMPLETED: { dot: 'bg-brand-red',   bar: 'bg-brand-red',   badge: 'bg-red-100 text-red-800',       label: 'Completed' },
  ARCHIVED:  { dot: 'bg-gray-500',    bar: 'bg-gray-500',    badge: 'bg-gray-100 text-gray-600',     label: 'Archived'  },
};

const TYPE_META = {
  SelfAssessment: { badge: 'bg-blue-100 text-blue-800',   short: 'Self'  },
  SupervisorOnly: { badge: 'bg-green-100 text-green-800', short: 'Sup.'  },
  Combined:       { badge: 'bg-purple-100 text-purple-800', short: 'Both'},
};

// ─── Calendar helpers ─────────────────────────────────────────────────────────
const DAY_NAMES  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function firstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); }

// Does the assessment span the given date cell?
function assessmentCoversDate(a, year, month, day) {
  const start = new Date(a.startDate);
  const end   = new Date(a.endDate);
  const cell  = new Date(year, month, day);
  return cell >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
         cell <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
}

// ─── Gantt / Timeline helpers ─────────────────────────────────────────────────
function GanttView({ items, onAssessmentClick }) {
  const now = new Date();

  // Compute visible date range: earliest start - 3 days … latest end + 3 days
  const allDates = items.flatMap(a => [new Date(a.startDate), new Date(a.endDate)]);
  const minDate = allDates.length
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : new Date();
  const maxDate = allDates.length
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : new Date(now.getTime() + 30 * 86400000);

  minDate.setDate(minDate.getDate() - 3);
  maxDate.setDate(maxDate.getDate() + 3);

  const totalMs   = maxDate - minDate;
  const totalDays = Math.ceil(totalMs / 86400000);

  const toPercent = (date) => {
    const d = new Date(date);
    return ((d - minDate) / totalMs) * 100;
  };
  const widthPercent = (start, end) => {
    const s = Math.max(new Date(start) - minDate, 0);
    const e = Math.min(new Date(end)   - minDate, totalMs);
    return ((e - s) / totalMs) * 100;
  };

  // Build tick marks (every ~7 days if range > 21 days, else every day)
  const tickInterval = totalDays > 60 ? 14 : totalDays > 21 ? 7 : totalDays > 7 ? 3 : 1;
  const ticks = [];
  for (let i = 0; i <= totalDays; i += tickInterval) {
    const d = new Date(minDate.getTime() + i * 86400000);
    ticks.push({ left: (i / totalDays) * 100, label: `${MONTH_NAMES[d.getMonth()].slice(0,3)} ${d.getDate()}` });
  }

  const nowPct = ((now - minDate) / totalMs) * 100;

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <CalendarDays className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-sm">No assessments to display on the timeline.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Tick header */}
        <div className="relative h-7 border-b border-gray-100 mb-1 ml-48">
          {ticks.map((t, i) => (
            <div key={i} className="absolute top-0 flex flex-col items-center" style={{ left: `${t.left}%` }}>
              <span className="text-[10px] text-gray-400 whitespace-nowrap -translate-x-1/2">{t.label}</span>
              <div className="w-px h-2 bg-gray-200 mt-0.5" />
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
          {items.map((a) => {
            const sm = STATUS_META[a.status] || STATUS_META.DRAFT;
            const tm = TYPE_META[a.type]     || TYPE_META.SelfAssessment;
            const left  = toPercent(a.startDate);
            const width = widthPercent(a.startDate, a.endDate);

            return (
              <div key={a._id} className="flex items-center group">
                {/* Label col */}
                <div className="w-48 flex-shrink-0 pr-3 flex items-center gap-1.5 overflow-hidden">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sm.dot}`} />
                  <span
                    className="text-xs font-medium text-gray-700 truncate cursor-pointer hover:text-brand-red transition-colors"
                    title={a.competencyId?.name}
                    onClick={() => onAssessmentClick(a)}
                  >
                    {a.competencyId?.name || '—'}
                  </span>
                </div>

                {/* Bar area */}
                <div className="flex-1 relative h-7">
                  {/* Background grid lines */}
                  {ticks.map((t, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${t.left}%` }} />
                  ))}

                  {/* Today line */}
                  {nowPct >= 0 && nowPct <= 100 && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-brand-red/60 z-10" style={{ left: `${nowPct}%` }}>
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brand-red" />
                    </div>
                  )}

                  {/* Assessment bar */}
                  <div
                    className={`absolute top-1 bottom-1 rounded-md cursor-pointer transition-all group-hover:brightness-95 ${sm.bar} flex items-center px-2 overflow-hidden`}
                    style={{ left: `${Math.max(left, 0)}%`, width: `${Math.max(width, 0.5)}%`, minWidth: 4 }}
                    onClick={() => onAssessmentClick(a)}
                    title={`${a.competencyId?.name} · ${sm.label}`}
                  >
                    {width > 5 && (
                      <span className="text-[10px] font-semibold text-white truncate whitespace-nowrap">
                        {a.competencyId?.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <div className={`ml-2 flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${sm.badge}`}>
                  {sm.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100 flex-wrap">
          {Object.entries(STATUS_META).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className={`w-3 h-2 rounded-sm ${v.bar}`} />
              <span className="text-[11px] text-gray-500">{v.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-3 bg-brand-red/60" />
            <span className="text-[11px] text-gray-500">Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Monthly Calendar View ────────────────────────────────────────────────────
function CalendarView({ items, onAssessmentClick }) {
  const today = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const numDays   = daysInMonth(calYear, calMonth);
  const firstDay  = firstDayOfMonth(calYear, calMonth);
  const cells     = Array.from({ length: firstDay + numDays }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  // Map day → assessments
  const dayMap = useMemo(() => {
    const m = {};
    items.forEach(a => {
      for (let d = 1; d <= numDays; d++) {
        if (assessmentCoversDate(a, calYear, calMonth, d)) {
          if (!m[d]) m[d] = [];
          m[d].push(a);
        }
      }
    });
    return m;
  }, [items, calYear, calMonth, numDays]);

  const isToday = (d) => d && today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <h3 className="text-sm font-bold text-gray-800">
          {MONTH_NAMES[calMonth]} {calYear}
        </h3>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        {cells.map((day, idx) => {
          const assessments = day ? (dayMap[day] || []) : [];
          const maxShow = 3;
          return (
            <div
              key={idx}
              className={`bg-white min-h-[80px] p-1 ${day ? 'hover:bg-gray-50' : 'bg-gray-50/40'} transition-colors`}
            >
              {day && (
                <>
                  <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                    isToday(day)
                      ? 'bg-brand-red text-white'
                      : 'text-gray-600'
                  }`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {assessments.slice(0, maxShow).map(a => {
                      const sm = STATUS_META[a.status] || STATUS_META.DRAFT;
                      const isStart = new Date(a.startDate).toDateString() === new Date(calYear, calMonth, day).toDateString();
                      return (
                        <div
                          key={a._id}
                          onClick={() => onAssessmentClick(a)}
                          className={`text-[9px] font-semibold px-1 py-0.5 rounded cursor-pointer truncate leading-tight
                            ${sm.bar} text-white opacity-90 hover:opacity-100 transition-opacity`}
                          title={a.competencyId?.name}
                        >
                          {isStart ? '▶ ' : ''}{a.competencyId?.name}
                        </div>
                      );
                    })}
                    {assessments.length > maxShow && (
                      <div className="text-[9px] text-gray-400 font-semibold pl-1">
                        +{assessments.length - maxShow} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Assessment detail side-panel (shown when clicking calendar item) ─────────
function AssessmentPanel({ assessment, isAdmin, isSupervisor, isEmployee, onClose, onNavigate, onStatusChange, onScoreResults }) {
  if (!assessment) return null;
  const a  = assessment;
  const sm = STATUS_META[a.status] || STATUS_META.DRAFT;
  const requiresSup = a.type === 'SupervisorOnly' || a.type === 'Combined';

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Status bar top */}
        <div className={`h-1.5 ${sm.bar}`} />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-brand-black leading-tight truncate pr-2">
                {a.competencyId?.name || '—'}
              </h3>
              {a.purpose && (
                <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                  {a.purpose}
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sm.badge}`}>{sm.label}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TYPE_META[a.type]?.badge || 'bg-gray-100 text-gray-700'}`}>{a.type}</span>
            {a.targetGroup && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a.targetGroup}</span>
            )}
          </div>

          {/* Date range */}
          <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Start</span>
              <span className="font-semibold text-gray-800">
                {new Date(a.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> End</span>
              <span className="font-semibold text-gray-800">
                {new Date(a.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {a.timeLimit && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Time limit</span>
                <span className="font-semibold text-gray-800">{a.timeLimit} min</span>
              </div>
            )}
          </div>

          {/* Combined weights */}
          {a.type === 'Combined' && (
            <div className="flex gap-2 mb-4">
              <div className="flex-1 bg-blue-50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-blue-700">{a.weight?.selfAssessment || 20}%</div>
                <div className="text-[10px] text-blue-500">Self</div>
              </div>
              <div className="flex-1 bg-green-50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-green-700">{a.weight?.supervisor || 80}%</div>
                <div className="text-[10px] text-green-500">Supervisor</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {isAdmin && (
              <button
                onClick={() => onNavigate(`/assessments/${a._id}`)}
                className="w-full py-2 px-4 bg-brand-red text-white rounded-xl text-sm font-semibold hover:bg-brand-red-dark transition-colors flex items-center justify-center gap-2"
              >
                View Details <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {!isAdmin && a.status === 'ACTIVE' && a.type === 'SelfAssessment' && (
              <button
                onClick={() => onNavigate(`/assessments/${a._id}/take`)}
                className="w-full py-2 px-4 bg-brand-red text-white rounded-xl text-sm font-semibold hover:bg-brand-red-dark transition-colors"
              >
                Start Assessment
              </button>
            )}
            {isEmployee && a.status === 'ACTIVE' && a.type === 'Combined' && (
              <button
                onClick={() => onNavigate(`/assessments/${a._id}/take`)}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Start Self-Assessment
              </button>
            )}
            {isSupervisor && a.status === 'ACTIVE' && requiresSup && (
              <button
                onClick={() => onNavigate(`/assessments/${a._id}/evaluate`)}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                Evaluate Team
              </button>
            )}
            {isAdmin && a.status === 'COMPLETED' && a.type === 'Combined' && (
              <button
                onClick={() => { onScoreResults(a._id); onClose(); }}
                className="w-full py-2 px-4 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
              >
                <Target className="w-3.5 h-3.5" /> Score Combined Results
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Main component ───────────────────────────────────────────────────────────
export default function Assessments() {
  const { isAdmin, isSupervisor, isEmployee, user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
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
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'calendar' | 'gantt'
  const [selectedAssessment, setSelectedAssessment] = useState(null);

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
  const [duplicateSource, setDuplicateSource] = useState(null);
  const [duplicateDates, setDuplicateDates] = useState({ startDate: '', endDate: '', startTime: '09:00', endTime: '17:00' });
  const [duplicating, setDuplicating] = useState(false);

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

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data.competencies)).catch(() => {});
    api.get('/assessments/employees/departments').then(({ data }) => setDepartments(data.data.departments)).catch(() => {});
    if (isSupervisor) loadSupervisorStats();
  }, [isSupervisor]);

  // ── Derive target groups ──────────────────────────────────────────────────
  useEffect(() => {
    if (form.competencyId) {
      const sel = competencies.find(c => c._id === form.competencyId);
      setTargetGroups(sel?.targetGroups?.map(t => t.targetGroup) || []);
      setForm(prev => ({ ...prev, targetGroup: '', questionIds: [] }));
      setQuestionSelectionMode('auto');
    } else {
      setTargetGroups([]);
      setQuestions([]);
    }
  }, [form.competencyId, competencies]);

  // ── Load questions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (form.competencyId && form.targetGroup) {
      api.get('/questions', { params: { competencyId: form.competencyId, targetGroup: form.targetGroup } })
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

  // ── For calendar/gantt we fetch ALL assessments (no pagination) ───────────
  const [allItems, setAllItems] = useState([]);

  const fetchAllAssessments = useCallback(async () => {
    try {
      let endpoint = '/assessments';
      let params = { page: 1, limit: 1000 };
      if (filterStatus && isAdmin) params.status = filterStatus;
      if (isSupervisor || isEmployee) {
        endpoint = '/assessments/active';
        if (isSupervisor) params.supervisorView = true;
        delete params.status;
      }
      const { data } = await api.get(endpoint, { params });
      setAllItems(data.data.assessments || []);
    } catch {}
  }, [isAdmin, isSupervisor, isEmployee, filterStatus]);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      let endpoint = '/assessments';
      let params = { page: pagination.page, limit: pagination.limit };
      if (filterStatus && isAdmin) params.status = filterStatus;
      if (isSupervisor || isEmployee) {
        endpoint = '/assessments/active';
        if (isSupervisor) params.supervisorView = true;
        delete params.status;
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
  }, [isAdmin, isSupervisor, isEmployee, filterStatus, pagination.page, pagination.limit, show]);

  useEffect(() => { fetchAssessments(); }, [fetchAssessments]);
  useEffect(() => {
    if (viewMode === 'calendar' || viewMode === 'gantt') fetchAllAssessments();
  }, [viewMode, fetchAllAssessments]);

  // ── Calendar display items (filtered by status if set) ───────────────────
  const calendarItems = useMemo(() => {
    if (!filterStatus) return allItems;
    return allItems.filter(a => a.status === filterStatus);
  }, [allItems, filterStatus]);

  // ── Employee search ───────────────────────────────────────────────────────
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

  const handleSave = async () => {
    try {
      if (!validateDateTime()) return;
      if (!validateForm()) return;
      const startDateTime = new Date(`${form.startDate}T${form.startTime}`).toISOString();
      const endDateTime   = new Date(`${form.endDate}T${form.endTime}`).toISOString();
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
      fetchAllAssessments();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to create assessment.', 'error');
    }
  };

  const changeStatus = async (id, newStatus) => {
    try {
      await api.patch(`/assessments/${id}/status`, { status: newStatus });
      show(`Status changed to ${newStatus}.`, 'success');
      fetchAssessments();
      fetchAllAssessments();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to change status.', 'error');
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

  const getNextStatus = (current) => {
    if (current === 'SCHEDULED') return null;
    const idx = STATUS_ORDER.indexOf(current);
    if (idx < 0 || idx + 1 >= STATUS_ORDER.length) return null;
    return STATUS_ORDER[idx + 1];
  };

  const requiresSupervisorEvaluation = (assessment) =>
    assessment.type === 'SupervisorOnly' || assessment.type === 'Combined';

  const handleScoreResults  = (assessmentId) => setScoreConfirm(assessmentId);
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

  const openDuplicate = (assessment) => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek  = new Date(); nextWeek.setDate(nextWeek.getDate() + 8);
    const fmt = (d) => d.toISOString().split('T')[0];
    setDuplicateSource(assessment);
    setDuplicateDates({ startDate: fmt(tomorrow), endDate: fmt(nextWeek), startTime: '09:00', endTime: '17:00' });
  };

  const handleDuplicate = async () => {
    if (!duplicateSource || !duplicateDates.startDate || !duplicateDates.endDate) return;
    setDuplicating(true);
    try {
      const startDate = new Date(`${duplicateDates.startDate}T${duplicateDates.startTime}:00`);
      const endDate   = new Date(`${duplicateDates.endDate}T${duplicateDates.endTime}:00`);
      if (endDate <= startDate) { show('End date must be after start date.', 'error'); setDuplicating(false); return; }
      await api.post(`/assessments/${duplicateSource._id}/duplicate`, {
        startDate: startDate.toISOString(),
        endDate:   endDate.toISOString(),
      });
      setDuplicateSource(null);
      show(`"${duplicateSource.competencyId?.name || 'Assessment'}" duplicated as a new draft.`, 'success');
      fetchAssessments();
      fetchAllAssessments();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to duplicate assessment.', 'error');
    } finally {
      setDuplicating(false);
    }
  };

  const getQuestionTypeCount = (type) => questions.filter(q => q.type === type).length;
  const getTotalAutoQuestions = () => Object.values(autoSelectionConfig.questionTypes).reduce((s, c) => s + c, 0);

  const getTimeUntil = (dateStr) => {
    const diff = new Date(dateStr) - new Date();
    if (diff <= 0) return 'Starting soon...';
    const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days  > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h ${mins}m`;
    return `in ${mins}m`;
  };

  const formatTargetAudience = (a) => {
    if (!a.targetAudience) return a.target?.department || 'All Departments';
    if (a.targetAudience.type === 'ALL_DEPARTMENTS')    return 'All Departments';
    if (a.targetAudience.type === 'DEPARTMENT_ALL')     return a.targetAudience.departments?.join(', ') || 'Specific Departments';
    if (a.targetAudience.type === 'SPECIFIC_EMPLOYEES') return `${a.targetAudience.employeeIds?.length || 0} specific employee(s)`;
    return 'All Departments';
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) setPagination(prev => ({ ...prev, page }));
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({ page: 1, limit: newLimit, total: pagination.total, totalPages: Math.ceil(pagination.total / newLimit) });
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-7">

      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">Assessments</h1>
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

      {/* ── Supervisor stats ─────────────────────────────────────────────── */}
      {isSupervisor && (
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

      {/* ── Filters + View Toggle ─────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-6 flex-shrink-0 gap-4 flex-wrap">
        {/* Status filters */}
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <>
              <button
                onClick={() => { setFilterStatus(''); setPagination(prev => ({ ...prev, page: 1 })); }}
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${filterStatus === '' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
              >All</button>
              {STATUS_ORDER.map(s => (
                <button key={s}
                  onClick={() => { setFilterStatus(s); setPagination(prev => ({ ...prev, page: 1 })); }}
                  className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${filterStatus === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >
                  {STATUS_META[s]?.label || s}
                </button>
              ))}
            </>
          )}
          {!isAdmin && (
            <p className="text-sm text-gray-500 self-center">
              {isEmployee
                ? 'Showing all assessments assigned to you — supervisor-only assessments are visible but cannot be taken.'
                : 'Showing assessments requiring your evaluation'}
            </p>
          )}
        </div>

        {/* Right side: page size (grid only) + view toggle */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isAdmin && viewMode === 'grid' && (
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
          )}

          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            {[
              { key: 'grid',     Icon: LayoutGrid,   label: 'Cards'    },
              { key: 'calendar', Icon: CalendarDays, label: 'Calendar' },
              { key: 'gantt',    Icon: Calendar,     label: 'Timeline' },
            ].map(({ key, Icon, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                title={label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === key
                    ? 'bg-white text-brand-red shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scrollable Content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && viewMode === 'grid' ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── GRID VIEW ──────────────────────────────────────────────── */}
            {viewMode === 'grid' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {items.length === 0 && (
                    <div className="col-span-full text-center py-16 text-gray-400">
                      {isSupervisor ? 'No assessments requiring your evaluation at the moment.'
                        : isEmployee ? 'No scheduled or active assessments for you at the moment.'
                          : 'No assessments found.'}
                    </div>
                  )}
                  {items.map((a) => {
                    const next  = getNextStatus(a.status);
                    const isActive    = a.status === 'ACTIVE';
                    const isScheduled = a.status === 'SCHEDULED';
                    const sm = STATUS_META[a.status] || STATUS_META.DRAFT;
                    const requiresSup = requiresSupervisorEvaluation(a);

                    return (
                      <div key={a._id} className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all border border-gray-100 overflow-hidden">
                        <div className={`h-2 ${sm.bar}`} />
                        <div className="p-5">
                          <div className="flex justify-between items-start mb-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${TYPE_META[a.type]?.badge || 'bg-gray-100 text-gray-800'}`}>{a.type}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${sm.badge}`}>{sm.label}</span>
                          </div>
                          <h3 className="text-base font-bold text-brand-black mb-1 line-clamp-2">
                            {a.competencyId?.name || 'No competency'}
                          </h3>
                          {a.purpose && (
                            <span className="inline-block mb-2 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{a.purpose}</span>
                          )}
                          {a.targetGroup && (
                            <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{a.targetGroup}</span>
                          )}
                          <div className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {formatTargetAudience(a)}
                          </div>
                          {isScheduled && (
                            <div className="bg-blue-50 border-l-4 border-blue-500 rounded p-2 mb-3">
                              <div className="text-xs text-blue-800 font-semibold flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Starts {getTimeUntil(a.startDate)}
                              </div>
                              <div className="text-[10px] text-blue-600 mt-0.5">
                                {new Date(a.startDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          )}
                          <div className="flex gap-4 text-xs text-gray-400 mb-4">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(a.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                        <div className="border-t border-gray-100 px-3 py-1 flex justify-between items-center bg-gray-50">
                          {isAdmin && next && a.status !== 'SCHEDULED' && (
                            <button onClick={() => changeStatus(a._id, next)}
                              className="px-3 py-1.5 text-xs font-semibold text-brand-red border border-brand-red rounded-lg hover:bg-brand-red-muted transition-colors">
                              Move to {STATUS_META[next]?.label || next}
                            </button>
                          )}
                          {isAdmin && isScheduled && (
                            <span className="text-xs text-blue-600 flex items-center gap-1 font-medium">
                              <Clock className="w-3 h-3" />
                              Auto-activates {new Date(a.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          {!isAdmin && isActive && a.type === 'SelfAssessment' && (
                            <button onClick={() => nav(`/assessments/${a._id}/take`)}
                              className="px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors">
                              Start Assessment
                            </button>
                          )}
                          {isEmployee && isActive && a.type === 'Combined' && (
                            <button onClick={() => nav(`/assessments/${a._id}/take`)}
                              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                              Start Self-Assessment
                            </button>
                          )}
                          {isEmployee && a.type === 'SupervisorOnly' && (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-500 border border-gray-200 cursor-default select-none">
                              <Eye className="w-3 h-3" /> View Only
                            </span>
                          )}
                          {!isAdmin && isScheduled && a.type !== 'SupervisorOnly' && (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-600 border border-blue-100 cursor-default select-none">
                              <Clock className="w-3 h-3" /> Upcoming
                            </span>
                          )}
                          {isSupervisor && isActive && requiresSup && (
                            <button onClick={() => nav(`/assessments/${a._id}/evaluate`)}
                              className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                              Evaluate Team
                            </button>
                          )}
                          {isAdmin && a.status === 'COMPLETED' && a.type === 'Combined' && (
                            <button onClick={() => handleScoreResults(a._id)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1">
                              <Target className="w-3 h-3" /> Score Combined Results
                            </button>
                          )}
                          {isAdmin && (
                            <div className="flex items-center gap-3">
                              <button onClick={() => openDuplicate(a)}
                                className="text-xs font-semibold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1"
                                title="Duplicate as new draft">
                                <Copy className="w-3 h-3" /> Duplicate
                              </button>
                              <button onClick={() => nav(`/assessments/${a._id}`)}
                                className="text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors flex items-center gap-1">
                                Details <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {pagination.total > pagination.limit && (
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 pt-6 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} assessments
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page === 1}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                        <ChevronLeft className="w-4 h-4" /> Previous
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                          let pageNum;
                          if (pagination.totalPages <= 5) pageNum = i + 1;
                          else if (pagination.page <= 3) pageNum = i + 1;
                          else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                          else pageNum = pagination.page - 2 + i;
                          return (
                            <button key={pageNum} onClick={() => goToPage(pageNum)}
                              className={`w-9 h-9 rounded-lg text-sm font-medium ${pagination.page === pageNum ? 'bg-brand-red text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                        Next <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── CALENDAR VIEW ──────────────────────────────────────────── */}
            {viewMode === 'calendar' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-brand-red" /> Monthly Calendar
                  </h2>
                  <span className="text-xs text-gray-400">{calendarItems.length} assessments</span>
                </div>
                <CalendarView
                  items={calendarItems}
                  onAssessmentClick={setSelectedAssessment}
                />
              </div>
            )}

            {/* ── GANTT / TIMELINE VIEW ───────────────────────────────────── */}
            {viewMode === 'gantt' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-brand-red" /> Timeline / Gantt
                  </h2>
                  <span className="text-xs text-gray-400">
                    Click a bar or name to see details
                  </span>
                </div>
                <GanttView
                  items={calendarItems}
                  onAssessmentClick={setSelectedAssessment}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Assessment detail panel ────────────────────────────────────────── */}
      {selectedAssessment && (
        <AssessmentPanel
          assessment={selectedAssessment}
          isAdmin={isAdmin}
          isSupervisor={isSupervisor}
          isEmployee={isEmployee}
          onClose={() => setSelectedAssessment(null)}
          onNavigate={(path) => { setSelectedAssessment(null); nav(path); }}
          onStatusChange={changeStatus}
          onScoreResults={handleScoreResults}
        />
      )}

      {/* ── Score confirm dialog ───────────────────────────────────────────── */}
      {scoreConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
              <Target className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-bold text-brand-black text-center mb-2">Score Combined Results?</h3>
            <p className="text-sm text-gray-600 text-center mb-4">Missing responses will be treated as 0. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setScoreConfirm(null)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => executeScoreResults(scoreConfirm)} className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700">Score Results</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Duplicate modal ─────────────────────────────────────────────────── */}
      {duplicateSource && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center flex-shrink-0">
                <Copy className="w-5 h-5 text-brand-red" />
              </div>
              <div>
                <h3 className="text-base font-bold text-brand-black leading-tight">Duplicate assessment</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{duplicateSource.competencyId?.name || 'Assessment'}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4 leading-relaxed">
              A new <strong className="text-gray-700">DRAFT</strong> copy will be created with the same competency, questions, target audience, type, and weights.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start date &amp; time</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={duplicateDates.startDate} onChange={e => setDuplicateDates(p => ({ ...p, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40" />
                  <input type="time" value={duplicateDates.startTime} onChange={e => setDuplicateDates(p => ({ ...p, startTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">End date &amp; time</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={duplicateDates.endDate} onChange={e => setDuplicateDates(p => ({ ...p, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40" />
                  <input type="time" value={duplicateDates.endTime} onChange={e => setDuplicateDates(p => ({ ...p, endTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDuplicateSource(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleDuplicate} disabled={duplicating || !duplicateDates.startDate || !duplicateDates.endDate}
                className="flex-1 py-2.5 bg-brand-red text-white rounded-xl text-sm font-semibold hover:bg-brand-red-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {duplicating ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Duplicating…</span></>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /><span>Create copy</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Assessment Modal ────────────────────────────────────────── */}
      <Modal open={modal === 'create'} onClose={() => setModal(null)} title="Create Assessment" large>
        <div className="space-y-5">
          {/* Basic Information */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
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
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Schedule &amp; Duration
            </h3>
            <div className="bg-blue-100 border-l-4 border-blue-500 p-2 rounded mb-3">
              <p className="text-[10px] text-blue-800 flex items-center gap-1">
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
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time Limit per Attempt (minutes, Optional)</label>
              <input type="number" value={form.timeLimit} onChange={e => setForm(prev => ({ ...prev, timeLimit: e.target.value }))}
                placeholder="e.g., 60 (leave empty for no limit)" min={1}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm max-w-xs" />
            </div>
            <div className="mt-4 pt-4 border-t border-blue-200">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600" /> Reminder <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <div className="flex items-center gap-3">
                <input type="number" value={form.reminderDaysBefore} onChange={e => setForm(prev => ({ ...prev, reminderDaysBefore: e.target.value }))}
                  placeholder="e.g., 2" min={1} max={30}
                  className="w-32 h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm" />
                <span className="text-sm text-gray-600">days before end date</span>
              </div>
              {form.reminderDaysBefore && (
                <p className="mt-1 text-xs text-blue-600">Participants will be notified {form.reminderDaysBefore} day(s) before the assessment ends.</p>
              )}
            </div>
          </div>

          {/* Target Audience */}
          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
            <h3 className="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> Target Audience
            </h3>
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
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
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
              <h3 className="text-sm font-bold text-amber-800 mb-3">Combined Assessment Weights</h3>
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
            <div className="bg-green-50 p-4 rounded-xl border border-green-100">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-green-800 flex items-center gap-2"><Check className="w-4 h-4" /> Question Selection</h3>
                <div className="flex gap-2">
                  <button onClick={() => setQuestionSelectionMode('auto')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${questionSelectionMode === 'auto' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}>
                    <Shuffle className="w-3 h-3 inline mr-1" /> Auto Select
                  </button>
                  <button onClick={() => setQuestionSelectionMode('manual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${questionSelectionMode === 'manual' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}>
                    <Edit2 className="w-3 h-3 inline mr-1" /> Manual Select
                  </button>
                </div>
              </div>

              {questionSelectionMode === 'auto' && (
                <div className="bg-white p-3 rounded-lg border border-green-200">
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
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                      <Shuffle className="w-3 h-3" /> Shuffle &amp; Select
                    </button>
                  </div>
                </div>
              )}

              {questionSelectionMode === 'manual' && (
                <div className="border border-green-200 rounded-lg bg-white max-h-64 overflow-y-auto p-2 space-y-1">
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
                <Check className="w-3 h-3 text-green-600" /> {form.questionIds.length} question(s) selected
              </div>
            </div>
          )}

          {form.competencyId && form.targetGroup && questions.length === 0 && (
            <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200 text-xs text-yellow-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> No questions found for this competency and target group combination.
            </div>
          )}
          {(!form.competencyId || !form.targetGroup) && form.type !== 'SupervisorOnly' && (
            <div className="bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 text-center">
              Select a competency and target group above to load and select questions.
            </div>
          )}
          {form.type === 'SupervisorOnly' && questions.length > 0 && form.competencyId && form.targetGroup && (
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-orange-800 mb-1">OD Question Selection (Optional)</h4>
                  <p className="text-xs text-orange-700 mb-3">For Supervisor-Only assessments, questions are for reference only.</p>
                  <div className="border border-orange-200 rounded-lg bg-white max-h-48 overflow-y-auto p-2 space-y-1">
                    {questions.map(q => (
                      <label key={q._id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer text-sm">
                        <input type="checkbox" checked={form.questionIds.includes(q._id)} onChange={() => toggleQuestion(q._id)}
                          className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded" />
                        <span className="flex-1 line-clamp-1">{q.text}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{q.type}</span>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-orange-600 mt-2">{form.questionIds.length} reference question(s) selected</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
          <button onClick={() => setModal(null)}
            className="px-5 py-2.5 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave}
            disabled={
              !form.competencyId || !form.targetGroup || !form.purpose ||
              !form.startDate || !form.endDate ||
              (form.type === 'Combined' && form.weight.selfAssessment + form.weight.supervisor !== 100) ||
              (form.type !== 'SupervisorOnly' && form.questionIds.length === 0)
            }
            className="px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Assessment
          </button>
        </div>
      </Modal>
    </div>
  );
}