import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Users, Mail, Briefcase, Search, X, ChevronRight } from 'lucide-react';
import api from '../utils/api';

const avatar = (name = '') =>
  name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const DEPT_COLORS = [
  'from-red-500 to-red-700',
  // 'from-violet-500 to-violet-700',
  // 'from-blue-500 to-blue-700',
  // 'from-emerald-500 to-emerald-700',
  // 'from-amber-500 to-amber-700',
  // 'from-cyan-500 to-cyan-700',
];

export default function MyTeam() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user?._id) return;
    api.get(`/users/supervisor/${user._id}/employees`)
      .then(r => setMembers(Array.isArray(r?.data?.data?.employees) ? r.data.data.employees : []))
      .catch(() => show('Failed to load team.', 'error'))
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = members.filter(m =>
    !search ||
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.position?.toLowerCase().includes(search.toLowerCase()) ||
    m.department?.toLowerCase().includes(search.toLowerCase()) ||
    m.employeeId?.toLowerCase().includes(search.toLowerCase())
  );

  // Stable colour per member based on index
  const colorFor = (idx) => DEPT_COLORS[idx % DEPT_COLORS.length];

  if (loading) return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
      <div className="w-8 h-8 border-[3px] border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col  overflow-hidden">

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0  px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">My Team</h1>
          <p className="text-sm text-gray-400 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, position…"
            className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Users className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-base font-medium text-gray-400">
              {members.length === 0 ? 'No team members yet' : 'No results for that search'}
            </p>
            {search && (
              <button onClick={() => setSearch('')} className="mt-3 text-sm text-brand-red font-semibold hover:underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((m, idx) => (
              <button
                key={m._id}
                onClick={() => nav(`/users/${m._id}`)}
                className="group bg-white rounded-xl border border-gray-100 hover:border-red-200 hover:shadow-md transition-all text-left overflow-hidden"
              >
                {/* Colour bar */}
                <div className={`h-1.5 bg-gradient-to-r ${colorFor(idx)}`} />

                <div className="p-4">
                  {/* Avatar + name */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colorFor(idx)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                      {avatar(m.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand-red transition-colors">
                        {m.name}
                      </p>
                      <p className="text-xs text-gray-400 font-mono truncate">{m.employeeId}</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="w-3 h-3 text-gray-300 flex-shrink-0" />
                      <span className="truncate">{m.position || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-gray-300 flex-shrink-0" />
                      <span className="truncate">{m.email}</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.status === 'ACTIVE' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {m.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red transition-colors" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
