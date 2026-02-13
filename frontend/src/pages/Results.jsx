import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  TrendingUp, CheckCircle2, Download, ChevronLeft, ChevronRight,
  Award, User, Users, Scale, Calendar, Filter, X, FileText,
  SlidersHorizontal, Eye, XCircle, Info, ClipboardList, ChevronDown
} from 'lucide-react';
import { exportToPDF, exportToExcel, generateFilename } from '../utils/exportUtils';
import api from '../utils/api';
import Select from 'react-select';

// Detail Modal Component
const ResultDetailModal = ({ result, isOpen, onClose, isAdmin }) => {
  if (!isOpen || !result) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-red to-brand-red-dark px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-white" />
              <h3 className="text-lg font-semibold text-white">
                Assessment Result Details
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
            <div className="space-y-6">
              {/* Assessment Info Header */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="w-5 h-5 text-blue-600" />
                  <h4 className="text-sm font-semibold text-blue-900">{result.assessmentDescription}</h4>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                  ${result.assessmentType === 'Combined'
                    ? 'bg-purple-100 text-purple-700'
                    : result.assessmentType === 'SelfAssessment'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                  {result.assessmentType === 'SelfAssessment' ? 'Self Assessment' :
                    result.assessmentType === 'SupervisorOnly' ? 'Supervisor Assessment' : 'Combined Assessment'}
                </span>
              </div>

              {/* Employee Info (for admin) */}
              {isAdmin && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Employee Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Name</p>
                      <p className="text-sm font-medium text-gray-900">{result.userName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Position</p>
                      <p className="text-sm font-medium text-gray-900">{result.userPosition}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Department</p>
                      <p className="text-sm font-medium text-gray-900">{result.userDepartment}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="text-sm font-medium text-gray-900">{result.userEmail}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Competency Details */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Competency Details
                </h4>
                <div>
                  <p className="text-sm font-medium text-gray-900">{result.competencyName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{result.competencyCategory}</p>
                </div>
              </div>

              {/* Score Details */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Score Breakdown
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-blue-600" />
                      <p className="text-xs text-gray-600">Self Score</p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {result.selfScore !== null ? `${result.selfScore.toFixed(1)}%` : '—'}
                    </p>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-purple-600" />
                      <p className="text-xs text-gray-600">Supervisor Score</p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {result.supervisorScore !== null ? `${result.supervisorScore.toFixed(1)}%` : '—'}
                    </p>
                  </div>

                  <div className="bg-white rounded-lg p-3 border-2 border-brand-red/20 bg-brand-red/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Award className="w-4 h-4 text-brand-red" />
                      <p className="text-xs text-gray-600">Final Score</p>
                    </div>
                    <p className="text-xl font-bold text-brand-red">
                      {result.finalScore.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {result.isCombined && result.weightUsed && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Scale className="w-4 h-4 text-orange-500" />
                      <span className="text-xs font-medium text-gray-700">Weight Configuration</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Self:</span>
                        <span className="text-sm font-semibold text-gray-900">{result.weightUsed.selfAssessment}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Supervisor:</span>
                        <span className="text-sm font-semibold text-gray-900">{result.weightUsed.supervisor}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {result.calculation && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Calculation Method</p>
                    <p className="text-sm bg-white p-2 rounded border border-gray-200 font-mono text-gray-700">
                      {result.calculation}
                    </p>
                  </div>
                )}
              </div>

              {/* Result & Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Proficiency Level
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className={`badge badge-${result.level.toLowerCase()} text-sm px-3 py-1.5`}>
                      {result.level}
                    </span>
                    <div className="flex-1">
                      <div className="progress-bar h-2">
                        <div
                          className={`progress-fill ${result.assessmentType === 'Combined' ? 'bg-purple-600' : 'bg-brand-red'
                            }`}
                          style={{ width: `${result.finalScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Status
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className={`badge badge-${result.status.toLowerCase()}`}>
                      {result.status}
                    </span>
                    {result.status === 'FINAL' && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Finalised
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              {result.recommendation && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
                        Development Recommendation
                      </h4>
                      <p className="text-sm text-blue-900">
                        {result.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-brand-red text-white rounded-lg font-medium text-sm hover:bg-brand-red-dark transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Results() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const [results, setResults] = useState([]);
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [currentAssessment, setCurrentAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAssessments, setLoadingAssessments] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  // Filter state
  const [filters, setFilters] = useState({
    competency: '',
    level: '',
    dateRange: '',
    search: '',
    hasBothScores: false,
    status: ''
  });

  // Export options
  const [exportFormat, setExportFormat] = useState('pdf');

  // Load available assessments
  useEffect(() => {
    const loadAssessments = async () => {
      try {
        setLoadingAssessments(true);
        const { data } = await api.get('/results/assessments/available');
        setAssessments(data.data.assessments);

        // Auto-select first assessment if available
        if (data.data.assessments.length > 0) {
          setSelectedAssessment(data.data.assessments[0]._id);
        }
      } catch (error) {
        console.error('Error loading assessments:', error);
        show('Failed to load assessments.', 'error');
      } finally {
        setLoadingAssessments(false);
      }
    };
    loadAssessments();
  }, []);

  // Load results for selected assessment
  useEffect(() => {
    const loadResultsByAssessment = async () => {
      if (!selectedAssessment) {
        setResults([]);
        setCurrentAssessment(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data } = await api.get(`/results/by-assessment/${selectedAssessment}`, {
          params: {
            page: pagination.page,
            limit: pagination.limit
          }
        });

        setResults(data.data.results || []);
        setCurrentAssessment(data.data.assessment);
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: data.data.pagination.totalPages
        }));
      } catch (error) {
        console.error('Error loading results:', error);
        show('Failed to load results.', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadResultsByAssessment();
  }, [selectedAssessment, pagination.page, pagination.limit]);

  // Apply filters to results (client-side filtering)
  const getFilteredResults = () => {
    return results.filter(result => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          result.competencyName?.toLowerCase().includes(searchLower) ||
          result.recommendation?.toLowerCase().includes(searchLower) ||
          result.userName?.toLowerCase().includes(searchLower) ||
          result.level?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Competency filter
      if (filters.competency && result.competencyName !== filters.competency) {
        return false;
      }

      // Level filter
      if (filters.level && result.level !== filters.level) {
        return false;
      }

      // Status filter
      if (filters.status && result.status !== filters.status) {
        return false;
      }

      // Has both scores filter
      if (filters.hasBothScores && !result.hasBoth) {
        return false;
      }

      // Date range filter
      if (filters.dateRange) {
        const resultDate = new Date(result.date);
        const now = new Date();
        const daysDiff = (now - resultDate) / (1000 * 60 * 60 * 24);

        switch (filters.dateRange) {
          case 'today':
            if (daysDiff > 1) return false;
            break;
          case 'week':
            if (daysDiff > 7) return false;
            break;
          case 'month':
            if (daysDiff > 30) return false;
            break;
          case 'quarter':
            if (daysDiff > 90) return false;
            break;
          default:
            break;
        }
      }

      return true;
    });
  };

  const filteredResults = getFilteredResults();

  // Get unique values for filters
  const getUniqueValues = (key) => {
    const values = new Set();
    results.forEach(result => {
      if (key === 'competency') values.add(result.competencyName);
      if (key === 'level') values.add(result.level);
      if (key === 'status') values.add(result.status);
    });
    return Array.from(values).sort();
  };

  const finalise = async (id) => {
    try {
      await api.patch(`/results/${id}/finalise`);
      show('Result finalised successfully.', 'success');
      setResults((prev) =>
        prev.map((r) => (r._id === id ? { ...r, status: 'FINAL' } : r))
      );
    } catch (err) {
      show(err.response?.data?.message || 'Failed to finalise result.', 'error');
    }
  };

  const clearFilters = () => {
    setFilters({
      competency: '',
      level: '',
      dateRange: '',
      search: '',
      hasBothScores: false,
      status: ''
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      if (filteredResults.length === 0) {
        show('No results to export.', 'warning');
        return;
      }

      const filename = generateFilename(
        `results_${currentAssessment?.title?.replace(/\s+/g, '_') || 'assessment'}`,
        exportFormat
      );

      // Prepare export data
      const exportData = {
        type: 'results',
        assessment: currentAssessment,
        user: {
          name: isAdmin ? 'All Employees' : user?.name || 'N/A',
          employeeId: isAdmin ? 'ALL' : user?.employeeId || user?._id || 'N/A',
          department: isAdmin ? 'All Departments' : user?.department || 'N/A',
          position: isAdmin ? 'Administrator' : user?.position || 'N/A'
        },
        results: filteredResults.map(r => ({
          competencyName: r.competencyName,
          competencyId: r.competencyId,
          selfScore: r.selfScore,
          supervisorScore: r.supervisorScore,
          finalScore: r.finalScore,
          level: r.level,
          status: r.status,
          recommendation: r.recommendation,
          createdAt: r.date,
          ...(isAdmin && {
            userName: r.userName,
            userDepartment: r.userDepartment,
            userPosition: r.userPosition
          })
        }))
      };

      if (exportFormat === 'pdf') {
        await exportToPDF(exportData, filename);
        show('Results exported to PDF successfully!', 'success');
      } else if (exportFormat === 'excel') {
        await exportToExcel(exportData, filename);
        show('Results exported to Excel successfully!', 'success');
      }

    } catch (err) {
      console.error('Export Error:', err);
      show(`Export failed: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({
      page: 1,
      limit: newLimit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / newLimit)
    });
  };

  const openDetailModal = (result) => {
    setSelectedResult(result);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedResult(null);
  };

  const handleAssessmentChange = (e) => {
    setSelectedAssessment(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
    clearFilters();
  };

  // Filter Panel Component
  const FilterPanel = () => (
    <div className="bg-white rounded-xl shadow-card border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-brand-red" />
          <h3 className="font-semibold text-gray-900">Filter Results</h3>
          {Object.values(filters).some(v => v && v !== '') && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-red ml-2"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(false)}
          className="text-gray-400 hover:text-gray-600 lg:hidden"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Search
          </label>
          <input
            type="text"
            placeholder="Search by competency, employee..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          />
        </div>

        {/* Competency Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Competency
          </label>
          <select
            value={filters.competency}
            onChange={(e) => setFilters(prev => ({ ...prev, competency: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Competencies</option>
            {getUniqueValues('competency').map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        {/* Level Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Proficiency Level
          </label>
          <select
            value={filters.level}
            onChange={(e) => setFilters(prev => ({ ...prev, level: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Levels</option>
            {getUniqueValues('level').map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Status</option>
            {getUniqueValues('status').map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        {/* Date Range Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Date Range
          </label>
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
        </div>

        {/* Checkbox Filters */}
        <div className="flex items-center gap-4 pt-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.hasBothScores}
              onChange={(e) => setFilters(prev => ({ ...prev, hasBothScores: e.target.checked }))}
              className="rounded border-gray-300 text-brand-red focus:ring-brand-red/20"
            />
            Has both scores
          </label>
        </div>

        {/* Export Format */}
        <div className="col-span-full mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Export Format:</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  value="pdf"
                  checked={exportFormat === 'pdf'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="text-brand-red focus:ring-brand-red/20"
                />
                PDF
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  value="excel"
                  checked={exportFormat === 'excel'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="text-brand-red focus:ring-brand-red/20"
                />
                Excel
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (loadingAssessments) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-7">
      {/* Detail Modal */}
      <ResultDetailModal
        result={selectedResult}
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        isAdmin={isAdmin}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Assessment Results</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? 'View results filtered by assessment'
              : 'Your assessment history'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            disabled={!selectedAssessment || results.length === 0}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-semibold transition-colors ${!selectedAssessment || results.length === 0
                ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400'
                : showFilters
                  ? 'border-brand-red bg-brand-red/10 text-brand-red'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {Object.values(filters).filter(v => v && v !== '').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-brand-red text-white text-xs rounded-full">
                {Object.values(filters).filter(v => v && v !== '').length}
              </span>
            )}
          </button>

          <button
            onClick={handleExport}
            disabled={exporting || filteredResults.length === 0 || !selectedAssessment}
            className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
          </button>
        </div>
      </div>

      {/* Assessment Selector */}
      <div className="bg-white rounded-xl shadow-card border border-gray-200 p-5 mb-6">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Select Assessment
            </label>
            <div className="relative">
              <Select
                options={assessments.map(a => ({
                  value: a._id,
                  label: `${a.title || a.description} (${a.type})`
                }))}
                value={
                  assessments
                    .map(a => ({
                      value: a._id,
                      label: `${a.title || a.description} (${a.type})`
                    }))
                    .find(opt => opt.value === selectedAssessment) || null
                }
                onChange={(selected) => {
                  setSelectedAssessment(selected?.value || '');
                  setPagination(prev => ({ ...prev, page: 1 }));
                  clearFilters();
                }}
                placeholder="Search assessment..."
                isClearable
                className="text-sm"
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: '40px',          // 👈 compact
                    height: '40px',
                    borderRadius: '8px',
                    borderColor: '#d1d5db',
                    boxShadow: 'none'
                  }),
                  valueContainer: (base) => ({
                    ...base,
                    padding: '0 12px'
                  }),
                  indicatorsContainer: (base) => ({
                    ...base,
                    height: '40px'
                  })
                }}
              />
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {currentAssessment && (
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg text-blue-800">
              <ClipboardList className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider">Current Assessment</p>
                <p className="text-sm font-semibold">{currentAssessment.title || currentAssessment.description}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && selectedAssessment && <FilterPanel />}

      {/* Results Stats */}
      {selectedAssessment && results.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{filteredResults.length}</span> of{' '}
            <span className="font-medium">{pagination.total}</span> results
            {Object.values(filters).some(v => v && v !== '') && ' (filtered)'}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select
              value={pagination.limit}
              onChange={handlePageSizeChange}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
            >
              <option value="10">10 per page</option>
              <option value="20">20 per page</option>
              <option value="30">30 per page</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
            </select>
          </div>
        </div>
      )}

      {/* No Assessment Selected */}
      {!selectedAssessment && (
        <div className="bg-white rounded-xl shadow-card border border-gray-200 p-12 text-center">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Assessment Selected</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Please select an assessment from the dropdown above to view its results.
          </p>
        </div>
      )}

      {/* Results Table - Only show when assessment is selected */}
      {selectedAssessment && (
        <>
          {loading ? (
            <div className="flex items-center justify-center p-16">
              <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {isAdmin && (
                        <>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Department</th>
                        </>
                      )}
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Competency</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Final Score</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Level</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                      {isAdmin && <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>}
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Details</th>
                      {isAdmin && <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 11 : 8} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center">
                            <TrendingUp className="w-12 h-12 text-gray-300 mb-3" />
                            <p className="text-gray-500 text-sm font-medium">No results found</p>
                            <p className="text-gray-400 text-xs mt-1">
                              {Object.values(filters).some(v => v && v !== '')
                                ? 'Try adjusting your filters'
                                : 'No results available for this assessment.'}
                            </p>
                            {Object.values(filters).some(v => v && v !== '') && (
                              <button
                                onClick={clearFilters}
                                className="mt-4 text-sm text-brand-red hover:text-brand-red-dark font-medium"
                              >
                                Clear all filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((result) => (
                        <tr key={result._id} className="hover:bg-gray-50/80 transition-colors">
                          {isAdmin && (
                            <>
                              <td className="px-6 py-4">
                                <div className="font-medium text-sm text-gray-900">{result.userName}</div>
                                <div className="text-xs text-gray-500">{result.userPosition}</div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-600">{result.userDepartment}</span>
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4">
                            <div className="font-medium text-sm text-gray-900">{result.competencyName}</div>
                            <div className="text-xs text-gray-500">{result.competencyCategory}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                              ${result.assessmentType === 'Combined'
                                ? 'bg-purple-100 text-purple-700'
                                : result.assessmentType === 'SelfAssessment'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}>
                              {result.assessmentType === 'SelfAssessment' ? 'Self' :
                                result.assessmentType === 'SupervisorOnly' ? 'Supervisor' : 'Combined'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-16">
                                <div className="progress-bar">
                                  <div
                                    className={`progress-fill ${result.assessmentType === 'Combined' ? 'bg-purple-600' : 'bg-brand-red'
                                      }`}
                                    style={{ width: `${result.finalScore}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-sm font-bold text-gray-900">
                                {result.finalScore.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`badge badge-${result.level.toLowerCase()}`}>
                              {result.level}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Calendar className="w-3.5 h-3.5" />
                              {result.formattedDate}
                            </div>
                          </td>
                          {isAdmin && (
                            <td className="px-6 py-4">
                              <span className={`badge badge-${result.status.toLowerCase()}`}>
                                {result.status}
                              </span>
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <button
                              onClick={() => openDetailModal(result)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Details
                            </button>
                          </td>
                          {isAdmin && (
                            <td className="px-6 py-4">
                              {result.status === 'PENDING' && (
                                <button
                                  onClick={() => finalise(result._id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Finalise
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {pagination.total > pagination.limit && !loading && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                <span className="font-medium">{pagination.total}</span> results
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else {
                      const start = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                      pageNum = start + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${pagination.page === pageNum
                            ? 'bg-brand-red text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Summary Cards */}
      {selectedAssessment && results.length > 0 && !isAdmin && (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Total Competencies</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{results.length}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Average Score</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {results.length > 0
                    ? Math.round(results.reduce((acc, r) => acc + r.finalScore, 0) / results.length)
                    : 0}%
                </p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <Award className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Expert Level</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {results.filter(r => r.level === 'Expert').length}
                </p>
              </div>
              <div className="w-10 h-10 bg-brand-red-muted rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-brand-red" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">With Both Scores</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {results.filter(r => r.hasBoth).length}
                </p>
              </div>
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <Scale className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}