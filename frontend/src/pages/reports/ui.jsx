import { ChevronLeft, ChevronRight } from 'lucide-react';

export const LEVEL_COLORS = {
  Basic: '#F59E0B',
  Intermediate: '#EA580C',
  Advanced: '#2563EB',
  Expert: '#16A34A',
};

export const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

// ─── Card ─────────────────────────────────────────────────────────────────────
export const Card = ({ title, icon: Icon, subtitle, action, children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-100 shadow-sm ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between px-5 pt-5 pb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <div className="w-8 h-8 rounded-lg bg-brand-red/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-brand-red" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800 text-sm truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
    )}
    <div className="px-5 pb-5">{children}</div>
  </div>
);

export const SectionHeader = ({ title, count, action }) => (
  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
    <p className="text-sm font-semibold text-gray-700">
      {typeof count === 'number' && (
        <>
          <span className="text-brand-red font-bold">{count}</span>{' '}
          report{count !== 1 ? 's' : ''}
        </>
      )}
      {count === undefined && title}
    </p>
    {action}
  </div>
);

// ─── Score widgets ────────────────────────────────────────────────────────────
export const scoreColor = (s) =>
  s >= 80 ? '#16A34A' : s >= 60 ? '#2563EB' : s >= 40 ? '#F59E0B' : '#ef4444';

export const ScoreBar = ({ score }) => {
  const s = Number(score) || 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${s}%`, background: scoreColor(s) }} />
      </div>
      <span className="text-xs font-bold text-gray-800 w-10 text-right">{s.toFixed(1)}%</span>
    </div>
  );
};

export const ScoreBadge = ({ score }) => {
  const s = Number(score) || 0;
  const cls = s >= 80 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : s >= 60 ? 'bg-blue-50 text-blue-700 ring-blue-200'
    : s >= 40 ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-red-50 text-red-600 ring-red-200';
  return <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-bold ring-1 ${cls}`}>{s.toFixed(1)}%</span>;
};

export const LevelBadge = ({ level }) => {
  const cls = {
    Expert: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Advanced: 'bg-blue-50 text-blue-700 border-blue-200',
    Intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
    Basic: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls[level] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {level || '—'}
    </span>
  );
};

// ─── Table shell ──────────────────────────────────────────────────────────────
export const TableShell = ({ header, children, footer }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
    {header}
    <div className="overflow-x-auto">{children}</div>
    {footer}
  </div>
);

export const Th = ({ children, className = '' }) => (
  <th className={`text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${className}`}>
    {children}
  </th>
);

export const Td = ({ children, className = '' }) => (
  <td className={`px-4 py-3 ${className}`}>{children}</td>
);

export const EmployeeCell = ({ name, department, position }) => (
  <div className="flex items-center gap-2.5 min-w-0">
    <div className="w-7 h-7 bg-brand-red/10 rounded-lg flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-brand-red">{name?.charAt(0) || '?'}</span>
    </div>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-800 whitespace-nowrap truncate">{name || '—'}</p>
      {position && <p className="text-[11px] text-gray-400 truncate">{position}</p>}
    </div>
    {department && <span className="text-xs text-gray-500 whitespace-nowrap hidden lg:inline">· {department}</span>}
  </div>
);

// ─── Paginator (compact) ──────────────────────────────────────────────────────
export const Paginator = ({ pagination, onPage }) => {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages, cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  return (
    <div className="flex justify-between items-center px-5 pb-4 pt-4 border-t border-gray-100">
      <p className="text-sm text-gray-500">Page {cp} of {tp} · {pagination.total} total</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(cp - 1)} disabled={cp === 1} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map(p => (
          <button key={p} onClick={() => onPage(p)}
            className={`w-9 h-9 rounded-lg text-sm font-medium ${cp === p ? 'bg-brand-red text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPage(cp + 1)} disabled={cp === tp} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString() : '—';
