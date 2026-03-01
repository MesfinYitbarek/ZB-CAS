import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Plus, Star, ChevronLeft, ChevronRight, Filter,
  MessageSquare, BarChart3, X, Eye, ArrowLeft,
  Users, RefreshCw, AlertCircle, Calendar, Search
} from 'lucide-react';
import Modal from '../components/Modal';
import api from '../utils/api';

// ─── StarRating ───────────────────────────────────────────────────────────────
function StarRating({ value, onChange, size = 'md' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(v => (
        <button key={v} type="button"
          onClick={() => onChange && onChange(value === v ? 0 : v)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}>
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

// ─── RatingBar ────────────────────────────────────────────────────────────────
function RatingDistribution({ summary }) {
  const { ratedCount } = summary;
  return (
    <div className="space-y-1">
      {[5, 4, 3, 2, 1].map(star => {
        const count = summary[`rating${star}`] || 0;
        const pct = ratedCount > 0 ? (count / ratedCount) * 100 : 0;
        return (
          <div key={star} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 text-right text-slate-400 tabular-nums">{star}</span>
            <Star className="w-2.5 h-2.5 text-orange-400 flex-shrink-0" fill="#FB923C" color="#FB923C" />
            <div className="flex-1 bg-slate-100 rounded-full h-1">
              <div className="bg-orange-400 h-1 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-4 text-slate-400 tabular-nums text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Paginator ────────────────────────────────────────────────────────────────
function Paginator({ pagination, goToPage }) {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages, cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  return (
    <div className="flex justify-between items-center pt-3 border-t border-slate-100 mt-3">
      <p className="text-xs text-slate-400">
        {(cp - 1) * pagination.limit + 1}–{Math.min(cp * pagination.limit, pagination.total)} of {pagination.total}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => goToPage(cp - 1)} disabled={cp === 1}
          className="p-1.5 rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pages.map(p => (
          <button key={p} onClick={() => goToPage(p)}
            className={`w-7 h-7 rounded-md text-xs font-semibold transition-colors ${cp === p ? 'bg-brand-red text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {p}
          </button>
        ))}
        <button onClick={() => goToPage(cp + 1)} disabled={cp === tp}
          className="p-1.5 rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Avatar initials ──────────────────────────────────────────────────────────
function Avatar({ name, size = 'sm' }) {
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm';
  return (
    <div className={`${sz} rounded-full bg-brand-red/10 text-brand-red font-bold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
function Chip({ children, color = 'slate' }) {
  const styles = {
    slate:  'bg-slate-100 text-slate-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    teal:   'bg-teal-50 text-teal-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
      </div>
    </div>
  );
}

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
  }, [summaryFilters]);

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
  }, [selectedSummary, detailPagination.page, detailPagination.limit]);

  const loadMyFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/feedback', { params: { page: myPagination.page, limit: myPagination.limit } });
      setMyFeedbacks(data.data?.feedbacks || []);
      const pg = data.data?.pagination;
      if (pg) setMyPagination(prev => ({ ...prev, total: pg.total, totalPages: Math.ceil(pg.total / prev.limit) }));
    } catch { show('Failed to load feedback.', 'error'); }
    setLoading(false);
  }, [myPagination.page, myPagination.limit]);

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

  const Spinner = () => (
    <div className="flex items-center justify-center py-16">
      <div className="w-7 h-7 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ─── EMPLOYEE VIEW ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    const pending = eligibleAssessments.filter(a => !a.alreadySubmitted);
    return (
      <div className="p-6 max-w-3xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-800">My Feedback</h1>
            <p className="text-xs text-slate-400 mt-0.5">Submit feedback for completed assessments</p>
          </div>
          <button
            onClick={() => { setForm({ assessmentId: '', content: '', rating: 0 }); setModal(true); }}
            disabled={pending.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus className="w-3.5 h-3.5" /> New Feedback
          </button>
        </div>

        {/* Notice banners */}
        {eligibleAssessments.length === 0 && (
          <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 mb-4 text-xs text-slate-500">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-slate-400" />
            Complete assessments first to be able to submit feedback.
          </div>
        )}

        {loading ? <Spinner /> : (
          <>
            {myFeedbacks.length === 0 ? (
              <div className="text-center py-16">
                <MessageSquare className="w-9 h-9 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400 font-medium">No feedback submitted yet</p>
              </div>
            ) : (
              <div className="space-y-3 mb-3">
                {myFeedbacks.map(f => (
                  <div key={f._id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold text-sm text-slate-800 leading-snug">
                        {f.assessmentId?.description || 'Assessment'}
                      </p>
                      {f.rating > 0 && <StarRating value={f.rating} size="sm" />}
                    </div>
                    <p className="text-xs text-slate-400 mb-2.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(f.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                      {f.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Paginator pagination={myPagination} goToPage={p => setMyPagination(prev => ({ ...prev, page: p }))} />
          </>
        )}

        {/* Modal */}
        <Modal open={modal} onClose={() => setModal(false)} title="Submit Feedback">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Assessment *</label>
              <select value={form.assessmentId}
                onChange={e => setForm(p => ({ ...p, assessmentId: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:ring-2 focus:ring-brand-red bg-white">
                <option value="">— Select assessment —</option>
                {pending.map(a => (
                  <option key={a._id} value={a._id}>
                    {a.description || 'Assessment'}{a.competencyId?.name ? ` · ${a.competencyId.name}` : ''}{a.targetGroup ? ` (${a.targetGroup})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Rating <span className="font-normal text-slate-400">(optional)</span></label>
              <StarRating value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Feedback *</label>
              <textarea rows={4} value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder="Share your thoughts on the assessment experience..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 resize-none focus:ring-2 focus:ring-brand-red"
                maxLength={2000} />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{form.content.length} / 2000</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
            <button onClick={() => setModal(false)} className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark">Submit</button>
          </div>
        </Modal>
      </div>
    );
  }

  // ─── ADMIN DETAIL VIEW ──────────────────────────────────────────────────────
  if (adminView === 'detail' && selectedSummary) {
    return (
      <div className="p-6">
        {/* Back + header */}
        <div className="flex items-start gap-3 mb-5">
          <button
            onClick={() => { setAdminView('summary'); setSelectedSummary(null); }}
            className="mt-0.5 p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-snug line-clamp-1">
              {selectedSummary.assessmentDescription || 'Assessment Feedback'}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {selectedSummary.competencyName && (
                <span className="text-xs text-slate-500">{selectedSummary.competencyName}</span>
              )}
              {selectedSummary.targetGroup && (
                <Chip color="slate">{selectedSummary.targetGroup.replace('-', ' ')}</Chip>
              )}
              {selectedSummary.purpose && (
                <Chip color="indigo">{selectedSummary.purpose}</Chip>
              )}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <KpiCard label="Total Feedback" value={selectedSummary.totalFeedbacks} icon={MessageSquare} accent="bg-blue-50 text-blue-500" />
          <KpiCard label="Avg Rating" value={selectedSummary.avgRating ? `${selectedSummary.avgRating.toFixed(1)} / 5` : '—'} icon={Star} accent="bg-orange-50 text-orange-500" />
          <KpiCard label="With Rating" value={selectedSummary.ratedCount} icon={BarChart3} accent="bg-teal-50 text-teal-500" />
        </div>

        {/* Rating distribution */}
        {selectedSummary.ratedCount > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-brand-red" /> Rating Breakdown
            </p>
            <RatingDistribution summary={selectedSummary} />
          </div>
        )}

        {/* Entries */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">Feedback Entries</p>
          <span className="text-xs text-slate-400">{detailPagination.total} total</span>
        </div>

        {loading ? <Spinner /> : (
          <>
            <div className="space-y-3 mb-3">
              {detailFeedbacks.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">No feedback entries found.</p>
                </div>
              ) : detailFeedbacks.map(f => (
                <div key={f._id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                  <div className="flex justify-between items-start mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={f.userId?.name} />
                      <div>
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{f.userId?.name || 'Anonymous'}</p>
                        <p className="text-[11px] text-slate-400">{f.userId?.department || '—'} · {f.userId?.position || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {f.rating > 0 && <StarRating value={f.rating} size="sm" />}
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                    {f.content}
                  </p>
                </div>
              ))}
            </div>
            <Paginator pagination={detailPagination} goToPage={p => setDetailPagination(prev => ({ ...prev, page: p }))} />
          </>
        )}
      </div>
    );
  }

  // ─── ADMIN SUMMARY VIEW ─────────────────────────────────────────────────────
  const totalFeedbacks = summaries.reduce((s, x) => s + x.totalFeedbacks, 0);
  const ratedSummaries = summaries.filter(x => x.avgRating);
  const avgOverall = ratedSummaries.length > 0
    ? ratedSummaries.reduce((s, x) => s + x.avgRating, 0) / ratedSummaries.length
    : null;

  const hasFilters = summaryFilters.competencyId || summaryFilters.dateFrom || summaryFilters.dateTo;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Feedback Overview</h1>
          <p className="text-xs text-slate-400 mt-0.5">Ratings and responses per assessment</p>
        </div>
        <button onClick={loadSummaries}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <KpiCard label="Total Entries" value={totalFeedbacks} icon={MessageSquare} accent="bg-blue-50 text-blue-500" />
        <KpiCard label="Assessments" value={summaries.length} icon={Users} accent="bg-violet-50 text-violet-500" />
        <KpiCard label="Overall Avg Rating" value={avgOverall ? `${avgOverall.toFixed(1)} / 5` : '—'} icon={Star} accent="bg-orange-50 text-orange-500" />
      </div>

      {/* Filter bar — compact single row */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <select value={summaryFilters.competencyId}
            onChange={e => setSummaryFilters(p => ({ ...p, competencyId: e.target.value }))}
            className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:ring-2 focus:ring-brand-red bg-white min-w-[160px]">
            <option value="">All Competencies</option>
            {competencies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <input type="date" value={summaryFilters.dateFrom}
            onChange={e => setSummaryFilters(p => ({ ...p, dateFrom: e.target.value }))}
            className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:ring-2 focus:ring-brand-red bg-white" />
          <span className="text-slate-300 text-xs">—</span>
          <input type="date" value={summaryFilters.dateTo}
            onChange={e => setSummaryFilters(p => ({ ...p, dateTo: e.target.value }))}
            className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:ring-2 focus:ring-brand-red bg-white" />
          <div className="flex items-center gap-1.5 ml-auto">
            {hasFilters && (
              <button onClick={() => setSummaryFilters({ competencyId: '', dateFrom: '', dateTo: '' })}
                className="h-8 w-8 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-400">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={loadSummaries}
              className="h-8 px-4 bg-brand-red text-white rounded-lg text-xs font-semibold hover:bg-brand-red-dark transition-colors">
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      {loading ? <Spinner /> : summaries.length === 0 ? (
        <div className="text-center py-20">
          <MessageSquare className="w-10 h-10 mx-auto mb-2 text-slate-200" />
          <p className="text-sm text-slate-400 font-medium">No feedback data yet</p>
          <p className="text-xs text-slate-400 mt-1">Feedback will appear once employees submit reviews.</p>
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
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-brand-red/40 hover:shadow-sm transition-all cursor-pointer group">

              {/* Title + chips */}
              <h3 className="font-semibold text-sm text-slate-800 line-clamp-2 group-hover:text-brand-red transition-colors mb-1.5 leading-snug">
                {s.assessmentDescription || 'Untitled Assessment'}
              </h3>
              <div className="flex items-center gap-1 mb-3 flex-wrap">
                {s.competencyName && (
                  <span className="text-[10px] text-slate-400">{s.competencyName}</span>
                )}
                {s.targetGroup && (
                  <Chip color="slate">{s.targetGroup.replace('-', ' ')}</Chip>
                )}
                {s.purpose && (
                  <Chip color="indigo">{s.purpose}</Chip>
                )}
              </div>

              {/* Rating highlight + count */}
              <div className="flex items-center justify-between mb-3">
                {s.avgRating ? (
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${s.avgRating >= 4 ? 'bg-green-50 text-green-700' : s.avgRating >= 3 ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-600'}`}>
                    <Star className="w-3 h-3" fill="currentColor" color="currentColor" />
                    {s.avgRating.toFixed(1)}
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">No ratings</span>
                )}
                <span className="text-[11px] text-slate-400">
                  {s.ratedCount} rated · {s.totalFeedbacks} total
                </span>
              </div>

              {/* Compact rating bars */}
              {s.ratedCount > 0 && (
                <div className="mb-3">
                  <RatingDistribution summary={s} />
                </div>
              )}

              {/* Footer CTA */}
              <div className="flex items-center justify-end pt-2.5 border-t border-slate-100">
                <span className="text-[11px] text-brand-red font-semibold flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  View entries <Eye className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
