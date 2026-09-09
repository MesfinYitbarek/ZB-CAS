import { useRef, useState, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Card } from './ui';

export default function EmployeePicker({ user, employees, value, onChange, onReset, onSelect }) {
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const matches = employees.filter(e => {
    const query = q.toLowerCase();
    return (e.name || '').toLowerCase().includes(query)
      || (e.department || '').toLowerCase().includes(query)
      || (e.employeeId || '').toLowerCase().includes(query)
      || (e.email || '').toLowerCase().includes(query);
  });

  const pick = (emp) => {
    onChange(emp);
    setShow(false);
    setQ('');
    onSelect?.(emp);
  };

  return (
    <Card
      title="Select Employee"
      subtitle={value ? 'Showing reports for the selected employee' : 'Individual reporting and history'}
      action={value && (
        <button type="button" onClick={() => { onChange(null); onSelect?.(null); }}
          className="text-xs font-semibold text-gray-700 hover:text-gray-900">Clear</button>
      )}
      bodyClassName="pt-2"
    >
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setShow(v => !v)}
          className="w-full flex items-center justify-between h-10 px-4 border border-gray-300 rounded-lg text-sm hover:border-brand-red/50 transition-colors bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-full bg-brand-red/10 flex items-center justify-center text-brand-red font-bold text-xs flex-shrink-0">
              {value ? (value.name?.charAt(0) || '?') : user.name?.charAt(0) || '?'}
            </div>
            <span className="font-medium text-gray-800 truncate">
              {value ? `${value.name} — ${value.department}` : `My Reports (${user.name})`}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </button>

        {show && (
          <div className="absolute top-12 left-0 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, ID, department..." autoFocus
                  className="w-full pl-10 pr-3 h-10 border border-gray-300 rounded-lg text-sm focus-brand" />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              <button type="button" onClick={() => pick(null)}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm text-left">
                <div className="w-7 h-7 rounded-full bg-brand-red/10 flex items-center justify-center text-brand-red font-bold text-xs">{user.name?.charAt(0)}</div>
                <span>My Reports ({user.name})</span>
              </button>
              {matches.map(emp => (
                <button type="button" key={emp._id} onClick={() => pick(emp)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm text-left">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs">{(emp.name || '?').charAt(0)}</div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{emp.name}</p>
                    <p className="text-xs text-gray-400 truncate">{emp.department} · {emp.employeeId || emp.email}</p>
                  </div>
                </button>
              ))}
              {matches.length === 0 && <p className="text-xs text-gray-400 px-4 py-3">No employees found</p>}
            </div>
          </div>
        )}
      </div>

      {value && (
        <div className="mt-3 flex items-center justify-between bg-gray-100 rounded-lg px-4 py-2.5">
          <div className="text-sm text-gray-700 font-medium">
            Viewing: {value.name} · {value.department}
            {value.position && ` · ${value.position}`}
          </div>
        </div>
      )}
    </Card>
  );
}