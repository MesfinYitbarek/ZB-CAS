import { Eye, Medal, AlertTriangle } from 'lucide-react';
import { ScoreBadge } from './ui';

export default function PerformerTable({ title, data = [], type = 'top', onDetail }) {
  const isTop = type === 'top';
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isTop ? 'bg-gray-200' : 'bg-red-100'}`}>
          {isTop ? <Medal className="w-4 h-4 text-gray-700" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400">Top {data.length} by average score</p>
        </div>
      </div>
      <div className="grid grid-cols-[24px_1fr_60px_72px_36px] gap-3 px-5 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">#</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Reports</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Avg Score</span>
        <span />
      </div>
      <div className="divide-y divide-gray-100">
        {data.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data available</p>
        ) : data.map((row, i) => (
          <div key={i} className="grid grid-cols-[24px_1fr_60px_72px_36px] gap-3 px-5 py-2.5 items-center hover:bg-gray-50 transition-colors group">
            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center
              ${isTop ? 'bg-gray-200 text-gray-700' : 'bg-red-100 text-red-600'}`}>{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{row.name || '—'}</p>
              {row.department && <p className="text-[11px] text-gray-400 truncate">{row.department}</p>}
            </div>
            <span className="text-sm text-gray-600 font-medium text-center">{row.count ?? '—'}</span>
            <div className="flex justify-end"><ScoreBadge score={row.avgScore} /></div>
            <button onClick={() => onDetail?.(row)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors"
              title="View details">
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
