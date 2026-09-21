import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Users, Search, X, ChevronRight } from 'lucide-react';
import Pagination from '../components/Pagination';
import api from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';

const PAGE_SIZE = 10;

const avatar = (name = '') =>
  name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

export default function MyTeam() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: members = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.users.team(user?._id),
    queryFn: async () => {
      const r = await api.get(`/users/supervisor/${user._id}/employees`);
      return Array.isArray(r?.data?.data?.employees) ? r.data.data.employees : [];
    },
    enabled: !!user?._id,
    onError: () => show('Failed to load team.', 'error'),
  });

  const filtered = members.filter(m =>
    !search ||
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.position?.toLowerCase().includes(search.toLowerCase()) ||
    m.department?.toLowerCase().includes(search.toLowerCase()) ||
    m.employeeId?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
          <h1 className="text-xl  font-bold text-brand-black">My Team</h1>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, position…"
            className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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
              <button onClick={() => { setSearch(''); setPage(1); }} className="mt-3 text-sm text-brand-red font-semibold hover:underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-none">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Position</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map(m => (
                    <tr key={m._id} onClick={() => nav(`/users/${m._id}`)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {avatar(m.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-gray-900 truncate">{m.name}</p>
                            <p className="text-[11px] text-gray-400 font-mono truncate">{m.employeeId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-gray-600">{m.position || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-gray-600">{m.department || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-gray-600">{m.email}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.status === 'ACTIVE' ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end">
                          <button type="button" onClick={() => nav(`/users/${m._id}`)} title="View profile"
                            className="flex items-center gap-0.5 text-[11px] font-semibold text-brand-red hover:underline transition-colors">
                            View <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
