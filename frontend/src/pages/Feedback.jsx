import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Plus, Star, ChevronLeft, ChevronRight, Filter,
  MessageSquare, BarChart3, X, Eye, ArrowLeft,
  RefreshCw, AlertCircle, Calendar, Search,
  ClipboardList, Inbox,
} from 'lucide-react';
import Modal from '../components/Modal';
import { LoadingCard } from '../components/LoadingSpinner';
import api from '../utils/api';

// ─── Shared helpers ────────────────────────────────────────────────────────────

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const ratingTone = (r) => {
  if (r >= 4) return { badge: 'bg-green-50 text-green-700 border-green-200', bar: 'bg-green-500' };
  if (r >= 3) return { badge: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' };
  return { badge: 'bg-red-50 text-red-600 border-red-200', bar: 'bg-red-500' };
};

// ─── StarRating ───────────────────────────────────────────────────────────────

function StarRating({ value, onChange, size = 'md' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(v => (
        <button key={v} type="button"
          onClick={() => onChange && onChange(value === v ? 0 : v)}
          className={onChange ? 'cursor-pointer transition-transform hover:scale-110' : 'cursor-default'}>
          <Star
            className={sz}
            fill={value >= v ? '#EA580C' : 'none'}
            color={value >= v ? '#EA580C' : '#CBD5E1'}
          />
        </button>
      ))}
    </div>
  );
}

// ─── RatingDistribution ───────────────────────────────────────────────────────

