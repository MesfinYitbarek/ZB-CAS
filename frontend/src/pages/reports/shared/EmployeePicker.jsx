import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useReportEmployees } from '../../../hooks/queries';

export default function EmployeePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (!open) { setDebouncedQ(''); return; }
    const t = setTimeout(() => setDebouncedQ(query), 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const { data, isFetching } = useReportEmployees(debouncedQ, { enabled: open && !!debouncedQ });
  const results = data?.employees || [];
  const searching = open && !!q.trim() && (debouncedQ !== q.trim() || isFetching);

  const clear = () => { onChange(null); setQ(''); };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-gray-800">Select Employee</h3>
          <p className="text-[11px] text-gray-400">Search by name to view an employee's reports</p>
        </div>
        {value && (
          <button type="button" onClick={clear} className="text-xs font-semibold text-gray-500 hover:text-brand-red">Clear</button>
        )}
      </div>

      <div className="relative" ref={ref}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={value && !open ? `${value.name}${value.department ? ` · ${value.department}` : ''}` : q}
          readOnly={!!value}
          onChange={e => setQ(e.target.value)}
          onFocus={() => { if (!value) setOpen(true); }}
          placeholder="Search employee by name…"
          className="w-full pl-9 pr-8 h-9 border border-gray-300 rounded-lg text-sm focus-brand bg-white"
        />
        {(value || q) ? (
          <button type="button" onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-brand-red">
            <X className="w-4 h-4" />
          </button>
        ) : searching ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        ) : null}

        {open && !value && (
          <div className="absolute top-10 left-0 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="max-h-60 overflow-y-auto py-1">
              {searching && q.trim() && (
                <p className="px-4 py-3 text-xs text-gray-400">Searching…</p>
              )}
              {!searching && results.length > 0 && results.map(emp => (
                <button key={emp._id} type="button"
                  onClick={() => { onChange(emp); setOpen(false); setQ(''); }}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm text-left">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs">
                    {(emp.name || '?').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{emp.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {[emp.department, emp.position].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </button>
              ))}
              {!searching && q.trim() && results.length === 0 && (
                <p className="text-xs text-gray-400 px-4 py-3">No employees found.</p>
              )}
              {!searching && !q.trim() && (
                <p className="text-xs text-gray-400 px-4 py-3">Start typing a name to search.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}