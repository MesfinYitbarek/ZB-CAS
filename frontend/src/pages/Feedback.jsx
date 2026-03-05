import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Plus, Star, ChevronLeft, ChevronRight, Filter,
  MessageSquare, BarChart3, X, Eye, ArrowLeft,
  RefreshCw, AlertCircle, Calendar, Search
} from 'lucide-react';
import Modal from '../components/Modal';
import api from '../utils/api';

// ─── Compact UI Components ──────────────────────────────────────────────────

const StarRating = ({ value, onChange, size = 'sm' }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map(v => (
      <button key={v} type="button" onClick={() => onChange?.(value === v ? 0 : v)} className={onChange ? 'cursor-pointer' : ''}>
        <Star className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} fill={value >= v ? '#f59e0b' : 'none'} color={value >= v ? '#f59e0b' : '#cbd5e1'} strokeWidth={2.5} />
      </button>
    ))}
  </div>
);

const RatingBar = ({ label, count, pct }) => (
  <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500 leading-none">
    <span className="w-1 tabular-nums">{label}</span>
    <div className="flex-1 bg-slate-100 rounded-full h-1 overflow-hidden">
      <div className="bg-amber-400 h-full transition-all" style={{ width: `${pct}%` }} />
    </div>
    <span className="w-4 text-right text-slate-400">{count}</span>
  </div>
);

