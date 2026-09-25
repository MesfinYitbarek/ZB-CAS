import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Calendar, Clock, ChevronLeft, ChevronRight, Target, Users, Eye,
  AlertCircle, Check, X, Copy,
  LayoutGrid, CalendarDays, ChevronDown, ChevronUp, Table2, CalendarClock, Loader2,
  ArrowUp, ArrowDown, ChevronsUpDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';
import { useSupervisorPending, useSupervisorCompletedCount } from '../hooks/queries';
import { queryKeys } from '../hooks/queryKeys';

const STATUS_ORDER = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED'];
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
  DRAFT:     { dot: 'bg-gray-400',    bar: 'bg-gray-400',    badge: 'bg-gray-100 text-gray-700',     label: 'Draft'     },
  SCHEDULED: { dot: 'bg-blue-500',    bar: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-800',     label: 'Scheduled' },
  ACTIVE:    { dot: 'bg-brand-red',   bar: 'bg-brand-red',   badge: 'bg-red-100 text-red-800',       label: 'Active'    },
  COMPLETED: { dot: 'bg-green-500',   bar: 'bg-green-500',   badge: 'bg-green-100 text-green-800',   label: 'Completed' },
};

// Employee take-state for one assessment's progress record:
// 'start'  — never submitted · 'retake' — submitted, attempts left · 'taken' — submitted, no attempts left
function getTakeState(progress) {
  if (!progress?.isSubmitted) return 'start';
  if (progress.maxAttempts != null && (progress.attemptsRemaining ?? 0) <= 0) return 'taken';
  return 'retake';
}

// Default (unsorted) order = soonest/largest start date first per endpoint default.
const DEFAULT_SORT = { key: null, dir: 'desc' };

