import { useEffect, useRef } from 'react';
import {
  X, Target, ClipboardList, Calendar,
} from 'lucide-react';
import { ScoreBadge, LevelBadge, LEVEL_COLORS } from './ui';

export default function ReportDetailModal({ report, onClose }) {
  const overlayRef = useRef(null);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!report) return null;

  const { user, assessment, competencyResults = [], overallScore, overallLevel, generatedAt, status } = report;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-red/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-brand-red">{user?.name?.charAt(0) || '?'}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{user?.name || '—'}</h2>
              <p className="text-xs text-gray-400">
                {[user?.department, user?.position, user?.employeeId ? `#${user.employeeId}` : null]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-xs text-gray-400 mb-1">Overall Score</p>
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl  font-bold text-brand-black leading-none">{overallScore ?? '—'}%</span>
                  <LevelBadge level={overallLevel} />
                </div>
              </div>
              <div className="hidden sm:block h-10 w-px bg-gray-200" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 flex-1">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Type</p>
                  <p className="text-xs font-semibold text-gray-700">{assessment?.type || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Purpose</p>
                  <p className="text-xs font-semibold text-gray-700">{assessment?.purpose || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Target Group</p>
                  <p className="text-xs font-semibold text-gray-700 capitalize">{assessment?.targetGroup || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Generated</p>
                  <p className="text-xs font-semibold text-gray-700">
                    {generatedAt ? new Date(generatedAt).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {assessment?.description && (
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-100/40">
              <p className="text-xs text-gray-700 italic">&quot;{assessment.description}&quot;</p>
            </div>
          )}

          <div className="px-6 py-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-brand-red" />
              Competency Results
              <span className="text-xs font-normal text-gray-400">({competencyResults.length})</span>
            </h3>

            <div className="space-y-3">
              {competencyResults.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No competency results found.</p>
              ) : competencyResults.map((cr, i) => (
                <div key={cr._id || i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{cr.competencyName}</p>
                      {cr.category && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
                          {cr.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <ScoreBadge score={cr.finalScore} />
                      <LevelBadge level={cr.level} />
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${cr.finalScore || 0}%`, background: LEVEL_COLORS[cr.level] || '#94a3b8' }}
                      />
                    </div>
                  </div>

                  {cr.scoreDetails && (
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-2 flex-wrap">
                      {cr.scoreDetails.selfScore > 0 && (
                        <span>Self: <strong className="text-gray-700">{cr.scoreDetails.selfScore}%</strong></span>
                      )}
                      {cr.scoreDetails.supervisorScore > 0 && (
                        <span>Supervisor: <strong className="text-gray-700">{cr.scoreDetails.supervisorScore}%</strong></span>
                      )}
                      {cr.scoreDetails.calculation && (
                        <span className="text-gray-400 italic">{cr.scoreDetails.calculation}</span>
                      )}
                    </div>
                  )}

                  {cr.recommendation && (
                    <div className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <ClipboardList className="w-3.5 h-3.5 text-brand-red mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-600">{cr.recommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {(assessment?.startDate || assessment?.endDate || status) && (
            <div className="px-6 pb-5 flex items-center gap-4 text-xs text-gray-400 border-t border-gray-100 pt-4">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              {assessment?.startDate && <span>Start: {new Date(assessment.startDate).toLocaleDateString()}</span>}
              {assessment?.endDate && <span>End: {new Date(assessment.endDate).toLocaleDateString()}</span>}
              {status && (
                <span className={`ml-auto px-2.5 py-0.5 rounded-full font-semibold text-[10px]
                  ${status === 'COMPLETE' ? 'bg-brand-black text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {status}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button onClick={onClose}
            className="px-5 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-brand-black hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