const Paginator = ({ pagination, goToPage }) => {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const { total, limit, page: cp } = pagination;
  return (
    <div className="flex items-center justify-between py-3 mt-2 border-t border-slate-100">
      <span className="text-[11px] text-slate-400 font-medium">
        {Math.min(total, (cp - 1) * limit + 1)}-{Math.min(cp * limit, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button onClick={() => goToPage(cp - 1)} disabled={cp === 1} className="p-1 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50"><ChevronLeft className="w-3.5 h-3.5" /></button>
        <button onClick={() => goToPage(cp + 1)} disabled={cp * limit >= total} className="p-1 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50"><ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Feedback() {
  const { isAdmin } = useAuth();
  const { show } = useToast();
  const [adminView, setAdminView] = useState('summary'); // summary | detail
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ assessmentId: '', content: '', rating: 0 });

  // Data states
  const [summaries, setSummaries] = useState([]);
  const [summaryFilters, setSummaryFilters] = useState({ competencyId: '', dateFrom: '', dateTo: '' });
  const [competencies, setCompetencies] = useState([]);
  const [detailFeedbacks, setDetailFeedbacks] = useState([]);
  const [detailPagination, setDetailPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [myPagination, setMyPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [eligibleAssessments, setEligibleAssessments] = useState([]);

  // Fetch Logic (Simplified)
  useEffect(() => {
    api.get('/competencies').then(r => setCompetencies(r.data.data.competencies));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        if (adminView === 'summary') {
          const { data } = await api.get('/feedback/admin/summary', { params: summaryFilters });
          setSummaries(data.data.summaries);
        } else {
          const { data } = await api.get(`/feedback/admin/by-assessment/${selectedSummary.assessmentId}`, { params: detailPagination });
          setDetailFeedbacks(data.data.feedbacks);
          setDetailPagination(p => ({ ...p, total: data.data.pagination.total }));
        }
      } else {
        const { data } = await api.get('/feedback', { params: myPagination });
        setMyFeedbacks(data.data.feedbacks);
        setMyPagination(p => ({ ...p, total: data.data.pagination.total }));
        api.get('/feedback/eligible-assessments').then(r => setEligibleAssessments(r.data.data.assessments));
      }
    } catch { show('Failed to fetch data', 'error'); }
    setLoading(false);
  }, [isAdmin, adminView, summaryFilters, detailPagination.page, myPagination.page, selectedSummary, show]);

  useEffect(() => { loadData(); }, [loadData]);

  // Employee Layout
  if (!isAdmin) {
    const pending = eligibleAssessments.filter(a => !a.alreadySubmitted);
    return (
      <div className="p-5 max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-slate-800">My Feedback</h1>
          <button onClick={() => setModal(true)} disabled={pending.length === 0} 
            className="h-8 px-3 bg-brand-red text-white rounded-md text-xm font-bold flex items-center gap-1.5 hover:bg-brand-red-dark disabled:opacity-40">
            <Plus className="w-3.5 h-3.5" /> New Feedback
          </button>
        </div>

        {loading ? <div className="animate-pulse space-y-3"><div className="h-20 bg-slate-100 rounded-lg" /></div> : (
          <div className="space-y-2">
            {myFeedbacks.map(f => (
              <div key={f._id} className="p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300">
                <div className="flex justify-between mb-1">
                  <span className="text-xm font-bold text-slate-700">{f.assessmentId?.competencyId?.name}</span>
                  <StarRating value={f.rating} />
                </div>
                <p className="text-xm text-slate-500 mb-2">{new Date(f.createdAt).toLocaleDateString()}</p>
                <div className="text-xm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">{f.content}</div>
              </div>
            ))}
            <Paginator pagination={myPagination} goToPage={p => setMyPagination(prev => ({ ...prev, page: p }))} />
          </div>
        )}

        <Modal open={modal} onClose={() => setModal(false)} title="Submit Feedback">
          <div className="space-y-3">
            <select value={form.assessmentId} onChange={e => setForm(p => ({ ...p, assessmentId: e.target.value }))} className="w-full h-9 rounded border-slate-200 text-xm">
              <option value="">Select Assessment...</option>
              {pending.map(a => <option key={a._id} value={a._id}>{a.competencyId?.name}</option>)}
            </select>
            <StarRating value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} size="md" />
            <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={4} className="w-full rounded border-slate-200 text-xm p-2" placeholder="Your feedback..." />
            <button onClick={() => { /* handle submit */ }} className="w-full py-2 bg-brand-red text-white rounded font-bold text-xm">Submit</button>
          </div>
        </Modal>
      </div>
    );
  }

  // Admin Layout
  return (
    <div className="p-5 max-w-6xl mx-auto">
      {adminView === 'summary' ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-display font-bold text-brand-black">Feedback Overview</h1>
            <button onClick={loadData} className="p-1.5 text-slate-400 hover:text-slate-600"><RefreshCw className="w-4 h-4" /></button>
          </div>

          {/* Compact Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-2 border border-slate-200 rounded-lg mb-6 shadow-sm text-xm">
            <div className="flex items-center gap-1.5 px-2 border-r border-slate-100 mr-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-bold text-slate-500 uppercase tracking-tight">Filters</span>
            </div>
            <select value={summaryFilters.competencyId} onChange={e => setSummaryFilters(p => ({ ...p, competencyId: e.target.value }))} className="h-8 rounded border-slate-200 text-xm bg-slate-50">
              <option value="">All Competencies</option>
              {competencies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <input type="date" value={summaryFilters.dateFrom} onChange={e => setSummaryFilters(p => ({ ...p, dateFrom: e.target.value }))} className="h-8 rounded border-slate-200 text-xm bg-slate-50" />
              <span className="text-slate-300">-</span>
              <input type="date" value={summaryFilters.dateTo} onChange={e => setSummaryFilters(p => ({ ...p, dateTo: e.target.value }))} className="h-8 rounded border-slate-200 text-xm bg-slate-50" />
            </div>
            {(summaryFilters.competencyId || summaryFilters.dateFrom) && (
              <button onClick={() => setSummaryFilters({ competencyId: '', dateFrom: '', dateTo: '' })} className="flex items-center gap-1 text-slate-400 hover:text-brand-red ml-2 font-bold uppercase text-[10px]">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {summaries.map(s => (
              <div key={s.assessmentId} onClick={() => { setSelectedSummary(s); setAdminView('detail'); }}
                className="group bg-white border border-slate-200 rounded-lg p-3 hover:border-brand-red/30 hover:shadow-md transition-all cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-black text-brand-red bg-brand-red/5 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                    {s.targetGroup?.split('-')[0] || 'Gen'}
                  </span>
                  <div className="flex items-center gap-1 text-xm font-bold text-slate-700">
                    <Star className="w-3 h-3 text-amber-500" fill="currentColor" /> {s.avgRating?.toFixed(1) || '0.0'}
                  </div>
                </div>
                <h3 className="text-xm font-bold text-slate-800 line-clamp-2 mb-3 h-8 leading-tight">{s.competencyName}</h3>
                
                <div className="space-y-1 mb-3">
                  {[5, 4, 3, 2, 1].map(n => (
                    <RatingBar key={n} label={n} count={s[`rating${n}`] || 0} pct={s.ratedCount > 0 ? ((s[`rating${n}`] || 0) / s.ratedCount) * 100 : 0} />
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                   <span>{s.totalFeedbacks} Reviews</span>
                   <Eye className="w-3 h-3 text-slate-300 group-hover:text-brand-red transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Detail View - Denser List */
        <div>
          <button onClick={() => setAdminView('summary')} className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 mb-4 tracking-widest">
            <ArrowLeft className="w-3 h-3" /> Back to Overview
          </button>
          
          <div className="flex items-end justify-between border-b border-slate-200 pb-4 mb-4">
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-none">{selectedSummary.competencyName}</h1>
              <p className="text-xm text-slate-500 mt-1 uppercase tracking-tighter font-bold">{selectedSummary.targetGroup}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-slate-800 leading-none">{selectedSummary.avgRating?.toFixed(1)}</span>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Avg Score</p>
            </div>
          </div>

          <div className="max-w-2xl space-y-2">
            {detailFeedbacks.map(f => (
              <div key={f._id} className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{f.userId?.name?.charAt(0)}</div>
                    <span className="text-xm font-bold text-slate-700">{f.userId?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating value={f.rating} />
                    <span className="text-[10px] text-slate-300 font-medium">{new Date(f.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <p className="text-xm text-slate-600 leading-relaxed italic border-l-2 border-slate-100 pl-3">"{f.content}"</p>
              </div>
            ))}
            <Paginator pagination={detailPagination} goToPage={p => setDetailPagination(prev => ({ ...prev, page: p }))} />
          </div>
        </div>
      )}
    </div>
  );
}