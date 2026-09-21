import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Plus, Star, MessageSquare, BarChart3, X, Eye, ArrowLeft,
  RefreshCw, AlertCircle, Calendar, Search,
  ClipboardList,
} from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import api from '../utils/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useAllCompetencies } from '../hooks/queries';

// ─── Loading spinner (matches Users / Competencies / ActivityLog) ─────────────

const Spinner = () => (
  <div className="flex items-center justify-center p-16">
    <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Shared helpers ────────────────────────────────────────────────────────────

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const ratingTone = (r) => {
  if (r >= 4) return { badge: 'bg-gray-200 text-gray-800 border-gray-300', bar: 'bg-gray-700' };
  if (r >= 3) return { badge: 'bg-gray-100 text-gray-700 border-gray-300', bar: 'bg-gray-500' };
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
            fill={value >= v ? '#C8102E' : 'none'}
            color={value >= v ? '#C8102E' : '#CBD5E1'}
          />
        </button>
      ))}
    </div>
  );
}

// ─── RatingDistribution ───────────────────────────────────────────────────────

function RatingDistribution({ summary, accent = 'bg-brand-red' }) {
  const { ratedCount } = summary;
  return (
    <div className="space-y-1">
      {[5, 4, 3, 2, 1].map(star => {
        const count = summary[`rating${star}`] || 0;
        const pct = ratedCount > 0 ? (count / ratedCount) * 100 : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-right text-gray-400 tabular-nums font-medium">{star}</span>
            <Star className="w-2.5 h-2.5 text-brand-red flex-shrink-0" fill="#C8102E" color="#C8102E" />
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
  indigo: 'bg-gray-100 text-gray-700',
  teal:   'bg-gray-100 text-gray-700',
  orange: 'bg-gray-100 text-gray-700',
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

// ─── Page header (matches Users / Competencies / ActivityLog) ─────────────────

const PageHeader = ({ title, actions }) => (
  <div className="flex justify-between items-start mb-3 flex-shrink-0">
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

  // modal
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ assessmentId: '', content: '', rating: 0 });

  // admin summary
  const [summaryFilters, setSummaryFilters] = useState({ competencyId: '', dateFrom: '', dateTo: '' });
  const [summaryPage, setSummaryPage] = useState(1);
  const SUMMARY_PAGE_SIZE = 8;

  // admin detail
  const [detailPagination, setDetailPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  // employee
  const [myPagination, setMyPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  const queryClient = useQueryClient();

  const { data: competenciesData } = useAllCompetencies({ staleTime: 5 * 60 * 1000 });
  const competencies = competenciesData || [];

  const { data: eligibleData } = useQuery({
    queryKey: queryKeys.feedback.eligible,
    queryFn: async () => {
      const { data } = await api.get('/feedback/eligible-assessments');
      return data.data?.assessments || [];
    },
    enabled: !isAdmin,
  });
  const eligibleAssessments = eligibleData || [];

  const { data: summariesData, isLoading: loadingSummary, refetch: refetchSummaries } = useQuery({
    queryKey: queryKeys.feedback.adminSummary(summaryFilters),
    queryFn: async () => {
      const params = {};
      if (summaryFilters.competencyId) params.competencyId = summaryFilters.competencyId;
      if (summaryFilters.dateFrom) params.dateFrom = summaryFilters.dateFrom;
      if (summaryFilters.dateTo) params.dateTo = summaryFilters.dateTo;
      const { data } = await api.get('/feedback/admin/summary', { params });
      return data.data?.summaries || [];
    },
    enabled: isAdmin && adminView === 'summary',
  });
  const summaries = summariesData || [];

  const detailAssessmentId = selectedSummary?.assessmentId || null;
  const { data: detailData, isLoading: loadingDetail } = useQuery({
    queryKey: queryKeys.feedback.byAssessment(detailAssessmentId, { page: detailPagination.page, limit: detailPagination.limit }),
    queryFn: async () => {
      const params = { page: detailPagination.page, limit: detailPagination.limit };
      const { data } = await api.get(`/feedback/admin/by-assessment/${detailAssessmentId}`, { params });
      return data.data;
    },
    enabled: isAdmin && adminView === 'detail' && !!detailAssessmentId,
  });
  const detailFeedbacks = detailData?.feedbacks || [];
  const detailTotal = detailData?.pagination?.total ?? detailPagination.total;
  const detailTotalPages = detailData?.pagination ? Math.ceil(detailData.pagination.total / detailPagination.limit) : detailPagination.totalPages;

  const { data: myData, isLoading: loadingMy, refetch: refetchMy } = useQuery({
    queryKey: queryKeys.feedback.list({ page: myPagination.page, limit: myPagination.limit }),
    queryFn: async () => {
      const { data } = await api.get('/feedback', { params: { page: myPagination.page, limit: myPagination.limit } });
      return data.data;
    },
    enabled: !isAdmin,
  });
  const myFeedbacks = myData?.feedbacks || [];
  const myTotalPages = myData?.pagination ? Math.ceil(myData.pagination.total / myPagination.limit) : myPagination.totalPages;

  const loading = isAdmin ? (adminView === 'summary' ? loadingSummary : loadingDetail) : loadingMy;

  const submitFeedback = useMutation({
    mutationFn: (payload) => api.post('/feedback', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all }),
  });

  const refreshSummaries = () => { setSummaryPage(1); refetchSummaries(); };
  const applySummary = () => { setSummaryPage(1); refetchSummaries(); };

  const handleSubmit = async () => {
    if (!form.assessmentId || !form.content.trim()) return show('Please select an assessment and write feedback.', 'error');
    try {
      await submitFeedback.mutateAsync(form);
      show('Feedback submitted!', 'success');
      setModal(false);
      setForm({ assessmentId: '', content: '', rating: 0 });
    } catch (err) { show(err.response?.data?.message || 'Failed to submit feedback.', 'error'); }
  };

  const inputCls = 'w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm';

  // ─── EMPLOYEE VIEW ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    const pending = eligibleAssessments.filter(a => !a.alreadySubmitted);
    return (
      <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">
        <PageHeader
          title="My Feedback"
          actions={
            <button
              onClick={() => { setForm({ assessmentId: '', content: '', rating: 0 }); setModal(true); }}
              disabled={pending.length === 0}
              className="flex items-center gap-1.5 px-2 py-1 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus className="w-3 h-3" /> New Feedback
            </button>
          }
        />

        {pending.length > 0 && (
          <button
            onClick={() => { setForm({ assessmentId: '', content: '', rating: 0 }); setModal(true); }}
            className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl shadow-card px-4 py-2.5 mb-4 text-sm text-gray-600 hover:border-brand-red/40 transition-colors flex-shrink-0 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-brand-red" />
            <span>
              <span className="font-semibold text-brand-black">{pending.length}</span>
              {pending.length === 1 ? ' assessment' : ' assessments'} ready for your feedback — click to add one.
            </span>
          </button>
        )}

        {eligibleAssessments.length === 0 && (
          <div className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl shadow-card px-4 py-3 mb-4 text-sm text-gray-500 flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-gray-400" />
            Complete assessments first to be able to submit feedback.
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0 scrollbar-none">
          {loading ? <Spinner /> : (
            <>
              {myFeedbacks.length === 0 ? (
                <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
                  <EmptyState icon={MessageSquare} title="No feedback submitted yet"
                    description="Your submitted feedback will appear here." />
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {myFeedbacks.map(f => (
                      <div key={f._id} className="bg-white border border-gray-100 rounded-xl shadow-card p-4 hover:border-brand-red/40 transition-colors">
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
                  <Pagination
                    currentPage={myPagination.page}
                    totalPages={myTotalPages}
                    onPageChange={p => setMyPagination(prev => ({ ...prev, page: p }))}
                  />
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Rating</label>
              <StarRating value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Feedback *</label>
              <textarea rows={4} value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder="Share your thoughts on the assessment experience..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none"
                maxLength={2000} />
              <p className="text-[10px] text-gray-400 text-right mt-1">{form.content.length} / 2000</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setModal(false)} className="px-4 py-2 text-sm font-semibold text-brand-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors">Submit</button>
          </div>
        </Modal>
      </div>
    );
  }

  // ─── ADMIN DETAIL VIEW ──────────────────────────────────────────────────────
  if (adminView === 'detail' && selectedSummary) {
    return (
      <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex items-start gap-3 mb-3 flex-shrink-0">
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

        <div className="flex-1 overflow-auto min-h-0 scrollbar-none">
          {/* Rating breakdown */}
          {selectedSummary.ratedCount > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl shadow-card p-5 mb-5">
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
            <span className="text-xs text-gray-500">{detailTotal} total</span>
          </div>

          {loading ? <Spinner /> : (
            <>
              {detailFeedbacks.length === 0 ? (
                <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
                  <EmptyState icon={MessageSquare} title="No feedback entries found."
                    description="Employees haven't submitted feedback for this assessment yet." />
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {detailFeedbacks.map(f => (
                      <div key={f._id} className="bg-white border border-gray-100 rounded-xl shadow-card p-4 hover:border-brand-red/40 transition-colors">
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
                  <Pagination
                    currentPage={detailPagination.page}
                    totalPages={detailTotalPages}
                    onPageChange={p => setDetailPagination(prev => ({ ...prev, page: p }))}
                  />
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

  // ── Summary pagination (client-side; summaries load as one batch) ──────────
  const summaryTotalPages = Math.max(1, Math.ceil(summaries.length / SUMMARY_PAGE_SIZE));
  const safeSummaryPage = Math.min(summaryPage, summaryTotalPages);
  const pagedSummaries = summaries.slice(
    (safeSummaryPage - 1) * SUMMARY_PAGE_SIZE,
    safeSummaryPage * SUMMARY_PAGE_SIZE
  );

  return (
    <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">
      <PageHeader
        title="Feedback Overview"
        actions={
          <button onClick={refreshSummaries}
            className="flex items-center gap-1.5 px-2 py-1 text-sm border border-gray-300 bg-white text-brand-black rounded-lg font-semibold hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        }
      />

      {/* Stat cards */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-card px-5 py-3 mb-5 flex items-center gap-x-6 gap-y-1.5 flex-wrap flex-shrink-0">
        <StatCard label="Total Feedback" value={totalFeedbacks}
          accent="bg-brand-red/10 text-brand-red" Icon={MessageSquare} />
        <StatCard label="Avg Rating" value={avgOverall ? `${avgOverall.toFixed(1)}/5` : '—'}
          accent="bg-gray-100 text-gray-700" Icon={Star} />
        <StatCard label="Rated Responses" value={totalRated}
          accent="bg-gray-100 text-gray-700" Icon={BarChart3} />
        <StatCard label="Assessments" value={summaries.length}
          accent="bg-gray-100 text-gray-700" Icon={ClipboardList} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap flex-shrink-0">
        <select value={summaryFilters.competencyId}
          onChange={e => setSummaryFilters(p => ({ ...p, competencyId: e.target.value }))}
          className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm min-w-[180px]">
          <option value="">All Competencies</option>
          {competencies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={summaryFilters.dateFrom}
            onChange={e => setSummaryFilters(p => ({ ...p, dateFrom: e.target.value }))}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm text-gray-600" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={summaryFilters.dateTo}
            onChange={e => setSummaryFilters(p => ({ ...p, dateTo: e.target.value }))}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm text-gray-600" />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {hasFilters && (
            <button onClick={() => { setSummaryFilters({ competencyId: '', dateFrom: '', dateTo: '' }); setSummaryPage(1); }}
              className="flex items-center gap-1.5 px-2 py-1 text-sm border border-gray-300 bg-white text-brand-black rounded-lg font-semibold hover:bg-gray-50 transition-colors">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
          <button onClick={applySummary}
            className="flex items-center gap-1.5 px-2 py-1 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors">
            <Search className="w-3 h-3" /> Apply
          </button>
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-auto min-h-0 scrollbar-none">
        {loading ? <Spinner /> : summaries.length === 0 ? (
          <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
            <EmptyState icon={MessageSquare} title="No feedback data yet"
              description="Feedback will appear once employees submit reviews." />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pagedSummaries.map(s => (
              <div key={s.assessmentId}
                onClick={() => {
                  setSelectedSummary(s);
                  setDetailPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
                  setAdminView('detail');
                }}
                className="bg-white border border-gray-100 rounded-xl shadow-card p-3 hover:border-brand-red/40 hover:shadow-md transition-all cursor-pointer group flex flex-col">

                {/* Title + chips */}
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className="text-[13px] font-semibold text-brand-black leading-snug line-clamp-1">{s.competencyName}</span>
                  {s.targetGroup && <Badge tone="gray">{s.targetGroup.replace('-', ' ')}</Badge>}
                </div>
                {s.assessmentDescription && (
                  <p className="text-[11px] text-gray-400 mb-2 line-clamp-1">{s.assessmentDescription}</p>
                )}

                {/* Rating highlight + count */}
                <div className="flex items-center justify-between mb-2">
                  {s.avgRating ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${ratingTone(s.avgRating).badge}`}>
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
                  <div className="mb-2">
                    <RatingDistribution summary={s} accent={ratingTone(s.avgRating || 3).bar} />
                  </div>
                )}

                {/* Footer CTA */}
                <div className="flex items-center justify-end pt-2 border-t border-gray-100 mt-auto">
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

      {/* Pagination sticky footer */}
      <div className="flex-shrink-0 border-t border-gray-100">
        {summaries.length > 0 && (
          <div className="pt-3 px-4 pb-0 text-xs text-gray-400">
            {summaries.length} assessment(s) · page {safeSummaryPage} of {summaryTotalPages}
          </div>
        )}
        <Pagination
          currentPage={safeSummaryPage}
          totalPages={summaryTotalPages}
          onPageChange={setSummaryPage}
        />
      </div>
    </div>
  );
}