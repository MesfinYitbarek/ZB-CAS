import { ChevronLeft, ChevronRight, Download, BarChart3 } from 'lucide-react';

export const LEVEL_COLORS = {
  Basic: '#9CA3AF',
  Intermediate: '#4B5563',
  Advanced: '#111827',
  Expert: '#C8102E',
};

export const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

// ─── Card ─────────────────────────────────────────────────────────────────────
export const Card = ({ title, icon: Icon, subtitle, action, children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-100 shadow-card ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5 gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div className="w-7 h-7 rounded-lg bg-brand-red/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-3.5 h-3.5 text-brand-red" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800 text-[13px] truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-gray-400 truncate">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
    )}
    <div className="px-4 pb-3.5">{children}</div>
  </div>
);

export const SectionHeader = ({ title, count, action }) => (
  <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
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
  s >= 80 ? '#C8102E' : s >= 60 ? '#111827' : s >= 40 ? '#6B7280' : '#9CA3AF';

export const ScoreBar = ({ score }) => {
  const s = Number(score) || 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 bg-gray-100 rounded-full h-1">
        <div className="h-1 rounded-full" style={{ width: `${s}%`, background: scoreColor(s) }} />
      </div>
      <span className="text-[11px] font-bold text-gray-800 w-9 text-right">{s.toFixed(1)}%</span>
    </div>
  );
};

export const ScoreBadge = ({ score }) => {
  const s = Number(score) || 0;
  const cls = s >= 80 ? 'bg-gray-100 text-gray-700 ring-gray-300'
    : s >= 60 ? 'bg-gray-100 text-gray-700 ring-gray-300'
    : s >= 40 ? 'bg-gray-100 text-gray-700 ring-gray-300'
    : 'bg-red-50 text-red-600 ring-red-200';
  return <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-bold ring-1 ${cls}`}>{s.toFixed(1)}%</span>;
};

export const LevelBadge = ({ level }) => {
  const cls = {
    Expert: 'bg-gray-100 text-gray-700 border-gray-300',
    Advanced: 'bg-gray-100 text-gray-700 border-gray-300',
    Intermediate: 'bg-gray-100 text-gray-700 border-gray-300',
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
  <div className="bg-white rounded-xl border border-gray-100 shadow-card overflow-hidden">
    {header}
    <div className="overflow-x-auto scrollbar-none">{children}</div>
    {footer}
  </div>
);

export const Th = ({ children, className = '' }) => (
  <th className={`text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50 ${className}`}>
    {children}
  </th>
);

export const Td = ({ children, className = '' }) => (
  <td className={`px-3 py-2 ${className}`}>{children}</td>
);

export const EmployeeCell = ({ name, department, position }) => (
  <div className="flex items-center gap-2 min-w-0">
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center flex-shrink-0">
      <span className="text-[11px] font-bold text-white">{name?.charAt(0) || '?'}</span>
    </div>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-800 whitespace-nowrap truncate">{name || '—'}</p>
      {position && <p className="text-[10px] text-gray-400 truncate">{position}</p>}
    </div>
    {department && <span className="text-xs text-gray-500 whitespace-nowrap hidden lg:inline">· {department}</span>}
  </div>
);

// ─── Paginator ────────────────────────────────────────────────────────────────
export const Paginator = ({ pagination, onPage }) => {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages, cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  const from = (cp - 1) * pagination.limit + 1;
  const to = Math.min(cp * pagination.limit, pagination.total);
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-2 px-4 py-2 border-t border-gray-100 bg-white">
      <p className="text-sm text-gray-500">Showing {from} to {to} of {pagination.total}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(cp - 1)} disabled={cp === 1} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        {pages.map(p => (
          <button key={p} onClick={() => onPage(p)}
            className={`w-9 h-9 rounded-lg text-sm font-medium ${cp === p ? 'bg-brand-red text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPage(cp + 1)} disabled={cp === tp} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString() : '—';

// ─── KPI & empty states ───────────────────────────────────────────────────────
export const StatCard = ({ label, value, sub, accent = false }) => (
  <div className={`bg-white rounded-lg border shadow-card px-3 py-2 ${accent ? 'border-brand-red/40 bg-brand-red/[0.04]' : 'border-gray-100'}`}>
    <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    <p className={`text-base font-bold mt-0.5 truncate ${accent ? 'text-brand-red' : 'text-brand-black'}`}>{value}</p>
    {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
  </div>
);

export const EmptyState = ({ icon: Icon = BarChart3, title = 'No data', hint }) => (
  <div className="flex flex-col items-center justify-center py-6 text-center">
    <Icon className="w-7 h-7 text-gray-300 mb-1.5" aria-hidden />
    <p className="text-[13px] font-medium text-gray-500">{title}</p>
    {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
  </div>
);

// ─── CSV export ───────────────────────────────────────────────────────────────
export const exportCsv = ({ headers, rows, filename }) => {
  const escapeCell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map(r => r.map(escapeCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const ExportCsvButton = ({ headers, rows, filename }) => (
  <button
    type="button"
    onClick={() => exportCsv({ headers, rows, filename })}
    disabled={rows.length === 0}
    className="flex items-center gap-1.5 px-2.5 py-1 border border-gray-300 bg-white rounded-lg text-[13px] font-semibold text-brand-black hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <Download className="w-3.5 h-3.5 text-gray-600" />Export CSV
  </button>
);
