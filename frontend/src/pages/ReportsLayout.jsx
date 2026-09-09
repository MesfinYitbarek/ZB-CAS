import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Outlet, useLocation } from 'react-router-dom';
import {
  FileText, FileSpreadsheet, SlidersHorizontal, Loader2,
} from 'lucide-react';
import api from '../utils/api';
import FilterDrawer, { ActiveFilterPills } from './reports/FilterDrawer';
import ReportsContext from './reports/ReportsContext';

const PERIOD_OPTIONS = [
  { id: '1m', label: '1 Month' },
  { id: '3m', label: '3 Months' },
  { id: '6m', label: '6 Months' },
  { id: '1y', label: 'Yearly' },
  { id: 'all', label: 'All Time' },
];

const getPeriodDates = (period) => {
  if (period === 'all') return { dateFrom: '', dateTo: '' };
  const now = new Date();
  const from = new Date(now);
  if (period === '1m') from.setMonth(now.getMonth() - 1);
  else if (period === '3m') from.setMonth(now.getMonth() - 3);
  else if (period === '6m') from.setMonth(now.getMonth() - 6);
  else if (period === '1y') from.setFullYear(now.getFullYear() - 1);
  return {
    dateFrom: from.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  };
};

const EMPTY_FILTERS = {
  employeeId: '', department: '', position: '', gender: '', employeeIdCode: '',
  assessmentId: '', assessmentType: '', purpose: '', targetGroup: '',
  assessmentStartFrom: '', assessmentStartTo: '', assessmentEndFrom: '', assessmentEndTo: '',
  competencyId: '', competencyCategory: '', competencyLevel: '',
  scoreMin: '', scoreMax: '', selfScoreMin: '', selfScoreMax: '',
  supervisorScoreMin: '', supervisorScoreMax: '',
  overallLevel: '', dateFrom: '', dateTo: '',
};

const SECTION_META = {
  overview:   { title: 'Overview',       subtitle: 'High-level summary and level distribution' },
  department: { title: 'By Department',  subtitle: 'Department performance and deep-dive' },
  competency: { title: 'By Competency',  subtitle: 'Competency averages and heatmap' },
  individual: { title: 'Individual',     subtitle: 'Reports for a specific employee' },
  all:        { title: 'All Reports',    subtitle: 'Every generated report across the organization' },
  builder:    { title: 'Custom Builder', subtitle: 'Build cross-tabulated reports' },
};

