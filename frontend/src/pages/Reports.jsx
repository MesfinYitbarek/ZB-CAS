import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Download,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Filter,
  X,
  User as UserIcon,
  ChevronDown,
  Search,
  Loader2,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import api from '../utils/api';

const LEVEL_COLORS = {
  Basic: '#F59E0B',
  Intermediate: '#EA580C',
  Advanced: '#2563EB',
  Expert: '#16A34A',
};

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

export default function Reports() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const [tab, setTab] = useState(isAdmin ? 'department' : 'individual');

  // Data states
  const [individual, setIndividual] = useState([]);
  const [deptSummary, setDeptSummary] = useState([]);
  const [heatmap, setHeatmap] = useState({});
  const [departments, setDepartments] = useState([]);
  const [selDept, setSelDept] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Employee list for individual report selection (admin/supervisor)
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const employeeDropdownRef = useRef(null);

  // Filter states
  const [filters, setFilters] = useState({
    department: '',
    level: '',
    dateFrom: '',
    dateTo: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  // ─── Close dropdowns on outside click ────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target)) {
        setShowEmployeeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Fetch employees for the selector ────────────────────────────────────
  useEffect(() => {
    if (isAdmin || user.role === 'SUPERVISOR') {
      api
        .get('/reports/employees')
        .then(({ data }) => setEmployees(data.data.employees))
        .catch(() => {});
    }
  }, [isAdmin, user.role]);

  // ─── Fetch individual reports ────────────────────────────────────────────
  const fetchIndividual = useCallback(async () => {
    try {
      const targetUserId = selectedEmployee?._id || user._id;
      const indRes = await api.get(`/reports/individual/${targetUserId}`, {
        params: { page: pagination.page, limit: pagination.limit },
      });

      if (indRes.data.data.reports) {
        setIndividual(indRes.data.data.reports);
        if (indRes.data.data.pagination) {
          setPagination((prev) => ({
            ...prev,
            total: indRes.data.data.pagination.total,
            totalPages: Math.ceil(indRes.data.data.pagination.total / pagination.limit),
          }));
        }
      } else {
        setIndividual([]);
      }
    } catch (_) {
      show('Failed to load individual reports.', 'error');
      setIndividual([]);
    }
  }, [user._id, selectedEmployee, pagination.page, pagination.limit, show]);

  // ─── Main data loader ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (!isAdmin || tab === 'individual') {
          await fetchIndividual();
        }
        if (isAdmin) {
          const hmRes = await api.get('/reports/heatmap');
          setHeatmap(hmRes.data.data.heatmap);
          const depts = new Set();
          Object.values(hmRes.data.data.heatmap).forEach((arr) =>
            arr.forEach((d) => depts.add(d.department)),
          );
          setDepartments([...depts]);
        }
      } catch (_) {
        show('Failed to load reports.', 'error');
      }
      setLoading(false);
    };
    load();
  }, [isAdmin, user, tab, pagination.page, pagination.limit, fetchIndividual, show]);

  // ─── Department summary loader ──────────────────────────────────────────
  useEffect(() => {
    if (isAdmin && selDept && tab === 'department') {
      api
        .get(`/reports/department/${selDept}`)
        .then(({ data }) => setDeptSummary(data.data.summary))
        .catch(() => {});
    }
  }, [selDept, isAdmin, tab]);

  // ─── Export helpers ─────────────────────────────────────────────────────
  const buildExportParams = () => {
    const params = {};
    if (filters.department) params.department = filters.department;
    if (filters.level)      params.level      = filters.level;
    if (filters.dateFrom)   params.dateFrom   = filters.dateFrom;
    if (filters.dateTo)     params.dateTo     = filters.dateTo;
    return params;
  };

  const handleExport = async (format) => {
    setExporting(true);
    setShowExportMenu(false);
    try {
      let url;
      let filename;

      if (format === 'json') {
        // Legacy JSON export
        const targetId = selectedEmployee?._id || user._id;
        const res = await api.get(`/reports/export/${targetId}`, { responseType: 'blob' });
        const blobUrl = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = 'my-reports.json';
        a.click();
        URL.revokeObjectURL(blobUrl);
        show('Reports exported as JSON.', 'success');
        setExporting(false);
        return;
      }

      if (format === 'pdf') {
        url = '/reports/export/pdf';
        filename = 'reports.pdf';
      } else {
        url = '/reports/export/excel';
        filename = 'reports.xlsx';
      }

      const res = await api.get(url, {
        params: buildExportParams(),
        responseType: 'blob',
      });

      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
      show(`Reports exported as ${format.toUpperCase()}.`, 'success');
    } catch (err) {
      const msg =
        err.response?.status === 404
          ? 'No reports found matching current filters.'
          : 'Export failed. Please try again.';
      show(msg, 'error');
    }
    setExporting(false);
  };

  const handleExportIndividual = async (format) => {
    const targetId = selectedEmployee?._id || user._id;
    setExporting(true);
    try {
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const res = await api.get(`/reports/export/individual/${targetId}/${format}`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `report_${selectedEmployee?.firstName || 'my'}.${ext}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      show(`Individual report exported as ${format.toUpperCase()}.`, 'success');
    } catch (err) {
      const msg =
        err.response?.status === 404
          ? 'No reports found for this employee.'
          : 'Export failed.';
      show(msg, 'error');
    }
    setExporting(false);
  };

  // ─── Pagination handlers ────────────────────────────────────────────────
  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({
      page: 1,
      limit: newLimit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / newLimit),
    });
  };

  const handleTabChange = (newTab) => {
    setTab(newTab);
    if (newTab === 'individual') {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  };

  // ─── Filter handlers ───────────────────────────────────────────────────
  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ department: '', level: '', dateFrom: '', dateTo: '' });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // ─── Employee selector helpers ──────────────────────────────────────────
  const filteredEmployees = employees.filter((emp) => {
    const q = employeeSearch.toLowerCase();
    return (
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q) ||
      emp.department?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q)
    );
  });

  const handleSelectEmployee = (emp) => {
    setSelectedEmployee(emp);
    setShowEmployeeDropdown(false);
    setEmployeeSearch('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearEmployeeSelection = () => {
    setSelectedEmployee(null);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // ─── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Heatmap chart data ─────────────────────────────────────────────────
  const heatmapChartData = Object.entries(heatmap).map(([comp, depts]) => {
    const row = { competency: comp };
    depts.forEach((d) => {
      row[d.department] = d.avgScore;
    });
    return row;
  });
  const allDepts = [
    ...new Set(Object.values(heatmap).flatMap((arr) => arr.map((d) => d.department))),
  ];

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">
            Reports & Analytics
          </h1>
          <p className="text-gray-500 mt-1">
            View individual, departmental, and bank-wide competency reports.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-semibold text-sm transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'border-brand-red bg-brand-red/10 text-brand-red'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Export dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-semibold text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export
              <ChevronDown className="w-3 h-3" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-50 py-1 overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Filtered Reports
                </div>
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <FileText className="w-4 h-4 text-red-500" />
                  Export as PDF
                </button>
                <button
                  onClick={() => handleExport('excel')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Export as Excel
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <FileText className="w-4 h-4 text-blue-500" />
                  Export as JSON
                </button>

                {tab === 'individual' && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Individual Report
                    </div>
                    <button
                      onClick={() => handleExportIndividual('pdf')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <UserIcon className="w-4 h-4 text-red-500" />
                      Employee PDF
                    </button>
                    <button
                      onClick={() => handleExportIndividual('excel')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <UserIcon className="w-4 h-4 text-green-600" />
                      Employee Excel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-5 mb-6 animate-in">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              Filter Reports
            </h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-brand-red hover:underline font-medium"
              >
                <X className="w-3 h-3" /> Clear All
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Department</label>
              <select
                value={filters.department}
                onChange={(e) => updateFilter('department', e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Level</label>
              <select
                value={filters.level}
                onChange={(e) => updateFilter('level', e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              >
                <option value="">All Levels</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">From Date</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">To Date</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(isAdmin
          ? [
              ['department', 'Department Summary'],
              ['heatmap', 'Competency Heatmap'],
              ['individual', 'Individual Reports'],
            ]
          : [['individual', 'My Reports']]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all ${
              tab === key
                ? 'border-brand-red bg-brand-red/10 text-brand-red'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════ INDIVIDUAL REPORTS TAB ═══════════ */}
      {tab === 'individual' && (
        <>
          {/* Employee Selector (Admin / Supervisor) */}
          {(isAdmin || user.role === 'SUPERVISOR') && (
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                Select Employee
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative w-80" ref={employeeDropdownRef}>
                  <div
                    onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                    className="flex items-center gap-2 w-full h-10 px-3 rounded-lg border border-gray-300 bg-white cursor-pointer hover:border-gray-400 transition-colors text-sm"
                  >
                    <UserIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    {selectedEmployee ? (
                      <span className="text-gray-800 font-medium truncate">
                        {selectedEmployee.firstName} {selectedEmployee.lastName}{' '}
                        <span className="text-gray-400 font-normal">
                          — {selectedEmployee.department || 'N/A'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400">Choose an employee…</span>
                    )}
                    <ChevronDown className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
                  </div>

                  {showEmployeeDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-64 overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                            placeholder="Search employees…"
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm focus-brand"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredEmployees.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-400 text-center">
                            No employees found
                          </div>
                        ) : (
                          filteredEmployees.map((emp) => (
                            <button
                              key={emp._id}
                              onClick={() => handleSelectEmployee(emp)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left ${
                                selectedEmployee?._id === emp._id ? 'bg-brand-red/5' : ''
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                                {emp.firstName?.[0]}
                                {emp.lastName?.[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-gray-800 truncate">
                                  {emp.firstName} {emp.lastName}
                                </div>
                                <div className="text-xs text-gray-400 truncate">
                                  {emp.department || 'No Department'} • {emp.email}
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {selectedEmployee && (
                  <button
                    onClick={clearEmployeeSelection}
                    className="flex items-center gap-1 text-xs text-brand-red hover:underline font-medium"
                  >
                    <X className="w-3 h-3" /> Clear Selection
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Selected employee summary card */}
          {selectedEmployee && individual.length > 0 && (
            <div className="bg-gradient-to-r from-brand-red/5 to-transparent rounded-xl border border-brand-red/20 p-5 mb-5">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-12 h-12 rounded-full bg-brand-red/10 flex items-center justify-center text-lg font-bold text-brand-red">
                  {selectedEmployee.firstName?.[0]}
                  {selectedEmployee.lastName?.[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-brand-black">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedEmployee.department || 'N/A'} • {selectedEmployee.email}
                  </p>
                </div>
                <div className="ml-auto flex gap-6 flex-wrap">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-brand-red">
                      {individual.length}
                    </div>
                    <div className="text-xs text-gray-400">Assessments</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-brand-black">
                      {(
                        individual.reduce((s, r) => s + (r.finalScore || 0), 0) /
                        individual.length
                      ).toFixed(1)}
                      %
                    </div>
                    <div className="text-xs text-gray-400">Avg Score</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pagination info + page size */}
          {individual.length > 0 && (
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} reports
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Show:</span>
                <select
                  value={pagination.limit}
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

          {/* Reports Table */}
          <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Competency
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Level
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Recommendation
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {individual.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                        {selectedEmployee
                          ? 'No reports found for this employee.'
                          : 'No reports yet.'}
                      </td>
                    </tr>
                  )}
                  {individual.map((r, i) => (
                    <tr key={r._id || i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-semibold text-sm text-brand-black-soft">
                        {r.competencyName}
                      </td>
                      <td className="px-6 py-3 font-bold text-sm text-brand-red">
                        {r.finalScore}%
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge badge-${r.level.toLowerCase()}`}>{r.level}</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600 max-w-xs line-clamp-2">
                        {r.recommendation || '—'}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-400">
                        {new Date(r.generatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {pagination.total > pagination.limit && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <div className="flex items-center gap-1">
                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    if (pagination.totalPages <= maxVisible) {
                      for (let i = 1; i <= pagination.totalPages; i++) pages.push(i);
                    } else {
                      let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
                      let end = Math.min(pagination.totalPages, start + maxVisible - 1);
                      if (end - start + 1 < maxVisible) {
                        start = Math.max(1, end - maxVisible + 1);
                      }
                      for (let i = start; i <= end; i++) pages.push(i);
                    }
                    return pages.map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium ${
                          pagination.page === pageNum
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
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════ DEPARTMENT SUMMARY TAB ═══════════ */}
      {tab === 'department' && isAdmin && (
        <div>
          <div className="mb-6">
            <select
              value={selDept}
              onChange={(e) => setSelDept(e.target.value)}
              className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm w-72"
            >
              <option value="">— Select Department —</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          {selDept && deptSummary.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {deptSummary.map((item, i) => (
                <div key={i} className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="text-base font-bold text-brand-black mb-3">
                    {item.competencyName}
                  </h3>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-500">Avg Score</span>
                    <span className="text-base font-bold text-brand-red">{item.avgScore}%</span>
                  </div>
                  <div className="progress-bar mb-3">
                    <div className="progress-fill" style={{ width: `${item.avgScore}%` }} />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(item.levelDistribution).map(
                      ([lvl, count]) =>
                        count > 0 && (
                          <span
                            key={lvl}
                            className="text-xs px-2 py-1 rounded-full font-semibold"
                            style={{
                              backgroundColor: LEVEL_COLORS[lvl] + '28',
                              color: LEVEL_COLORS[lvl],
                            }}
                          >
                            {lvl}: {count}
                          </span>
                        ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selDept && deptSummary.length === 0 && (
            <div className="text-center py-16">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-600">No data for this department</h3>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ HEATMAP TAB ═══════════ */}
      {tab === 'heatmap' && isAdmin && (
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">
            Bank-Wide Competency Heatmap
          </h3>
          {heatmapChartData.length === 0 ? (
            <div className="text-center py-16">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-600">No heatmap data yet</h3>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={heatmapChartData} layout="vertical" barSize={22}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="competency" tick={{ fontSize: 12 }} width={120} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: 13,
                  }}
                />
                <Legend />
                {allDepts.map((dept, i) => (
                  <Bar
                    key={dept}
                    dataKey={dept}
                    name={dept}
                    radius={[0, 4, 4, 0]}
                    fill={
                      ['#C8102E', '#2563EB', '#16A34A', '#EA580C', '#8B5CF6', '#0891B2'][i % 6]
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