function RatingDistribution({ summary, accent = 'bg-orange-400' }) {
  const { ratedCount } = summary;
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map(star => {
        const count = summary[`rating${star}`] || 0;
        const pct = ratedCount > 0 ? (count / ratedCount) * 100 : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-right text-gray-400 tabular-nums font-medium">{star}</span>
            <Star className="w-2.5 h-2.5 text-orange-400 flex-shrink-0" fill="#FB923C" color="#FB923C" />
            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
              <div className={`${accent} h-1.5 rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-4 text-gray-400 tabular-nums text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

const BADGES = {
  gray:   'bg-gray-100 text-gray-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  teal:   'bg-teal-50 text-teal-600',
  orange: 'bg-orange-50 text-orange-600',
};

function Badge({ children, tone = 'gray' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${BADGES[tone]}`}>
      {children}
    </span>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent, Icon }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && (
        <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${accent}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      )}
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-bold text-brand-black leading-none">{value}</span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'sm' }) {
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={`${sz} rounded-full bg-brand-red/10 text-brand-red font-bold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ─── Paginator ────────────────────────────────────────────────────────────────

function Paginator({ pagination, goToPage }) {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages, cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  const from = (cp - 1) * pagination.limit + 1;
  const to = Math.min(cp * pagination.limit, pagination.total);
  return (
    <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-4 flex-shrink-0">
      <p className="text-sm text-gray-500">
        <span className="font-semibold text-brand-black">{from}–{to}</span> of {pagination.total}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => goToPage(cp - 1)} disabled={cp === 1}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map(p => (
          <button key={p} onClick={() => goToPage(p)}
            className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${cp === p ? 'bg-brand-red text-white shadow-sm' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {p}
          </button>
        ))}
        <button onClick={() => goToPage(cp + 1)} disabled={cp === tp}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const EmptyState = ({ icon: IconComp = Inbox, title, sub }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
      <IconComp className="w-5 h-5 text-gray-300" />
    </div>
    <p className="text-sm font-semibold text-gray-500">{title}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

const PageHeader = ({ title, subtitle, actions }) => (
  <div className="flex justify-between items-start gap-4 mb-4 flex-shrink-0">
    <div>
      <h1 className="text-xl  font-bold text-brand-black">{title}</h1>
    </div>
    {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
export default function Feedback() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();

  const [adminView, setAdminView] = useState('summary');
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // modal
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ assessmentId: '', content: '', rating: 0 });

  // admin summary
  const [summaries, setSummaries] = useState([]);
  const [summaryFilters, setSummaryFilters] = useState({ competencyId: '', dateFrom: '', dateTo: '' });
  const [competencies, setCompetencies] = useState([]);

  // admin detail
  const [detailFeedbacks, setDetailFeedbacks] = useState([]);
  const [detailPagination, setDetailPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  // employee
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [myPagination, setMyPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [eligibleAssessments, setEligibleAssessments] = useState([]);

  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data?.competencies || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      api.get('/feedback/eligible-assessments')
        .then(({ data }) => setEligibleAssessments(data.data?.assessments || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (summaryFilters.competencyId) params.competencyId = summaryFilters.competencyId;
      if (summaryFilters.dateFrom) params.dateFrom = summaryFilters.dateFrom;
      if (summaryFilters.dateTo) params.dateTo = summaryFilters.dateTo;
      const { data } = await api.get('/feedback/admin/summary', { params });
      setSummaries(data.data?.summaries || []);
    } catch { show('Failed to load feedback summaries.', 'error'); }
    setLoading(false);
  }, [summaryFilters, show]);

  const loadDetail = useCallback(async () => {
    if (!selectedSummary) return;
    setLoading(true);
    try {
      const params = { page: detailPagination.page, limit: detailPagination.limit };
      const { data } = await api.get(`/feedback/admin/by-assessment/${selectedSummary.assessmentId}`, { params });
      setDetailFeedbacks(data.data?.feedbacks || []);
      const pg = data.data?.pagination;
      if (pg) setDetailPagination(prev => ({ ...prev, total: pg.total, totalPages: Math.ceil(pg.total / prev.limit) }));
    } catch { show('Failed to load feedback details.', 'error'); }
    setLoading(false);
  }, [selectedSummary, detailPagination.page, detailPagination.limit, show]);

  const loadMyFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/feedback', { params: { page: myPagination.page, limit: myPagination.limit } });
      setMyFeedbacks(data.data?.feedbacks || []);
      const pg = data.data?.pagination;
      if (pg) setMyPagination(prev => ({ ...prev, total: pg.total, totalPages: Math.ceil(pg.total / prev.limit) }));
    } catch { show('Failed to load feedback.', 'error'); }
    setLoading(false);
  }, [myPagination.page, myPagination.limit, show]);

  useEffect(() => {
    if (isAdmin) {
      if (adminView === 'summary') loadSummaries();
      else if (adminView === 'detail') loadDetail();
    } else {
      loadMyFeedbacks();
    }
  }, [isAdmin, adminView, loadSummaries, loadDetail, loadMyFeedbacks]);

  const handleSubmit = async () => {
    if (!form.assessmentId || !form.content.trim()) return show('Please select an assessment and write feedback.', 'error');
    try {
      await api.post('/feedback', form);
      show('Feedback submitted!', 'success');
      setModal(false);
      setForm({ assessmentId: '', content: '', rating: 0 });
      api.get('/feedback/eligible-assessments').then(({ data }) => setEligibleAssessments(data.data?.assessments || [])).catch(() => {});
      loadMyFeedbacks();
    } catch (err) { show(err.response?.data?.message || 'Failed to submit feedback.', 'error'); }
  };

  const inputCls = 'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition';

  // ─── EMPLOYEE VIEW ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    const pending = eligibleAssessments.filter(a => !a.alreadySubmitted);
    return (
      <div className="p-7 bg-gradient-to-br from-gray-50 to-white h-[calc(100vh-4rem)] flex flex-col">
        <PageHeader
          title="My Feedback"
          subtitle="Submit feedback for completed assessments"
          actions={
            <button
              onClick={() => { setForm({ assessmentId: '', content: '', rating: 0 }); setModal(true); }}
              disabled={pending.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-transform hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus className="w-3.5 h-3.5" /> New Feedback
            </button>
          }
        />

        {pending.length > 0 && (
          <button
            onClick={() => { setForm({ assessmentId: '', content: '', rating: 0 }); setModal(true); }}
            className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-gray-600 hover:border-brand-red/40 transition-colors flex-shrink-0 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-brand-red" />
            <span>
              <span className="font-semibold text-brand-black">{pending.length}</span>
              {pending.length === 1 ? ' assessment' : ' assessments'} ready for your feedback — click to add one.
            </span>
          </button>
        )}

        {eligibleAssessments.length === 0 && (
          <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 text-sm text-gray-500 flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-gray-400" />
            Complete assessments first to be able to submit feedback.
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0">
          {loading ? <LoadingCard /> : (
            <>
              {myFeedbacks.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200/70">
                  <EmptyState icon={MessageSquare} title="No feedback submitted yet"
                    sub="Your submitted feedback will appear here." />
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {myFeedbacks.map(f => (
                      <div key={f._id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-sm text-gray-800 leading-snug">
                              {f.assessmentId?.competencyId?.name}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{f.assessmentId?.description || ''}</p>
                          </div>
                          {f.rating > 0 && <StarRating value={f.rating} size="sm" />}
                        </div>
                        <p className="text-xs text-gray-500 mb-2.5 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" /> {fmtDate(f.createdAt)}
                        </p>
                        <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                          {f.content}
                        </p>
                      </div>
                    ))}
                  </div>
                  <Paginator pagination={myPagination} goToPage={p => setMyPagination(prev => ({ ...prev, page: p }))} />
                </>
              )}
            </>
          )}
        </div>

        {/* Modal */}
        <Modal open={modal} onClose={() => setModal(false)} title="Submit Feedback">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Assessment *</label>
              <select value={form.assessmentId}
                onChange={e => setForm(p => ({ ...p, assessmentId: e.target.value }))}
                className={inputCls}>
                <option value="">— Select assessment —</option>
                {pending.map(a => (
                  <option key={a._id} value={a._id}>
                    {a.competencyId?.name ? a.competencyId.name : ''}{a.targetGroup ? ` (${a.targetGroup})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Rating <span className="font-normal text-gray-400">(optional)</span></label>
              <StarRating value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Feedback *</label>
              <textarea rows={4} value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder="Share your thoughts on the assessment experience..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 resize-none focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
                maxLength={2000} />
              <p className="text-[10px] text-gray-400 text-right mt-1">{form.content.length} / 2000</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
            <button onClick={() => setModal(false)} className="px-3.5 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors">Submit</button>
          </div>
        </Modal>
      </div>
    );
  }

  // ─── ADMIN DETAIL VIEW ──────────────────────────────────────────────────────
  if (adminView === 'detail' && selectedSummary) {
    return (
      <div className="p-7 bg-gradient-to-br from-gray-50 to-white h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex items-start gap-3 mb-4 flex-shrink-0">
          <button
            onClick={() => { setAdminView('summary'); setSelectedSummary(null); }}
            className="mt-0.5 p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg  font-bold text-brand-black leading-snug line-clamp-1">
              {selectedSummary.competencyName}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {selectedSummary.purpose && <Badge tone="indigo">{selectedSummary.purpose}</Badge>}
              {selectedSummary.targetGroup && <Badge tone="gray">{selectedSummary.targetGroup.replace('-', ' ')}</Badge>}
              <span className="text-xs text-gray-400">{selectedSummary.assessmentDescription || ''}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {/* Rating breakdown */}
          {selectedSummary.ratedCount > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-brand-red" /> Rating Breakdown
                </p>
                {selectedSummary.avgRating && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${ratingTone(selectedSummary.avgRating).badge}`}>
                    <Star className="w-3 h-3" fill="currentColor" color="currentColor" />
                    {selectedSummary.avgRating.toFixed(1)} average
                  </span>
                )}
              </div>
              <RatingDistribution summary={selectedSummary} />
            </div>
          )}

          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <p className="text-sm font-semibold text-gray-700">Feedback Entries</p>
            <span className="text-xs text-gray-500">{detailPagination.total} total</span>
          </div>

          {loading ? <LoadingCard /> : (
            <>
              {detailFeedbacks.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200/70">
                  <EmptyState icon={MessageSquare} title="No feedback entries found."
                    sub="Employees haven't submitted feedback for this assessment yet." />
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {detailFeedbacks.map(f => (
                      <div key={f._id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={f.userId?.name} />
                            <div>
                              <p className="text-sm font-semibold text-gray-800 leading-tight">{f.userId?.name || 'Anonymous'}</p>
                              <p className="text-[11px] text-gray-400">{f.userId?.department || '—'} · {f.userId?.position || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {f.rating > 0 && <StarRating value={f.rating} size="sm" />}
                            <span className="text-[11px] text-gray-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {fmtDate(f.createdAt)}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                          {f.content}
                        </p>
                      </div>
                    ))}
                  </div>
                  <Paginator pagination={detailPagination} goToPage={p => setDetailPagination(prev => ({ ...prev, page: p }))} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── ADMIN SUMMARY VIEW ─────────────────────────────────────────────────────
  const totalFeedbacks = summaries.reduce((s, x) => s + x.totalFeedbacks, 0);
  const ratedSummaries = summaries.filter(x => x.avgRating);
  const totalRated = ratedSummaries.reduce((s, x) => s + x.ratedCount, 0);
  const avgOverall = ratedSummaries.length > 0
    ? ratedSummaries.reduce((s, x) => s + x.avgRating, 0) / ratedSummaries.length
    : null;

  const hasFilters = summaryFilters.competencyId || summaryFilters.dateFrom || summaryFilters.dateTo;

  return (
    <div className="p-7 bg-gradient-to-br from-gray-50 to-white h-[calc(100vh-4rem)] flex flex-col">
      <PageHeader
        title="Feedback Overview"
        subtitle="Ratings and responses per assessment"
        actions={
          <button onClick={loadSummaries}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        }
      />

      {/* Stat cards */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 mb-4 flex items-center gap-x-6 gap-y-1.5 flex-wrap flex-shrink-0">
        <StatCard label="Total Feedback" value={totalFeedbacks}
          accent="bg-brand-red/10 text-brand-red" Icon={MessageSquare} />
        <StatCard label="Avg Rating" value={avgOverall ? `${avgOverall.toFixed(1)}/5` : '—'}
          accent="bg-orange-50 text-orange-600" Icon={Star} />
        <StatCard label="Rated Responses" value={totalRated}
          accent="bg-blue-50 text-blue-600" Icon={BarChart3} />
        <StatCard label="Assessments" value={summaries.length}
          accent="bg-green-50 text-green-600" Icon={ClipboardList} />
      </div>

      {/* Filter bar — single row */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <select value={summaryFilters.competencyId}
            onChange={e => setSummaryFilters(p => ({ ...p, competencyId: e.target.value }))}
            className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 cursor-pointer min-w-[180px]">
            <option value="">All Competencies</option>
            {competencies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <input type="date" value={summaryFilters.dateFrom}
              onChange={e => setSummaryFilters(p => ({ ...p, dateFrom: e.target.value }))}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100" />
            <span className="text-gray-300 text-sm">—</span>
            <input type="date" value={summaryFilters.dateTo}
              onChange={e => setSummaryFilters(p => ({ ...p, dateTo: e.target.value }))}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100" />
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            {hasFilters && (
              <button onClick={() => setSummaryFilters({ competencyId: '', dateFrom: '', dateTo: '' })}
                className="h-9 px-3 flex items-center gap-1 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            <button onClick={loadSummaries}
              className="h-9 px-4 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" /> Apply
            </button>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? <LoadingCard /> : summaries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200/70">
            <EmptyState icon={MessageSquare} title="No feedback data yet"
              sub="Feedback will appear once employees submit reviews." />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {summaries.map(s => (
              <div key={s.assessmentId}
                onClick={() => {
                  setSelectedSummary(s);
                  setDetailFeedbacks([]);
                  setDetailPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
                  setAdminView('detail');
                }}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:border-brand-red/40 hover:shadow-sm transition-all cursor-pointer group flex flex-col">

                {/* Title + chips */}
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  <span className="text-sm font-semibold text-brand-black leading-snug">{s.competencyName}</span>
                  {s.targetGroup && <Badge tone="gray">{s.targetGroup.replace('-', ' ')}</Badge>}
                </div>
                {s.assessmentDescription && (
                  <p className="text-[11px] text-gray-400 mb-3 line-clamp-1">{s.assessmentDescription}</p>
                )}

                {/* Rating highlight + count */}
                <div className="flex items-center justify-between mb-3">
                  {s.avgRating ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold border ${ratingTone(s.avgRating).badge}`}>
                      <Star className="w-3 h-3" fill="currentColor" color="currentColor" />
                      {s.avgRating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400 italic">No ratings yet</span>
                  )}
                  <span className="text-[11px] text-gray-400">{s.ratedCount} rated · {s.totalFeedbacks} total</span>
                </div>

                {/* Compact rating bars */}
                {s.ratedCount > 0 && (
                  <div className="mb-3">
                    <RatingDistribution summary={s} accent={ratingTone(s.avgRating || 3).bar} />
                  </div>
                )}

                {/* Footer CTA */}
                <div className="flex items-center justify-end pt-3 border-t border-gray-100 mt-auto">
                  <span className="text-[11px] font-semibold text-brand-red flex items-center gap-1 group-hover:gap-1.5 transition-all">
                    View entries
                    {s.totalFeedbacks > 0 && <span className="min-w-[18px] h-[18px] rounded-full bg-brand-red text-white text-[10px] flex items-center justify-center px-1">{s.totalFeedbacks}</span>}
                    <Eye className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}