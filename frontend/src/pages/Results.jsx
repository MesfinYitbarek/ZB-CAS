import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { TrendingUp, Target, CheckCircle2, Download, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { exportToPDF, exportToExcel, generateFilename } from '../utils/exportUtils';
import api from '../utils/api';

export default function Results() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const [results, setResults] = useState([]);
  const [pdp, setPdp] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('results');
  const [exporting, setExporting] = useState(false);
  
  // Pagination state for results
  const [resultsPagination, setResultsPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    const load = async () => {
      try {
        if (isAdmin) {
          const { data } = await api.get('/results', {
            params: { page: resultsPagination.page, limit: resultsPagination.limit }
          });
          setResults(data.data.results);
          
          // Update pagination from API response
          if (data.data.pagination) {
            setResultsPagination(prev => ({
              ...prev,
              total: data.data.pagination.total,
              totalPages: Math.ceil(data.data.pagination.total / resultsPagination.limit)
            }));
          }
        } else {
          const { data } = await api.get(`/results/user/${user._id}`);
          setResults(data.data.results);
          const pdpRes = await api.get(`/results/pdp/${user._id}`);
          setPdp(pdpRes.data.data.pdp);
        }
      } catch (_) {
        show('Failed to load results.', 'error');
      }
      setLoading(false);
    };
    load();
  }, [isAdmin, user, resultsPagination.page, resultsPagination.limit]);

  const finalise = async (id) => {
    try {
      await api.patch(`/results/${id}/finalise`);
      show('Result finalised.', 'success');
      setResults((prev) => prev.map((r) => (r._id === id ? { ...r, status: 'FINAL' } : r)));
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const exportData = {
        type: 'results',
        user: user,
        results: results.map(r => ({
          ...r,
          competencyName: r.competencyId?.name,
        })),
      };
      
      await exportToPDF(exportData, generateFilename(`results_${user.name}`, 'pdf'));
      show('Results exported to PDF successfully!', 'success');
    } catch (err) {
      console.error('PDF Export Error:', err);
      show('PDF export failed: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const exportData = {
        type: 'results',
        user: user,
        results: results.map(r => ({
          ...r,
          competencyName: r.competencyId?.name,
        })),
      };
      
      await exportToExcel(exportData, generateFilename(`results_${user.name}`, 'xlsx'));
      show('Results exported to Excel successfully!', 'success');
    } catch (err) {
      console.error('Excel Export Error:', err);
      show('Excel export failed: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Pagination handlers
  const goToPage = (page) => {
    if (page >= 1 && page <= resultsPagination.totalPages) {
      setResultsPagination(prev => ({ ...prev, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setResultsPagination({
      page: 1,
      limit: newLimit,
      total: resultsPagination.total,
      totalPages: Math.ceil(resultsPagination.total / newLimit)
    });
  };

  if (loading)
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Results</h1>
          <p className="text-gray-500 mt-1">{isAdmin ? 'All employee assessment results.' : 'Your assessment results & development plan.'}</p>
        </div>
        {!isAdmin && results.length > 0 && (
          <div className="flex gap-2">
            <button 
              onClick={handleExportPDF} 
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 border border-brand-red text-brand-red rounded-lg font-semibold hover:bg-brand-red-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4" /> {exporting ? 'Exporting...' : 'PDF'}
            </button>
            <button 
              onClick={handleExportExcel} 
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> {exporting ? 'Exporting...' : 'Excel'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs (non-admin) */}
      {!isAdmin && (
        <div className="flex gap-2 mb-6">
          {[
            ['results', 'My Results', TrendingUp],
            ['pdp', 'Personal Development Plan', Target],
          ].map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all ${
                tab === key ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      )}

      {/* Results Table */}
      {(isAdmin || tab === 'results') && (
        <>
          {/* Pagination controls for admin */}
          {isAdmin && results.length > 0 && (
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-600">
                Showing {(resultsPagination.page - 1) * resultsPagination.limit + 1} to{' '}
                {Math.min(resultsPagination.page * resultsPagination.limit, resultsPagination.total)} of{' '}
                {resultsPagination.total} results
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Show:</span>
                <select 
                  value={resultsPagination.limit} 
                  onChange={handlePageSizeChange}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
                >
                  <option value="10">10 per page</option>
                  <option value="20">20 per page</option>
                  <option value="30">30 per page</option>
                  <option value="50">50 per page</option>
                </select>
              </div>
            </div>
          )}
          
          <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {isAdmin && <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>}
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Competency</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Assessment</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Score</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Level</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    {isAdmin && <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="px-6 py-8 text-center text-gray-400">
                        No results yet.
                      </td>
                    </tr>
                  )}
                  {results.map((r) => (
                    <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                      {isAdmin && (
                        <td className="px-6 py-3">
                          <div className="font-semibold text-sm text-brand-black-soft">{r.userId?.name || '—'}</div>
                          <div className="text-xs text-gray-400">{r.userId?.department}</div>
                        </td>
                      )}
                      <td className="px-6 py-3 font-semibold text-sm text-gray-700">{r.competencyId?.name || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-500">{r.assessmentId?.description || '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-20">
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${r.finalScore}%` }} />
                            </div>
                          </div>
                          <span className="text-sm font-bold text-brand-red">{r.finalScore}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge badge-${r.level.toLowerCase()}`}>{r.level}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-3">
                          {r.status === 'PENDING' && (
                            <button onClick={() => finalise(r._id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors">
                              <CheckCircle2 className="w-3 h-3" /> Finalise
                            </button>
                          )}
                          {r.status === 'FINAL' && (
                            <span className="text-xs text-gray-400">Finalized</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls for Admin */}
          {isAdmin && resultsPagination.total > resultsPagination.limit && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Page {resultsPagination.page} of {resultsPagination.totalPages}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(resultsPagination.page - 1)}
                  disabled={resultsPagination.page === 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    
                    if (resultsPagination.totalPages <= maxVisible) {
                      for (let i = 1; i <= resultsPagination.totalPages; i++) {
                        pages.push(i);
                      }
                    } else {
                      let start = Math.max(1, resultsPagination.page - Math.floor(maxVisible / 2));
                      let end = Math.min(resultsPagination.totalPages, start + maxVisible - 1);
                      
                      if (end - start + 1 < maxVisible) {
                        start = Math.max(1, end - maxVisible + 1);
                      }
                      
                      for (let i = start; i <= end; i++) {
                        pages.push(i);
                      }
                    }
                    
                    return pages.map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium ${
                          resultsPagination.page === pageNum
                            ? 'bg-brand-red text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ));
                  })()}
                </div>
                
                <button
                  onClick={() => goToPage(resultsPagination.page + 1)}
                  disabled={resultsPagination.page === resultsPagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* PDP Tab */}
      {!isAdmin && tab === 'pdp' && (
        <div className="space-y-4">
          {pdp.length === 0 && (
            <div className="text-center py-16">
              <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-600 mb-1">No PDP data yet</h3>
              <p className="text-gray-400 text-sm">Complete assessments to generate your development plan.</p>
            </div>
          )}
          {pdp.map((p, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-brand-black">{p.competencyId?.name || '—'}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-brand-red">{p.finalScore}%</span>
                  <span className={`badge badge-${p.level.toLowerCase()}`}>{p.level}</span>
                </div>
              </div>
              <div className="progress-bar mb-4">
                <div className="progress-fill" style={{ width: `${p.finalScore}%` }} />
              </div>
              {p.recommendation && (
                <div className="bg-brand-red-muted rounded-lg p-4 border-l-4 border-brand-red">
                  <div className="text-xs font-bold text-brand-red uppercase tracking-wider mb-1.5">Recommendation</div>
                  <p className="text-sm text-brand-black-soft leading-relaxed">{p.recommendation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}