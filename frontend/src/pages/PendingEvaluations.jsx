import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import {
  Calendar, Clock, ChevronRight, AlertTriangle, CalendarClock,
  CheckCircle2, RefreshCw,
} from 'lucide-react';
import Pagination from '../components/Pagination';
import { useSupervisorPending } from '../hooks/queries';

const PAGE_SIZE = 5;

const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const fmtStartTime = (d) => d
  ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : null;

const avatar = (name = '') =>
  name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

function DaysChip({ days, isScheduled }) {
  if (isScheduled) return null; // shown separately
  if (days === null || days === undefined) return null;
  if (days < 0)  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">{Math.abs(days)}d overdue</span>;
  if (days === 0) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Due today</span>;
  if (days <= 2)  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{days}d left</span>;
  return          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">{days}d left</span>;
}

function PriorityDot({ priority, isScheduled, className = '' }) {
  if (isScheduled) return <span className={`w-2 h-2 rounded-full bg-gray-500 flex-shrink-0 ${className}`} />;
  const c = { HIGH: 'bg-red-500', MEDIUM: 'bg-gray-500', LOW: 'bg-gray-300' };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c[priority] || 'bg-gray-300'} ${className}`} />;
}

export default function PendingEvaluations() {
  const nav = useNavigate();
  const { show } = useToast();
  const [activePage, setActivePage] = useState(1);
  const [scheduledPage, setScheduledPage] = useState(1);

  const calcDays = (d) => d
    ? Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  const { data: pendingPayload, isLoading: loading, refetch } = useSupervisorPending({
    onError: () => show('Failed to load evaluations.', 'error'),
  });

  const rawItems = pendingPayload?.data?.pendingEvaluations || [];
  const items = rawItems.map(item => ({
    ...item,
    daysRemaining: item.daysRemaining ?? calcDays(item.endDate),
  }));

  const navigate = (item) => {
    const empId = item.employee._id || item.employee.id;
    const base = `/assessments/${item.assessmentId}/evaluate?employeeId=${empId}`;
    nav(item.assessmentType === 'Combined' ? base + '&type=combined' : base);
  };

  // Grouping: active (pending + update) vs scheduled
  const active    = items.filter(i => !i.isScheduled);
  const scheduled = items.filter(i => i.isScheduled);
  const pendingCount = active.filter(i => !i.supervisorSubmitted).length;

  const activeTotalPages = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const activeCurrent = Math.min(activePage, activeTotalPages);
  const pagedActive = active.slice((activeCurrent - 1) * PAGE_SIZE, activeCurrent * PAGE_SIZE);

  const scheduledTotalPages = Math.max(1, Math.ceil(scheduled.length / PAGE_SIZE));
  const scheduledCurrent = Math.min(scheduledPage, scheduledTotalPages);
  const pagedScheduled = scheduled.slice((scheduledCurrent - 1) * PAGE_SIZE, scheduledCurrent * PAGE_SIZE);

  if (loading) return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
      <div className="w-8 h-8 border-[3px] border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl  font-bold text-brand-black">Pending Evaluations</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg border border-gray-200">
              <AlertTriangle className="w-3.5 h-3.5" />
              {pendingCount} pending
            </span>
          )}
          <button onClick={() => refetch()} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Empty state */}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <CheckCircle2 className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-400">All caught up!</p>
            <p className="text-sm text-gray-300 mt-1">No evaluations pending right now.</p>
          </div>
        )}

        {/* ── Active evaluations ─────────────────────────────────────────── */}
        {active.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Active Assessments
            </p>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto scrollbar-none">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Competency</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assessment</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedActive.map(item => {
                      const alreadyDone = item.supervisorSubmitted;
                      return (
                        <tr
                          key={`${item.assessmentId}-${item.employee._id || item.employee.id}`}
                          className={`transition-colors ${alreadyDone ? 'opacity-70' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {avatar(item.employee.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-gray-900 truncate">{item.employee.name}</p>
                                <p className="text-[11px] text-gray-400 truncate">{item.employee.position || 'Employee'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-start gap-1.5 min-w-0">
                              <PriorityDot priority={item.priority} isScheduled={false} className="mt-1.5" />
                              <p className="text-[13px] font-semibold text-gray-800 line-clamp-1">
                                {item.competency?.name || 'Unknown Competency'}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="text-[13px] text-gray-600 line-clamp-2 max-w-[18rem]">
                              {item.assessmentDescription || item.assessmentType || '—'}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] text-gray-600">{fmtDate(item.endDate)}</span>
                              <DaysChip days={item.daysRemaining} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {alreadyDone ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                                Evaluated ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => navigate(item)}
                                className={`inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-semibold transition-colors ${
                                  alreadyDone
                                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                                    : 'bg-brand-red text-white hover:bg-red-700'
                                }`}
                              >
                                {alreadyDone ? (
                                  <><RefreshCw className="w-3.5 h-3.5" /> Update</>
                                ) : (
                                  <>{item.assessmentType === 'Combined' ? 'Evaluate' : 'Start'} <ChevronRight className="w-3.5 h-3.5" /></>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <Pagination currentPage={activeCurrent} totalPages={activeTotalPages} onPageChange={setActivePage} />
          </section>
        )}

        {/* ── Scheduled (not yet open) ───────────────────────────────────── */}
        {scheduled.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Upcoming — Not Yet Open
            </p>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto scrollbar-none">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Competency</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Opens</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedScheduled.map(item => (
                      <tr key={`sched-${item.assessmentId}-${item.employee._id || item.employee.id}`} className="opacity-75">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-brand-black flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {avatar(item.employee.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-gray-700 truncate">{item.employee.name}</p>
                              <p className="text-[11px] text-gray-400 truncate">{item.employee.position || 'Employee'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <PriorityDot priority={item.priority} isScheduled={true} className="mt-1.5" />
                            <p className="text-[13px] font-semibold text-gray-800 line-clamp-1">
                              {item.competency?.name || 'Unknown Competency'}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                            <span className="text-[13px] text-gray-600">
                              {fmtStartTime(item.startDate) || fmtDate(item.startDate) || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                            <span className="text-[13px] text-gray-600">{fmtDate(item.endDate)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                            Scheduled
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end">
                            <span className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-semibold bg-gray-50 text-gray-400 border border-gray-100 cursor-not-allowed select-none">
                              <Clock className="w-3.5 h-3.5" />
                              Available from {fmtStartTime(item.startDate) || fmtDate(item.startDate)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Pagination currentPage={scheduledCurrent} totalPages={scheduledTotalPages} onPageChange={setScheduledPage} />
          </section>
        )}
      </div>
    </div>
  );
}