// Clickable table header with sort-direction indicator.
function SortableHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <th className="px-4 py-2.5 font-semibold">
      <button
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-brand-red ${active ? 'text-brand-red' : ''}`}
      >
        {label}
        {active ? (
          sort.dir === 'asc'
            ? <ArrowUp className="w-3.5 h-3.5" />
            : <ArrowDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />
        )}
      </button>
    </th>
  );
}

const TYPE_META = {
  SelfAssessment: { badge: 'bg-gray-200 text-gray-800',   short: 'Self'  },
  SupervisorOnly: { badge: 'bg-brand-black text-white', short: 'Sup.'  },
  Combined:       { badge: 'bg-brand-red text-white', short: 'Both'},
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

  // Map day to assessments
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
function AssessmentPanel({ assessment, isAdmin, isSupervisor, isEmployee, progress, onClose, onNavigate, onStatusChange }) {
  if (!assessment) return null;
  const a  = assessment;
  const sm = STATUS_META[a.status] || STATUS_META.DRAFT;
  const requiresSup = a.type === 'SupervisorOnly' || a.type === 'Combined';
  const takeState = getTakeState(progress);

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
                <span className="text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full mt-1 inline-block">
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
              <div className="flex-1 bg-gray-100 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-gray-700">{a.weight?.selfAssessment || 20}%</div>
                <div className="text-[10px] text-gray-700">Self</div>
              </div>
              <div className="flex-1 bg-gray-100 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-gray-700">{a.weight?.supervisor || 80}%</div>
                <div className="text-[10px] text-gray-700">Supervisor</div>
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
              takeState === 'taken' ? (
                <span className="w-full py-2 px-4 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-default select-none">
                  <Check className="w-4 h-4" /> Taken
                </span>
              ) : (
                <button
                  onClick={() => onNavigate(`/assessments/${a._id}/take`)}
                  className="w-full py-2 px-4 bg-brand-red text-white rounded-xl text-sm font-semibold hover:bg-brand-red-dark transition-colors"
                >
                  {takeState === 'retake' ? 'Retake Assessment' : 'Start Assessment'}
                </button>
              )
            )}
            {isEmployee && a.status === 'ACTIVE' && a.type === 'Combined' && (
              takeState === 'taken' ? (
                <span className="w-full py-2 px-4 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-default select-none">
                  <Check className="w-4 h-4" /> Taken
                </span>
              ) : (
                <button
                  onClick={() => onNavigate(`/assessments/${a._id}/take`)}
                  className="w-full py-2 px-4 bg-brand-black text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors"
                >
                  {takeState === 'retake' ? 'Retake Self-Assessment' : 'Start Self-Assessment'}
                </button>
              )
            )}
            {isSupervisor && a.status === 'ACTIVE' && requiresSup && (
              <button
                onClick={() => onNavigate(`/assessments/${a._id}/evaluate`)}
                className="w-full py-2 px-4 bg-brand-black text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Evaluate Team
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
  const queryClient = useQueryClient();

  // ── State ───────────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'calendar'
  const [selectedAssessment, setSelectedAssessment] = useState(null);

  const [pagination, setPagination] = useState({ page: 1, limit: 6, total: 0, totalPages: 0 });
  const [sort, setSort] = useState(DEFAULT_SORT);

  // Cycle: asc → desc → default
  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return DEFAULT_SORT;
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const { data: pendingPayload } = useSupervisorPending({
    enabled: isSupervisor,
    onError: () => console.error('Error loading supervisor stats'),
  });
  const { data: completedPayload } = useSupervisorCompletedCount({
    enabled: isSupervisor,
    onError: () => console.error('Error loading supervisor stats'),
  });
  const supervisorStats = {
    pendingEvaluations: pendingPayload?.data?.pendingEvaluations?.length || 0,
    completedEvaluations: completedPayload?.data?.count || 0,
  };

  const listEndpoint = isAdmin ? '/assessments' : '/assessments/active';
  const scope = isSupervisor ? 'supervisor' : isEmployee ? 'employee' : 'admin';

  const listQuery = useQuery({
    queryKey: queryKeys.assessments.list({
      page: pagination.page,
      limit: pagination.limit,
      status: isAdmin ? (filterStatus || undefined) : undefined,
      scope,
      sortBy: sort.key || undefined,
      sortDir: sort.key ? sort.dir : undefined,
    }),
    queryFn: async () => {
      const params = { page: pagination.page, limit: pagination.limit };
      if (isAdmin) {
        if (filterStatus) params.status = filterStatus;
      } else if (isSupervisor) {
        params.supervisorView = true;
      }
      if (sort.key) { params.sortBy = sort.key; params.sortDir = sort.dir; }
      const { data } = await api.get(listEndpoint, { params });
      return data.data;
    },
    enabled: isAdmin || isSupervisor || isEmployee,
    onError: () => show('Failed to load assessments.', 'error'),
  });
  const items = listQuery.data?.assessments || [];
  const loading = listQuery.isLoading;

  const calendarQuery = useQuery({
    queryKey: queryKeys.assessments.list({
      page: 1,
      limit: 1000,
      status: isAdmin ? (filterStatus || undefined) : undefined,
      scope,
      calendar: true,
    }),
    queryFn: async () => {
      const params = { page: 1, limit: 1000 };
      if (isAdmin) {
        if (filterStatus) params.status = filterStatus;
      } else if (isSupervisor) {
        params.supervisorView = true;
      }
      const { data } = await api.get(listEndpoint, { params });
      return data.data.assessments || [];
    },
    enabled: viewMode === 'calendar',
  });

  const calendarItems = useMemo(() => {
    const all = calendarQuery.data || [];
    if (!filterStatus) return all;
    return all.filter(a => a.status === filterStatus);
  }, [calendarQuery.data, filterStatus]);

  // Sync pagination totals from the live list response
  useEffect(() => {
    const pg = listQuery.data?.pagination;
    if (!pg) return;
    setPagination(prev => ({
      ...prev,
      total: pg.total,
      totalPages: Math.ceil(pg.total / prev.limit),
    }));
  }, [listQuery.data]);

  // Employee take-state: batch the per-assessment progress for visible, tappable
  // assessments so the list shows Taken / Retake / Start correctly.
  const progressTargets = useMemo(() => {
    if (isAdmin) return [];
    const pool = [...(items || []), ...(calendarItems || [])];
    const ids = new Set();
    pool.forEach(a => {
      if (a?.status === 'ACTIVE' && (a.type === 'SelfAssessment' || a.type === 'Combined')) ids.add(a._id);
    });
    return [...ids];
  }, [isAdmin, items, calendarItems]);
  const progressQueries = useQueries({
    queries: progressTargets.map(aid => ({
      queryKey: queryKeys.responses.progress(aid),
      queryFn: async () => {
        const res = await api.get(`/responses/progress/${aid}`).catch(() => null);
        return res?.data?.data || null;
      },
      staleTime: 30 * 1000,
    })),
  });
  const progressById = useMemo(() => {
    const map = {};
    progressTargets.forEach((aid, i) => { map[aid] = progressQueries[i]?.data || null; });
    return map;
  }, [progressTargets, progressQueries]);

  const [duplicateSource, setDuplicateSource] = useState(null);
  const [duplicateDates, setDuplicateDates] = useState({ startDate: '', endDate: '', startTime: '09:00', endTime: '17:00' });
  const [duplicating, setDuplicating] = useState(false);
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendForm, setExtendForm] = useState({ endDate: '', endTime: '17:00', startDate: '', startTime: '09:00' });
  const [extending, setExtending] = useState(false);

  const invalidateListings = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.assessments.all });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/assessments/${id}/status`, { status }),
    onSuccess: (_res, vars) => {
      show(`Status changed to ${vars.status}.`, 'success');
      invalidateListings();
    },
    onError: (err) => show(err.response?.data?.message || 'Failed to change status.', 'error'),
  });

  const extendMutation = useMutation({
    mutationFn: (payload) => api.patch(`/assessments/${extendTarget?._id}/deadline`, payload),
    onSuccess: () => {
      show('Assessment dates extended successfully.', 'success');
      setExtendTarget(null);
      invalidateListings();
    },
    onError: (err) => show(err.response?.data?.message || 'Failed to extend deadline.', 'error'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (payload) => api.post(`/assessments/${payload.sourceId}/duplicate`, {
      startDate: payload.startDate,
      endDate: payload.endDate,
    }),
    onSuccess: (_res, payload) => {
      setDuplicateSource(null);
      show(`"${payload.name || 'Assessment'}" duplicated as a new draft.`, 'success');
      invalidateListings();
    },
    onError: (err) => show(err.response?.data?.message || 'Failed to duplicate assessment.', 'error'),
  });

  const changeStatus = async (id, newStatus) => {
    try {
      await statusMutation.mutateAsync({ id, status: newStatus });
    } catch {}
  };

  const openExtend = (a) => {
    const end = new Date(a.endDate);
    const base = {
      endDate: end.toISOString().split('T')[0],
      endTime: end.toISOString().slice(11, 16),
    };
    if (a.status === 'SCHEDULED') {
      const start = new Date(a.startDate);
      setExtendForm({
        ...base,
        startDate: start.toISOString().split('T')[0],
        startTime: start.toISOString().slice(11, 16),
      });
    } else {
      setExtendForm(base);
    }
    setExtendTarget(a);
  };

  const handleExtend = async () => {
    if (!extendForm.endDate) { show('Please select a new end date.', 'error'); return; }
    const newEnd = new Date(`${extendForm.endDate}T${extendForm.endTime}`);
    if (isNaN(newEnd.getTime()) || newEnd <= new Date()) {
      show('The new deadline must be in the future.', 'error');
      return;
    }
    let payload = { endDate: newEnd.toISOString() };
    if (extendTarget?.status === 'SCHEDULED') {
      if (!extendForm.startDate) { show('Please select a new start date.', 'error'); return; }
      const newStart = new Date(`${extendForm.startDate}T${extendForm.startTime}`);
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

  const getNextStatus = (current) => {
    if (current === 'SCHEDULED') return null;
    const idx = STATUS_ORDER.indexOf(current);
    if (idx < 0 || idx + 1 >= STATUS_ORDER.length) return null;
    return STATUS_ORDER[idx + 1];
  };

  const requiresSupervisorEvaluation = (assessment) =>
    assessment.type === 'SupervisorOnly' || assessment.type === 'Combined';

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
      await duplicateMutation.mutateAsync({
        sourceId: duplicateSource._id,
        startDate: startDate.toISOString(),
        endDate:   endDate.toISOString(),
        name: duplicateSource.competencyId?.name,
      });
    } catch {
    } finally {
      setDuplicating(false);
    }
  };

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
    <div className="h-[calc(100vh-3rem)] flex flex-col p-7">

      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl  font-bold text-brand-black">Assessments</h1>
        </div>
        <div className="flex gap-3">
          {isSupervisor && supervisorStats.pendingEvaluations > 0 && (
            <button
              onClick={() => nav('/evaluations')}
              className="relative px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-300 transition-colors font-semibold flex items-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5" />
              Pending Evaluations
              <span className="bg-brand-black text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {supervisorStats.pendingEvaluations}
              </span>
            </button>
          )}
          {isAdmin && (
            <button onClick={() => nav('/assessments/new')} className="flex items-center gap-1.5 px-2 py-1 text-sm bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
              <Plus className="w-3 h-3" /> Create Assessment
            </button>
          )}
        </div>
      </div>

      {/* ── Supervisor stats ─────────────────────────────────────────────── */}
      {isSupervisor && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 flex-shrink-0">
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center"><Target className="w-5 h-5 text-gray-700" /></div>
              <div><div className="text-xs text-gray-500 uppercase font-semibold">Pending Evaluations</div><div className="text-2xl  font-bold text-brand-black">{supervisorStats.pendingEvaluations}</div></div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center"><Users className="w-5 h-5 text-gray-700" /></div>
              <div><div className="text-xs text-gray-500 uppercase font-semibold">Completed</div><div className="text-2xl  font-bold text-brand-black">{supervisorStats.completedEvaluations}</div></div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center"><Eye className="w-5 h-5 text-gray-700" /></div>
              <div><div className="text-xs text-gray-500 uppercase font-semibold">Active Assessments</div><div className="text-2xl  font-bold text-brand-black">{items.filter(a => a.status === 'ACTIVE' && requiresSupervisorEvaluation(a)).length}</div></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters + View Toggle ─────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-6 flex-shrink-0 gap-4 flex-wrap">
{/* Status filter dropdown */}
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 cursor-pointer"
            >
              <option value="">All Statuses</option>
              {STATUS_ORDER.map(s => (
                <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>
              ))}
            </select>
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
                className="px-2 py-1 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm">
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
              { key: 'grid',     Icon: Table2,        label: 'Table'     },
              { key: 'calendar', Icon: CalendarDays, label: 'Calendar' },
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
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {loading && viewMode === 'grid' ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── TABLE VIEW ─────────────────────────────────────────────── */}
            {viewMode === 'grid' && (
              <>
                <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden mb-6">
                  <div className="overflow-x-auto scrollbar-none">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                          <SortableHeader label="Competency" sortKey="competency" sort={sort} onSort={toggleSort} />
                          <SortableHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                          <th className="px-4 py-2.5 font-semibold">Audience</th>
                          <SortableHeader label="Schedule" sortKey="startDate" sort={sort} onSort={toggleSort} />
                          <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-16 text-gray-400">
                              {isSupervisor ? 'No assessments requiring your evaluation at the moment.'
                                : isEmployee ? 'No scheduled or active assessments for you at the moment.'
                                  : 'No assessments found.'}
                            </td>
                          </tr>
                        )}
                        {items.map((a) => {
                          const next  = getNextStatus(a.status);
                          const isActive    = a.status === 'ACTIVE';
                          const isScheduled = a.status === 'SCHEDULED';
                          const sm = STATUS_META[a.status] || STATUS_META.DRAFT;
                          const requiresSup = requiresSupervisorEvaluation(a);

                          return (
                            <tr key={a._id} className="hover:bg-gray-50 transition-colors align-top">
                              <td className="px-4 py-3 min-w-[220px]">
                                <p className="font-semibold text-brand-black mt-1.5">{a.competencyId?.name || 'No competency'}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${sm.badge}`}>{sm.label}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3 text-gray-400" />
                                  {formatTargetAudience(a)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-gray-400" />
                                  {new Date(a.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  <span className="text-gray-300">·</span>
                                  {a.timeLimit ? `${a.timeLimit} min` : 'No limit'}
                                </span>
                                {isScheduled && (
                                  <p className="text-gray-700 font-semibold mt-1">{getTimeUntil(a.startDate)}</p>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2 flex-wrap">
                                  {isAdmin && next && a.status !== 'SCHEDULED' && (
                                    <button onClick={() => changeStatus(a._id, next)}
                                      className="px-2 py-1 text-xs font-semibold text-brand-red border border-brand-red rounded-lg hover:bg-brand-red-muted transition-colors">
                                      Move to {STATUS_META[next]?.label || next}
                                    </button>
                                  )}
                                  {isAdmin && (a.status === 'ACTIVE' || a.status === 'SCHEDULED') && (
                                    <button onClick={() => openExtend(a)}
                                      className="px-2 py-1 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1">
                                      <CalendarClock className="w-3 h-3" /> Extend
                                    </button>
                                  )}
                                  {!isAdmin && isActive && a.type === 'SelfAssessment' && (
                                    getTakeState(progressById[a._id]) === 'taken' ? (
                                      <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-50 text-green-700 border border-green-200 cursor-default select-none">
                                        <Check className="w-3 h-3" /> Taken
                                      </span>
                                    ) : (
                                      <button onClick={() => nav(`/assessments/${a._id}/take`)}
                                        className="px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors">
                                        {getTakeState(progressById[a._id]) === 'retake' ? 'Retake Assessment' : 'Start Assessment'}
                                      </button>
                                    )
                                  )}
                                  {isEmployee && isActive && a.type === 'Combined' && (
                                    getTakeState(progressById[a._id]) === 'taken' ? (
                                      <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-50 text-green-700 border border-green-200 cursor-default select-none">
                                        <Check className="w-3 h-3" /> Taken
                                      </span>
                                    ) : (
                                      <button onClick={() => nav(`/assessments/${a._id}/take`)}
                                        className="px-3 py-1.5 text-xs font-semibold bg-brand-black text-white rounded-lg hover:bg-gray-700 transition-colors">
                                        {getTakeState(progressById[a._id]) === 'retake' ? 'Retake Self-Assessment' : 'Start Self-Assessment'}
                                      </button>
                                    )
                                  )}
                                  {isEmployee && a.type === 'SupervisorOnly' && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-500 border border-gray-200 cursor-default select-none">
                                      <Eye className="w-3 h-3" /> View Only
                                    </span>
                                  )}
                                  {!isAdmin && isScheduled && a.type !== 'SupervisorOnly' && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 border border-gray-200 cursor-default select-none">
                                      <Clock className="w-3 h-3" /> Upcoming
                                    </span>
                                  )}
                                  {isSupervisor && isActive && requiresSup && (
                                    <button onClick={() => nav(`/assessments/${a._id}/evaluate`)}
                                      className="px-3 py-1.5 text-xs font-semibold bg-brand-black text-white rounded-lg hover:bg-gray-700 transition-colors">
                                      Evaluate Team
                                    </button>
                                  )}
                                  {isAdmin && (
                                    <div className="flex items-center gap-3">
                                      <button onClick={() => openDuplicate(a)}
                                        className="text-xs font-semibold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1"
                                        title="Re use as new draft">
                                        <Copy className="w-3 h-3" /> Re Use
                                      </button>
                                      <button onClick={() => nav(`/assessments/${a._id}`)}
                                        className="text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors flex items-center gap-1">
                                        Details <ChevronRight className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination — sticky at bottom while scrolling */}
                {pagination.total > pagination.limit && (
                  <div className="sticky bottom-0 z-10 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 py-4 border-t border-gray-200">
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
                <div className="flex items-center gap-4 flex-wrap mb-4">
                  {['SCHEDULED', 'ACTIVE', 'COMPLETED', 'DRAFT'].map(s => (
                    <span key={s} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                      <span className={`w-2.5 h-2.5 rounded-sm ${STATUS_META[s].bar}`} />
                      {STATUS_META[s].label}
                    </span>
                  ))}
                </div>
                <CalendarView
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
          progress={progressById[selectedAssessment?._id]}
          onClose={() => setSelectedAssessment(null)}
          onNavigate={(path) => { setSelectedAssessment(null); nav(path); }}
          onStatusChange={changeStatus}
        />
      )}

      {/* results are auto-scored on completion */}

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
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Duplicatingâ€¦</span></>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /><span>Create copy</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Extend Deadline Modal ── */}
      <Modal open={!!extendTarget} onClose={() => setExtendTarget(null)} title="Extend Dates">
        {extendTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Set new dates for <span className="font-semibold text-gray-900">{extendTarget.competency?.name || extendTarget.description || 'this assessment'}</span>.
            </p>
            {extendTarget?.status === 'SCHEDULED' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">New Start Date *</label>
                  <input type="date" value={extendForm.startDate}
                    onChange={e => setExtendForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time *</label>
                  <input type="time" value={extendForm.startTime}
                    onChange={e => setExtendForm(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">New End Date *</label>
                <input type="date" value={extendForm.endDate}
                  onChange={e => setExtendForm(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time *</label>
                <input type="time" value={extendForm.endTime}
                  onChange={e => setExtendForm(prev => ({ ...prev, endTime: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-red text-sm" />
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1.5">
              {extendTarget?.status === 'SCHEDULED' && (
                <div className="flex items-center justify-between">
                  <span>Current start</span>
                  <span className="font-semibold text-gray-700">
                    {new Date(extendTarget.startDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>Current deadline</span>
                <span className="font-semibold text-gray-700">
                  {new Date(extendTarget.endDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setExtendTarget(null)}
                className="px-2 py-1 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleExtend} disabled={extending}
                className="px-2 py-1 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5">
                {extending && <Loader2 className="w-2 h-2 animate-spin" />}
                Extend Deadline
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
