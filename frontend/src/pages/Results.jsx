import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { 
  TrendingUp, CheckCircle2, Download, ChevronLeft, ChevronRight, 
  Award, User, Users, Scale, Calendar, Filter, X, FileText, 
  SlidersHorizontal 
} from 'lucide-react';
import { exportToPDF, exportToExcel, generateFilename } from '../utils/exportUtils';
import api from '../utils/api';

export default function Results() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const [results, setResults] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
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
    assessmentType: '',
    level: '',
    dateRange: '',
    search: '',
    hasBothScores: false,
    isCombined: false,
    status: ''
  });

  // Export options
  const [exportFormat, setExportFormat] = useState('pdf');

  // Process results to group by assessment and competency
  const processResults = (results) => {
    const grouped = results.reduce((acc, result) => {
      const key = `${result.competencyId._id}-${result.assessmentId._id}`;
      
      if (!acc[key]) {
        acc[key] = {
          _id: result._id,
          competencyId: result.competencyId,
          competencyName: result.competencyId.name,
          competencyCategory: result.competencyId.category,
          assessmentId: result.assessmentId,
          assessmentDescription: result.assessmentId.description,
          assessmentType: result.assessmentId.type,
          userId: result.userId,
          userName: result.userId.name,
          userEmail: result.userId.email,
          userDepartment: result.userId.department,
          userPosition: result.userId.position,
          employeeId: result.userId.employeeId || result.userId._id,
          selfScore: result.scoreDetails?.selfScore || null,
          supervisorScore: result.scoreDetails?.supervisorScore || null,
          finalScore: result.finalScore,
          level: result.level,
          recommendation: result.recommendation,
          status: result.status || 'FINAL',
          weightUsed: result.scoreDetails?.weightUsed || null,
          calculation: result.scoreDetails?.calculation || null,
          date: result.createdAt,
          formattedDate: new Date(result.createdAt).toLocaleDateString(),
          hasBoth: result.scoreDetails?.selfScore !== null && result.scoreDetails?.supervisorScore !== null,
          isCombined: result.assessmentId.type === 'Combined'
        };
      }
      
      return acc;
    }, {});

    return Object.values(grouped);
  };

  // Get unique values for filters
  const getUniqueValues = (key) => {
    const values = new Set();
    allResults.forEach(result => {
      if (key === 'competency') values.add(result.competencyName);
      if (key === 'assessmentType') values.add(result.assessmentType);
      if (key === 'level') values.add(result.level);
      if (key === 'status') values.add(result.status);
    });
    return Array.from(values).sort();
  };

  // Apply filters to results
  const applyFilters = (resultsToFilter) => {
    return resultsToFilter.filter(result => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          result.competencyName?.toLowerCase().includes(searchLower) ||
          result.assessmentDescription?.toLowerCase().includes(searchLower) ||
          result.recommendation?.toLowerCase().includes(searchLower) ||
          result.userName?.toLowerCase().includes(searchLower) ||
          result.level?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Competency filter
      if (filters.competency && result.competencyName !== filters.competency) {
        return false;
      }

      // Assessment type filter
      if (filters.assessmentType && result.assessmentType !== filters.assessmentType) {
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

      // Is combined filter
      if (filters.isCombined && !result.isCombined) {
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

  // Load all results for filtering
  useEffect(() => {
    const loadAllResults = async () => {
      try {
        if (isAdmin) {
          const { data } = await api.get('/results', {
            params: { limit: 1000 }
          });
          const processed = processResults(data.data.results || []);
          setAllResults(processed);
        } else {
          const { data } = await api.get(`/results/user/${user._id}`);
          const processed = processResults(data.data.results || []);
          setAllResults(processed);
        }
      } catch (error) {
        console.error('Error loading all results:', error);
        show('Failed to load results.', 'error');
      }
    };
    loadAllResults();
  }, [isAdmin, user]);

  // Load paginated results
  useEffect(() => {
    const loadResults = async () => {
      try {
        setLoading(true);
        
        // Apply filters to all results
        const filteredResults = applyFilters(allResults);
        
        // Update total count
        setPagination(prev => ({
          ...prev,
          total: filteredResults.length,
          totalPages: Math.ceil(filteredResults.length / prev.limit)
        }));

        // Paginate
        const startIndex = (pagination.page - 1) * pagination.limit;
        const paginatedResults = filteredResults.slice(startIndex, startIndex + pagination.limit);
        
        setResults(paginatedResults);
      } catch (error) {
        console.error('Error loading paginated results:', error);
      } finally {
        setLoading(false);
      }
    };

    if (allResults.length > 0) {
      loadResults();
    }
  }, [allResults, pagination.page, pagination.limit, filters]);

  const finalise = async (id) => {
    try {
      await api.patch(`/results/${id}/finalise`);
      show('Result finalised successfully.', 'success');
      setAllResults((prev) => 
        prev.map((r) => (r._id === id ? { ...r, status: 'FINAL' } : r))
      );
    } catch (err) {
      show(err.response?.data?.message || 'Failed to finalise result.', 'error');
    }
  };

  const clearFilters = () => {
    setFilters({
      competency: '',
      assessmentType: '',
      level: '',
      dateRange: '',
      search: '',
      hasBothScores: false,
      isCombined: false,
      status: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Get filtered results for export
      const filteredResults = applyFilters(allResults);
      
      if (filteredResults.length === 0) {
        show('No results to export.', 'warning');
        return;
      }

      // Calculate average score
      const avgScore = filteredResults.length > 0 
        ? Math.round(filteredResults.reduce((acc, r) => acc + r.finalScore, 0) / filteredResults.length)
        : 0;

      // Prepare export data
      const exportData = {
        type: 'results',
        user: {
          name: isAdmin ? 'All Employees' : user?.name || 'N/A',
          employeeId: isAdmin ? 'ALL' : user?.employeeId || user?._id || 'N/A',
          department: isAdmin ? 'All Departments' : user?.department || 'N/A',
          position: isAdmin ? 'Administrator' : user?.position || 'N/A'
        },
        results: filteredResults.map(r => ({
          competencyName: r.competencyName,
          competencyId: r.competencyId,
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

      const filename = generateFilename(
        `results_${isAdmin ? 'all_employees' : user?.name?.replace(/\s+/g, '_')}`,
        exportFormat
      );

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

  // Score Details Component
  const ScoreDetails = ({ result }) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs text-gray-600">Self:</span>
          <span className="text-xs font-semibold text-gray-900">
            {result.selfScore !== null ? `${result.selfScore.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-purple-600" />
          <span className="text-xs text-gray-600">Sup:</span>
          <span className="text-xs font-semibold text-gray-900">
            {result.supervisorScore !== null ? `${result.supervisorScore.toFixed(1)}%` : '—'}
          </span>
        </div>
      </div>
      
      {result.isCombined && result.weightUsed && (
        <div className="flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-xs text-gray-600">Weights:</span>
          <span className="text-xs text-gray-700">
            Self: {result.weightUsed.selfAssessment}% / Sup: {result.weightUsed.supervisor}%
          </span>
        </div>
      )}
      
      {result.calculation && (
        <div className="text-xs text-gray-500 bg-gray-50 p-1.5 rounded">
          <span className="font-medium">Calc:</span> {result.calculation}
        </div>
      )}
    </div>
  );

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
            placeholder="Search by competency, assessment..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
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
            onChange={(e) => setFilters(prev => ({ ...prev, competency: e.target.value, page: 1 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Competencies</option>
            {getUniqueValues('competency').map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        {/* Assessment Type Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Assessment Type
          </label>
          <select
            value={filters.assessmentType}
            onChange={(e) => setFilters(prev => ({ ...prev, assessmentType: e.target.value, page: 1 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Types</option>
            {getUniqueValues('assessmentType').map(value => (
              <option key={value} value={value}>
                {value === 'SelfAssessment' ? 'Self' : 
                 value === 'SupervisorOnly' ? 'Supervisor' : 'Combined'}
              </option>
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
            onChange={(e) => setFilters(prev => ({ ...prev, level: e.target.value, page: 1 }))}
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
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
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
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value, page: 1 }))}
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
              onChange={(e) => setFilters(prev => ({ ...prev, hasBothScores: e.target.checked, page: 1 }))}
              className="rounded border-gray-300 text-brand-red focus:ring-brand-red/20"
            />
            Has both scores
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.isCombined}
              onChange={(e) => setFilters(prev => ({ ...prev, isCombined: e.target.checked, page: 1 }))}
              className="rounded border-gray-300 text-brand-red focus:ring-brand-red/20"
            />
            Combined only
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

  if (loading && results.length === 0) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Assessment Results</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin 
              ? 'All employee assessment results with combined scores.' 
              : 'Your assessment history and development recommendations.'}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-semibold transition-colors ${
              showFilters 
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
            disabled={exporting || results.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> 
            {exporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && <FilterPanel />}

      {/* Results Stats */}
      {allResults.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{results.length}</span> of{' '}
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

      {/* Results Table */}
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
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Assessment</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Score Details</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Final Score</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Level</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Recommendation</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                {isAdmin && <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>}
                {isAdmin && <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 12 : 9} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <TrendingUp className="w-12 h-12 text-gray-300 mb-3" />
                      <p className="text-gray-500 text-sm font-medium">No results found</p>
                      <p className="text-gray-400 text-xs mt-1">
                        {Object.values(filters).some(v => v && v !== '')
                          ? 'Try adjusting your filters'
                          : 'Complete an assessment to see your results here.'}
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
                results.map((result) => (
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
                      <div className="text-sm text-gray-700 max-w-xs truncate" title={result.assessmentDescription}>
                        {result.assessmentDescription}
                      </div>
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
                      <ScoreDetails result={result} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-16">
                          <div className="progress-bar">
                            <div 
                              className={`progress-fill ${
                                result.assessmentType === 'Combined' ? 'bg-purple-600' : 'bg-brand-red'
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
                      {result.recommendation ? (
                        <div className="text-sm text-gray-700 max-w-xs">
                          <p className="line-clamp-2" title={result.recommendation}>
                            {result.recommendation}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
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

      {/* Pagination */}
      {pagination.total > pagination.limit && (
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
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      pagination.page === pageNum
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

      {/* Summary Cards for Non-Admin */}
      {allResults.length > 0 && !isAdmin && (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Total Assessments</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{allResults.length}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Combined Assessments</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {allResults.filter(r => r.isCombined).length}
                </p>
              </div>
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <Scale className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Average Score</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {allResults.length > 0 
                    ? Math.round(allResults.reduce((acc, r) => acc + r.finalScore, 0) / allResults.length)
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
                  {allResults.filter(r => r.level === 'Expert').length}
                </p>
              </div>
              <div className="w-10 h-10 bg-brand-red-muted rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-brand-red" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}