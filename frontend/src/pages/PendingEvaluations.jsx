import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import {
  ClipboardCheck, Calendar, Clock, Target,
  ChevronRight, AlertTriangle, Briefcase, CalendarClock,
  CheckCircle2, RefreshCw,
} from 'lucide-react';
import api from '../utils/api';

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

function PriorityDot({ priority, isScheduled }) {
  if (isScheduled) return <span className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" />;
  const c = { HIGH: 'bg-red-500', MEDIUM: 'bg-gray-500', LOW: 'bg-gray-300' };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c[priority] || 'bg-gray-300'}`} />;
}

export default function PendingEvaluations() {
  const nav = useNavigate();
  const { show } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/supervisors/pending');
      const raw = res.data.data.pendingEvaluations || [];
      setItems(raw.map(item => ({
        ...item,
        daysRemaining: item.daysRemaining ?? calcDays(item.endDate),
      })));
    } catch {
      show('Failed to load evaluations.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const calcDays = (d) => d
    ? Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  useEffect(() => { load(); }, []);

  const navigate = (item) => {
    const empId = item.employee._id || item.employee.id;
    const base = `/assessments/${item.assessmentId}/evaluate?employeeId=${empId}`;
    nav(item.assessmentType === 'Combined' ? base + '&type=combined' : base);
  };

  // Grouping: active (pending + update) vs scheduled
  const active    = items.filter(i => !i.isScheduled);
  const scheduled = items.filter(i => i.isScheduled);
  const pendingCount = active.filter(i => !i.supervisorSubmitted).length;

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
          <button onClick={load} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500">
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {active.map((item, idx) => {
                const alreadyDone = item.supervisorSubmitted;
                return (
                  <div
                    key={`${item.assessmentId}-${item.employee._id || item.employee.id}`}
                    className={`bg-white rounded-xl border transition-all hover:shadow-md overflow-hidden ${alreadyDone ? 'border-gray-200' : 'border-gray-100 hover:border-red-200'}`}
                  >
                    {/* Priority strip */}
                    <div className={`h-1 ${
                      alreadyDone ? 'bg-gray-500' :
                      item.priority === 'HIGH' ? 'bg-red-500' :
                      item.priority === 'MEDIUM' ? 'bg-gray-500' : 'bg-gray-200'
                    }`} />

                    <div className="p-4">
                      {/* Employee */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {avatar(item.employee.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{item.employee.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Briefcase className="w-3 h-3 text-gray-300" />
                            <p className="text-xs text-gray-400 truncate">{item.employee.position || 'Employee'}</p>
                          </div>
                        </div>
                        {alreadyDone && (
                          <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                            Evaluated ✓
                          </span>
                        )}
                      </div>

                      {/* Assessment info */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1.5 text-xs text-gray-500">
                        {/* Competency */}
                        <div className="flex items-start gap-1.5">
                          <Target className="w-3.5 h-3.5 text-brand-red mt-0.5 flex-shrink-0" />
                          <span className="font-semibold text-gray-800 line-clamp-1">
                            {item.competency?.name || 'Unknown Competency'}
                          </span>
                        </div>
                        {/* Description */}
                        {item.assessmentDescription && (
                          <div className="pl-5 text-gray-500 line-clamp-2 leading-snug">
                            {item.assessmentDescription}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                          <span>Due {fmtDate(item.endDate)}</span>
                          <DaysChip days={item.daysRemaining} />
                        </div>
                      </div>

                      {/* CTA */}
                      <button
                        onClick={() => navigate(item)}
                        className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          alreadyDone
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                            : 'bg-brand-red text-white hover:bg-red-700'
                        }`}
                      >
                        {alreadyDone ? (
                          <><RefreshCw className="w-3.5 h-3.5" /> Update Evaluation</>
                        ) : (
                          <>{item.assessmentType === 'Combined' ? 'Evaluate Employee' : 'Start Evaluation'} <ChevronRight className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Scheduled (not yet open) ───────────────────────────────────── */}
        {scheduled.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Upcoming — Not Yet Open
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {scheduled.map((item) => (
                <div
                  key={`sched-${item.assessmentId}-${item.employee._id || item.employee.id}`}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden opacity-80"
                >
                  <div className="h-1 bg-gray-400" />
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-brand-black flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {avatar(item.employee.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-700 truncate">{item.employee.name}</p>
                        <p className="text-xs text-gray-400 truncate">{item.employee.position || 'Employee'}</p>
                      </div>
                      <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                        Scheduled
                      </span>
                    </div>

                    <div className="bg-gray-100 rounded-lg p-3 mb-3 space-y-1.5 text-xs text-gray-500">
                      <div className="flex items-start gap-1.5">
                        <Target className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                        <span className="font-semibold text-gray-800 line-clamp-1">
                          {item.competency?.name || 'Unknown Competency'}
                        </span>
                      </div>
                      {item.assessmentDescription && (
                        <div className="pl-5 text-gray-500 line-clamp-2 leading-snug">
                          {item.assessmentDescription}
                        </div>
                      )}
                      {item.startDate && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <CalendarClock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          <span>Opens {fmtStartTime(item.startDate)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                        <span>Due {fmtDate(item.endDate)}</span>
                      </div>
                    </div>

                    {/* Disabled button */}
                    <div className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-gray-50 text-gray-400 border border-gray-100 cursor-not-allowed select-none">
                      <Clock className="w-3.5 h-3.5" />
                      Available from {fmtStartTime(item.startDate) || fmtDate(item.startDate)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