export default function ReportsLayout() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const loc = useLocation();

  const section = (loc.pathname.split('/')[2] || 'overview').replace(/-/g, '');
  const meta = SECTION_META[section] || SECTION_META.overview;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterOptions, setFilterOptions] = useState({
    departments: [], positions: [], genders: [],
    competencies: [], competencyCategories: [],
    assessments: [], assessmentTypes: [], purposes: [], targetGroups: [],
    scoreRange: { min: 0, max: 100 },
  });

  const [filters, setFilters] = useState(() => {
    const { dateFrom, dateTo } = getPeriodDates('1m');
    return { ...EMPTY_FILTERS, dateFrom, dateTo };
  });
  const [activePeriod, setActivePeriod] = useState('1m');
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(null);

  const setF = useCallback((key, val) => setFilters(p => ({ ...p, [key]: val })), []);
  const setDepartment      = useCallback(v => setF('department', v), [setF]);
  const setPosition        = useCallback(v => setF('position', v), [setF]);
  const setGender          = useCallback(v => setF('gender', v), [setF]);
  const setEmployeeIdCode  = useCallback(v => setF('employeeIdCode', v), [setF]);
  const setAssessmentId    = useCallback(v => setF('assessmentId', v), [setF]);
  const setAssessmentType  = useCallback(v => setF('assessmentType', v), [setF]);
  const setPurpose         = useCallback(v => setF('purpose', v), [setF]);
  const setTargetGroup     = useCallback(v => setF('targetGroup', v), [setF]);
  const setAssessmentStartFrom = useCallback(v => setF('assessmentStartFrom', v), [setF]);
  const setAssessmentStartTo   = useCallback(v => setF('assessmentStartTo', v), [setF]);
  const setAssessmentEndFrom   = useCallback(v => setF('assessmentEndFrom', v), [setF]);
  const setAssessmentEndTo     = useCallback(v => setF('assessmentEndTo', v), [setF]);
  const setCompetencyId        = useCallback(v => setF('competencyId', v), [setF]);
  const setCompetencyCategory  = useCallback(v => setF('competencyCategory', v), [setF]);
  const setCompetencyLevel     = useCallback(v => setF('competencyLevel', v), [setF]);
  const setScoreMin        = useCallback(v => setF('scoreMin', v), [setF]);
  const setScoreMax        = useCallback(v => setF('scoreMax', v), [setF]);
  const setSelfScoreMin    = useCallback(v => setF('selfScoreMin', v), [setF]);
  const setSelfScoreMax    = useCallback(v => setF('selfScoreMax', v), [setF]);
  const setSupervisorScoreMin = useCallback(v => setF('supervisorScoreMin', v), [setF]);
  const setSupervisorScoreMax = useCallback(v => setF('supervisorScoreMax', v), [setF]);
  const setOverallLevel    = useCallback(v => setF('overallLevel', v), [setF]);
  const setDateFrom        = useCallback(v => setF('dateFrom', v), [setF]);
  const setDateTo          = useCallback(v => setF('dateTo', v), [setF]);

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && k !== 'employeeId').length;
  const removeFilter = useCallback(key => setF(key, ''), [setF]);
  const clearFilters = useCallback(() => setFilters({ ...EMPTY_FILTERS }), []);

  const handlePeriodChange = useCallback((periodId) => {
    setActivePeriod(periodId);
    const { dateFrom, dateTo } = getPeriodDates(periodId);
    setFilters(p => ({ ...p, dateFrom, dateTo }));
  }, []);

  // ── Shared data ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin) {
      api.get('/reports/filter-options').then(({ data }) => setFilterOptions(p => ({ ...p, ...data.data }))).catch(() => {});
    }
  }, [isAdmin]);

  const filterParams = useCallback(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v !== null) p[k] = v; });
    return p;
  }, [filters]);

  // ── Export (individual section may pass selected employee) ─────────────────
  const [exportTarget, setExportTarget] = useState(null);

  const doExport = async (format, type = 'filtered', emp) => {
    setExporting(format);
    try {
      const params = filterParams();
      let url, filename;
      if (type === 'individual') {
        const targetId = emp?._id || exportTarget?._id || user._id;
        filename = `report_${(emp?.name || exportTarget?.name || user.name || 'employee').replace(/\s+/g, '_')}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
        url = `/reports/export/individual/${targetId}/${format}`;
      } else {
        url = `/reports/export/${format}`;
        filename = `reports_${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      }
      const res = await api.get(url, { params, responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = blobUrl; a.download = filename; a.click();
      URL.revokeObjectURL(blobUrl);
      show(`Exported as ${format.toUpperCase()} successfully.`, 'success');
    } catch (err) {
      show(err.response?.status === 404 ? 'No data found for export.' : 'Export failed.', 'error');
    }
    setExporting(null);
  };

  const drawerProps = {
    filters, filterOptions, isAdmin,
    onClose: () => setShowFilters(false),
    onClear: clearFilters, onRemove: removeFilter,
    setDepartment, setPosition, setGender, setEmployeeIdCode,
    setAssessmentId, setAssessmentType, setPurpose, setTargetGroup,
    setAssessmentStartFrom, setAssessmentStartTo, setAssessmentEndFrom, setAssessmentEndTo,
    setCompetencyId, setCompetencyCategory, setCompetencyLevel,
    setScoreMin, setScoreMax, setSelfScoreMin, setSelfScoreMax,
    setSupervisorScoreMin, setSupervisorScoreMax,
    setOverallLevel, setDateFrom, setDateTo,
  };

  const contextValue = {
    filters, filterOptions, filterParams,
    activeFilterCount, clearFilters, removeFilter,
    setFilters, setShowFilters,
    doExport, section,
    setExportTarget,
  };

  return (
    <ReportsContext.Provider value={contextValue}>
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#f8f9fb] overflow-hidden">

        {/* ── STICKY HEADER ────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-[#f8f9fb] border-b border-gray-200/70 shadow-sm flex-shrink-0">
          <div className="px-7 py-3">
            <div className="flex justify-between items-center gap-4 flex-wrap">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <h1 className="text-lg  font-bold text-brand-black">{meta.title}</h1>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 mt-1">
                    {PERIOD_OPTIONS.map(p => (
                      <button key={p.id} type="button" onClick={() => handlePeriodChange(p.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all
                          ${activePeriod === p.id ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-red/40 hover:text-brand-red'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {isAdmin && (
                  <button type="button" onClick={() => setShowFilters(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-semibold text-sm transition-all
                      ${showFilters || activeFilterCount > 0 ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">{activeFilterCount}</span>
                    )}
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => doExport('pdf', section === 'individual' ? 'individual' : 'filtered')} disabled={!!exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-l-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                    {exporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-red-500" />}PDF
                  </button>
                  <button type="button" onClick={() => doExport('excel', section === 'individual' ? 'individual' : 'filtered')} disabled={!!exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-l-0 border-gray-300 rounded-r-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                    {exporting === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />}Excel
                  </button>
                </div>
              </div>
            </div>

            {activeFilterCount > 0 && !showFilters && (
              <div className="flex items-center gap-3 flex-wrap mt-2">
                <ActiveFilterPills filters={filters} filterOptions={filterOptions} onRemove={removeFilter} />
                <button type="button" onClick={clearFilters} className="text-xs text-gray-400 hover:text-brand-red font-medium">Clear all</button>
              </div>
            )}
          </div>
        </div>

        {/* ── SCROLLABLE BODY ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-7 space-y-5">
            {showFilters && isAdmin && <FilterDrawer {...drawerProps} />}
            <Outlet />
          </div>
        </div>
      </div>
    </ReportsContext.Provider>
  );
}
