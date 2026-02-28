import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Plus, Star, CheckCircle2, ChevronLeft, ChevronRight, Filter,
  MessageSquare, BarChart3, X, Eye, ArrowLeft, Clock,
  Users, RefreshCw, AlertCircle, Calendar
} from 'lucide-react';
import Modal from '../components/Modal';
import api from '../utils/api';

// ─── sub-components ───────────────────────────────────────────────────────────
function StarRating({ value, onChange, size = 'md' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(v => (
        <button key={v} type="button" onClick={() => onChange && onChange(value === v ? 0 : v)}
          className={`${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}>
          <Star className={sz} fill={value >= v ? '#EA580C' : 'none'} color={value >= v ? '#EA580C' : '#D1D5DB'} />
        </button>
      ))}
    </div>
  );
}

function RatingDistribution({ summary }) {
  const { ratedCount, rating5 = 0, rating4 = 0, rating3 = 0, rating2 = 0, rating1 = 0 } = summary;
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map(star => {
        const count = summary[`rating${star}`] || 0;
        const pct = ratedCount > 0 ? (count / ratedCount) * 100 : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-right text-gray-500 font-medium">{star}</span>
            <Star className="w-3 h-3 text-orange-400 flex-shrink-0" fill="#FB923C" color="#FB923C" />
            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
              <div className="bg-orange-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-5 text-gray-500">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function Paginator({ pagination, goToPage }) {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages, cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  return (
    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
      <p className="text-sm text-gray-500">{(cp-1)*pagination.limit+1}–{Math.min(cp*pagination.limit, pagination.total)} of {pagination.total}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => goToPage(cp-1)} disabled={cp===1} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4"/></button>
        {pages.map(p => <button key={p} onClick={() => goToPage(p)} className={`w-9 h-9 rounded-lg text-sm font-medium ${cp===p?'bg-brand-red text-white':'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{p}</button>)}
        <button onClick={() => goToPage(cp+1)} disabled={cp===tp} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4"/></button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Feedback() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();

  // ── admin: summary card view vs detail drill-down ─────────────────────────
  const [adminView, setAdminView] = useState('summary');
  const [selectedSummary, setSelectedSummary] = useState(null);

  // ── loading ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);

  // ── modal ─────────────────────────────────────────────────────────────────
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ assessmentId: '', content: '', rating: 0 });

  // ── admin: summary state ──────────────────────────────────────────────────
  const [summaries, setSummaries] = useState([]);
  const [summaryFilters, setSummaryFilters] = useState({ competencyId: '', dateFrom: '', dateTo: '' });
  const [competencies, setCompetencies] = useState([]);

  // ── admin: detail drill-down state ───────────────────────────────────────
  const [detailFeedbacks, setDetailFeedbacks] = useState([]);
  const [detailFilter, setDetailFilter] = useState('');
  const [detailPagination, setDetailPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  // ── employee state ────────────────────────────────────────────────────────
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [myPagination, setMyPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [eligibleAssessments, setEligibleAssessments] = useState([]);

  // ── load competencies (for admin filter) ──────────────────────────────────
  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data?.competencies || [])).catch(() => {});
  }, []);

  // ── load eligible assessments for employee ────────────────────────────────
  useEffect(() => {
    if (!isAdmin) {
      api.get('/feedback/eligible-assessments')
        .then(({ data }) => setEligibleAssessments(data.data?.assessments || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  // ── admin: load summaries ─────────────────────────────────────────────────
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

  // ── admin: load detail feedbacks for one assessment ───────────────────────
  const loadDetail = useCallback(async () => {
    if (!selectedSummary) return;
    setLoading(true);
    try {
      const params = { page: detailPagination.page, limit: detailPagination.limit };
      if (detailFilter !== '') params.reviewed = detailFilter;
      const { data } = await api.get(`/feedback/admin/by-assessment/${selectedSummary.assessmentId}`, { params });
      setDetailFeedbacks(data.data?.feedbacks || []);
      const pg = data.data?.pagination;
      if (pg) setDetailPagination(prev => ({ ...prev, total: pg.total, totalPages: Math.ceil(pg.total / prev.limit) }));
    } catch { show('Failed to load feedback details.', 'error'); }
    setLoading(false);
  }, [selectedSummary, detailFilter, detailPagination.page, detailPagination.limit]);

  // ── employee: load own feedbacks ──────────────────────────────────────────
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

  // ── trigger loads ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin) {
      if (adminView === 'summary') loadSummaries();
      else if (adminView === 'detail') loadDetail();
    } else {
      loadMyFeedbacks();
    }
  }, [isAdmin, adminView, loadSummaries, loadDetail, loadMyFeedbacks]);

  // ── admin: mark reviewed ──────────────────────────────────────────────────
  const reviewItem = async (id) => {
    try {
      await api.patch(`/feedback/${id}/review`);
      show('Marked as reviewed.', 'success');
      setDetailFeedbacks(prev => prev.map(f => f._id === id ? { ...f, reviewed: true } : f));
      // update pending count in selected summary
      setSelectedSummary(prev => prev ? { ...prev, pendingReview: Math.max(0, prev.pendingReview - 1), reviewedCount: prev.reviewedCount + 1 } : prev);
    } catch { show('Failed to mark as reviewed.', 'error'); }
  };

  // ── employee: submit feedback ─────────────────────────────────────────────
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

  // ─── EMPLOYEE VIEW ────────────────────────────────────────────────────────
  if (!isAdmin) {
    const pending = eligibleAssessments.filter(a => !a.alreadySubmitted);
    return (
      <div className="p-7">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-brand-black">My Feedback</h1>
            <p className="text-gray-500 mt-1">Submit feedback for assessments you have completed.</p>
          </div>
          <button onClick={() => { setForm({ assessmentId: '', content: '', rating: 0 }); setModal(true); }}
            disabled={pending.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-4 h-4" /> Submit Feedback
          </button>
        </div>

        {pending.length === 0 && eligibleAssessments.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">You have submitted feedback for all your completed assessments.</p>
          </div>
        )}
        {eligibleAssessments.length === 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-800">Complete assessments first to be able to submit feedback.</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {myFeedbacks.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-base font-medium">No feedback submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-4 mb-4">
                {myFeedbacks.map(f => (
                  <div key={f._id} className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{f.assessmentId?.description || 'Assessment'}</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(f.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {f.rating > 0 && <StarRating value={f.rating} size="sm" />}
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${f.reviewed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.reviewed ? 'Reviewed' : 'Pending'}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 mt-2">{f.content}</p>
                  </div>
                ))}
              </div>
            )}
            <Paginator pagination={myPagination} goToPage={p => setMyPagination(prev => ({ ...prev, page: p }))} />
          </>
        )}

        {/* Submit modal */}
        <Modal open={modal} onClose={() => setModal(false)} title="Submit Feedback">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Assessment *</label>
              <select value={form.assessmentId} onChange={e => setForm(p => ({ ...p, assessmentId: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                <option value="">— Select an assessment —</option>
                {pending.map(a => (
                  <option key={a._id} value={a._id}>
                    {a.description || 'Assessment'}{a.competencyId?.name ? ` — ${a.competencyId.name}` : ''}{a.targetGroup ? ` (${a.targetGroup})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Rating (optional)</label>
              <StarRating value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your Feedback *</label>
              <textarea rows={4} value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder="Share your honest thoughts on the assessment experience..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm resize-none focus:ring-2 focus:ring-brand-red"
                maxLength={2000} />
              <p className="text-xs text-gray-400 text-right mt-1">{form.content.length}/2000</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
            <button onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} className="px-5 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark">Submit</button>
          </div>
        </Modal>
      </div>
    );
  }

  // ─── ADMIN DETAIL VIEW ────────────────────────────────────────────────────
  if (adminView === 'detail' && selectedSummary) {
    return (
      <div className="p-7">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => { setAdminView('summary'); setSelectedSummary(null); }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold text-brand-black line-clamp-1">
              {selectedSummary.assessmentDescription || 'Assessment Feedback'}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {selectedSummary.competencyName && <span className="text-sm text-gray-500">{selectedSummary.competencyName}</span>}
              {selectedSummary.targetGroup && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{selectedSummary.targetGroup.replace('-', ' ')}</span>}
              {selectedSummary.purpose && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{selectedSummary.purpose}</span>}
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Feedback', value: selectedSummary.totalFeedbacks, color: 'bg-blue-50 text-blue-600', icon: MessageSquare },
            { label: 'Avg Rating', value: selectedSummary.avgRating ? `${selectedSummary.avgRating.toFixed(1)}/5` : '—', color: 'bg-orange-50 text-orange-600', icon: Star },
            { label: 'Pending Review', value: selectedSummary.pendingReview, color: 'bg-yellow-50 text-yellow-600', icon: Clock },
            { label: 'Reviewed', value: selectedSummary.reviewedCount, color: 'bg-green-50 text-green-600', icon: CheckCircle2 },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl p-4 shadow-card border border-gray-100 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
              <div><p className="text-xs text-gray-500 font-medium">{label}</p><p className="text-xl font-bold text-brand-black">{value}</p></div>
            </div>
          ))}
        </div>

        {/* Rating distribution */}
        {selectedSummary.ratedCount > 0 && (
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100 mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-red" />Rating Distribution</h3>
            <RatingDistribution summary={selectedSummary} />
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-sm font-semibold text-gray-600">Filter:</span>
          {[['', 'All'], ['false', 'Pending Review'], ['true', 'Reviewed']].map(([val, label]) => (
            <button key={val} onClick={() => { setDetailFilter(val); setDetailPagination(prev => ({ ...prev, page: 1 })); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${detailFilter === val ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {label}
            </button>
          ))}
          <span className="ml-auto text-sm text-gray-400">{detailPagination.total} entries</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-4">
              {detailFeedbacks.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No feedback entries found.</p>
                </div>
              ) : detailFeedbacks.map(f => (
                <div key={f._id} className={`bg-white rounded-xl p-5 shadow-card border transition-all ${f.reviewed ? 'border-green-100' : 'border-gray-100'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-red/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-brand-red font-bold text-sm">{f.userId?.name?.charAt(0) || '?'}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{f.userId?.name || 'Anonymous'}</p>
                        <p className="text-xs text-gray-400">{f.userId?.department || '—'} · {f.userId?.position || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(f.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {f.rating > 0 && <StarRating value={f.rating} size="sm" />}
                      {f.reviewed ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Reviewed
                        </span>
                      ) : (
                        <button onClick={() => reviewItem(f._id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors">
                          <CheckCircle2 className="w-3 h-3" /> Mark Reviewed
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">{f.content}</p>
                  {f.reviewed && f.reviewedBy && (
                    <p className="text-xs text-gray-400 mt-2">Reviewed by {f.reviewedBy?.name || '—'} on {f.reviewedAt ? new Date(f.reviewedAt).toLocaleDateString() : '—'}</p>
                  )}
                </div>
              ))}
            </div>
            <Paginator pagination={detailPagination} goToPage={p => setDetailPagination(prev => ({ ...prev, page: p }))} />
          </>
        )}
      </div>
    );
  }

  // ─── ADMIN SUMMARY CARD VIEW ──────────────────────────────────────────────
  const totalFeedbacks = summaries.reduce((s, x) => s + x.totalFeedbacks, 0);
  const totalPending = summaries.reduce((s, x) => s + x.pendingReview, 0);
  const ratedSummaries = summaries.filter(x => x.avgRating);
  const avgOverall = ratedSummaries.length > 0 ? ratedSummaries.reduce((s, x) => s + x.avgRating, 0) / ratedSummaries.length : null;

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Feedback Overview</h1>
          <p className="text-gray-500 mt-1">Average ratings and reviews per assessment. Click a card to view individual feedback.</p>
        </div>
        <button onClick={loadSummaries} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Feedback Entries', value: totalFeedbacks, icon: MessageSquare, color: 'bg-blue-50 text-blue-600' },
          { label: 'Pending Review', value: totalPending, icon: Clock, color: 'bg-yellow-50 text-yellow-600' },
          { label: 'Bank-wide Avg Rating', value: avgOverall ? `${avgOverall.toFixed(1)} / 5` : '—', icon: Star, color: 'bg-orange-50 text-orange-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-card border border-gray-100 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-6 h-6" /></div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold text-brand-black">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100 mb-6">
        <h3 className="font-semibold text-sm text-gray-800 mb-3 flex items-center gap-2"><Filter className="w-4 h-4 text-brand-red" />Filter Feedback Summaries</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Competency</label>
            <select value={summaryFilters.competencyId} onChange={e => setSummaryFilters(p => ({ ...p, competencyId: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
              <option value="">All Competencies</option>
              {competencies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">From Date</label>
            <input type="date" value={summaryFilters.dateFrom} onChange={e => setSummaryFilters(p => ({ ...p, dateFrom: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">To Date</label>
            <input type="date" value={summaryFilters.dateTo} onChange={e => setSummaryFilters(p => ({ ...p, dateTo: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={loadSummaries} className="flex-1 h-9 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors">Apply</button>
            {(summaryFilters.competencyId || summaryFilters.dateFrom || summaryFilters.dateTo) && (
              <button onClick={() => setSummaryFilters({ competencyId: '', dateFrom: '', dateTo: '' })}
                className="h-9 w-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center p-16">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : summaries.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">No feedback data yet.</p>
          <p className="text-sm mt-1">Feedback will appear here once employees submit their reviews.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {summaries.map(s => (
            <div key={s.assessmentId}
              onClick={() => { setSelectedSummary(s); setDetailFeedbacks([]); setDetailFilter(''); setDetailPagination({ page: 1, limit: 10, total: 0, totalPages: 0 }); setAdminView('detail'); }}
              className="bg-white rounded-xl p-5 shadow-card border border-gray-100 hover:shadow-lg hover:border-brand-red/20 transition-all cursor-pointer group">
              {/* Title */}
              <h3 className="font-bold text-sm text-gray-900 line-clamp-2 group-hover:text-brand-red transition-colors mb-1.5">
                {s.assessmentDescription || 'Untitled Assessment'}
              </h3>
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {s.competencyName && <span className="text-xs text-gray-500">{s.competencyName}</span>}
                {s.targetGroup && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{s.targetGroup.replace('-', ' ')}</span>}
                {s.purpose && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{s.purpose}</span>}
              </div>

              {/* Rating highlight */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {s.avgRating ? (
                    <>
                      <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-sm ${s.avgRating >= 4 ? 'bg-green-50 text-green-700' : s.avgRating >= 3 ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-600'}`}>
                        <Star className="w-3.5 h-3.5" fill="currentColor" color="currentColor" />
                        {s.avgRating.toFixed(1)}
                      </div>
                      <span className="text-xs text-gray-400">avg</span>
                    </>
                  ) : <span className="text-xs text-gray-400 italic">No ratings yet</span>}
                </div>
                <p className="text-xs text-gray-400">{s.ratedCount} rated / {s.totalFeedbacks} total</p>
              </div>

              {/* Rating distribution mini */}
              {s.ratedCount > 0 && (
                <div className="mb-4">
                  <RatingDistribution summary={s} />
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  {s.pendingReview > 0 && (
                    <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />{s.pendingReview} pending
                    </span>
                  )}
                  {s.reviewedCount > 0 && (
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {s.reviewedCount} reviewed
                    </span>
                  )}
                </div>
                <span className="text-xs text-brand-red font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                  View all <Eye className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
