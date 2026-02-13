import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { 
  Award, 
  TrendingUp, 
  TrendingDown, 
  Download, 
  FileText,
  Users,
  Target,
  BarChart as BarChartIcon,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { exportToPDF, exportToExcel, generateFilename } from '../utils/exportUtils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import api from '../utils/api';

const LEVEL_COLORS = {
  Basic: '#F59E0B',
  Intermediate: '#EA580C',
  Advanced: '#2563EB',
  Expert: '#16A34A',
};

const ASSESSMENT_TYPE_COLORS = {
  SelfAssessment: '#3B82F6',
  SupervisorOnly: '#10B981',
  Combined: '#8B5CF6',
};

const ITEMS_PER_PAGE = 10;

export default function TeamResults() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();
  const [teamResults, setTeamResults] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    assessmentType: '',
    competencyId: '',
    level: '',
    status: ''
  });
  const [competencies, setCompetencies] = useState([]);
  const [stats, setStats] = useState({
    avgScore: 0,
    topPerformer: null,
    needsImprovement: [],
    byLevel: { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 },
    byType: { SelfAssessment: 0, SupervisorOnly: 0, Combined: 0 },
  });

  useEffect(() => {
    loadTeamData();
  }, []);

  useEffect(() => {
    if (teamResults.length > 0) {
      calculateStats();
    }
  }, [teamResults, filters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const loadTeamData = async () => {
    try {
      // Get supervisor's team members
      const teamRes = await api.get(`/users/supervisor/${user._id}/employees`);
      const team = teamRes.data.data.teamMembers || [];
      setTeamMembers(team);

      // Get all competencies for filter
      const compRes = await api.get('/competencies');
      setCompetencies(compRes.data.data.competencies || []);

      // Get results for all team members
      const allResults = [];
      
      for (const member of team) {
        try {
          const resultRes = await api.get(`/results/user/${member._id}`);
          const results = resultRes.data.data.results || [];
          
          results.forEach(r => {
            // Add score breakdown for combined assessments
            let scoreBreakdown = null;
            if (r.assessmentId?.type === 'Combined' && r.scoreBreakdown) {
              scoreBreakdown = r.scoreBreakdown;
            }
            
            allResults.push({
              ...r,
              employeeName: member.name,
              employeeId: member.employeeId || member._id,
              position: member.position,
              department: member.department,
              scoreBreakdown
            });
          });
        } catch (err) {
          console.warn(`No results for ${member.name}:`, err.message);
        }
      }

      setTeamResults(allResults);
    } catch (err) {
      console.error('Error loading team data:', err);
      show('Failed to load team results.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const filteredResults = applyFilters(teamResults);
    
    if (filteredResults.length === 0) {
      setStats({
        avgScore: 0,
        topPerformer: null,
        needsImprovement: [],
        byLevel: { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 },
        byType: { SelfAssessment: 0, SupervisorOnly: 0, Combined: 0 },
      });
      return;
    }

    // Calculate average score
    const avgScore = Math.round(
      filteredResults.reduce((sum, r) => sum + r.finalScore, 0) / filteredResults.length
    );

    // Group by employee and get their average
    const byEmployee = {};
    filteredResults.forEach(r => {
      if (!byEmployee[r.employeeId]) {
        byEmployee[r.employeeId] = {
          id: r.employeeId,
          name: r.employeeName,
          scores: [],
          count: 0
        };
      }
      byEmployee[r.employeeId].scores.push(r.finalScore);
      byEmployee[r.employeeId].count++;
    });

    const employeeAvgs = Object.values(byEmployee).map(e => ({
      id: e.id,
      name: e.name,
      avg: Math.round(e.scores.reduce((a, b) => a + b, 0) / e.scores.length),
      count: e.count
    }));

    const topPerformer = employeeAvgs.length > 0 
      ? employeeAvgs.reduce((max, e) => (e.avg > max.avg ? e : max), employeeAvgs[0])
      : null;
    
    const needsImprovement = employeeAvgs.filter(e => e.avg < 60);

    // Count by level
    const byLevel = filteredResults.reduce((acc, r) => {
      acc[r.level] = (acc[r.level] || 0) + 1;
      return acc;
    }, { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 });

    // Count by assessment type
    const byType = filteredResults.reduce((acc, r) => {
      const type = r.assessmentId?.type || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, { SelfAssessment: 0, SupervisorOnly: 0, Combined: 0 });

    setStats({ 
      avgScore, 
      topPerformer, 
      needsImprovement, 
      byLevel, 
      byType 
    });
  };

  const applyFilters = (results) => {
    return results.filter(r => {
      if (filters.assessmentType && r.assessmentId?.type !== filters.assessmentType) return false;
      if (filters.competencyId && r.competencyId?._id !== filters.competencyId) return false;
      if (filters.level && r.level !== filters.level) return false;
      if (filters.status && r.status !== filters.status) return false;
      return true;
    });
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const filteredResults = applyFilters(teamResults);
      
      const exportData = {
        type: 'team_results',
        supervisor: user,
        teamSize: teamMembers.length,
        stats: stats,
        results: filteredResults.map(r => ({
          employee: r.employeeName,
          position: r.position,
          competency: r.competencyId?.name,
          assessmentType: r.assessmentId?.type,
          score: r.finalScore,
          level: r.level,
          status: r.status,
          date: new Date(r.createdAt).toLocaleDateString(),
          ...(r.scoreBreakdown && {
            selfScore: r.scoreBreakdown.selfScore,
            supervisorScore: r.scoreBreakdown.supervisorScore,
            weight: `${r.scoreBreakdown.weight?.self || 0}/${r.scoreBreakdown.weight?.supervisor || 0}`
          })
        })),
      };
      
      await exportToPDF(exportData, generateFilename(`team_results_${user.department}_${Date.now()}`, 'pdf'));
      show('Team results exported to PDF!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      show('PDF export failed: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const filteredResults = applyFilters(teamResults);
      
      const exportData = {
        type: 'team_results',
        supervisor: user,
        teamSize: teamMembers.length,
        stats: stats,
        results: filteredResults.map(r => ({
          employee: r.employeeName,
          position: r.position,
          competency: r.competencyId?.name,
          assessmentType: r.assessmentId?.type,
          score: r.finalScore,
          level: r.level,
          status: r.status,
          date: new Date(r.createdAt).toLocaleDateString(),
          ...(r.scoreBreakdown && {
            selfScore: r.scoreBreakdown.selfScore,
            supervisorScore: r.scoreBreakdown.supervisorScore,
            weight: `${r.scoreBreakdown.weight?.self || 0}/${r.scoreBreakdown.weight?.supervisor || 0}`
          })
        })),
      };
      
      await exportToExcel(exportData, generateFilename(`team_results_${user.department}_${Date.now()}`, 'xlsx'));
      show('Team results exported to Excel!', 'success');
    } catch (err) {
      console.error('Excel export error:', err);
      show('Excel export failed: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      assessmentType: '',
      competencyId: '',
      level: '',
      status: ''
    });
  };

  // Pagination logic
  const filteredResults = applyFilters(teamResults);
  const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE);
  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Prepare chart data
  const levelChartData = Object.entries(stats.byLevel).map(([level, count]) => ({
    name: level,
    value: count,
    color: LEVEL_COLORS[level]
  })).filter(item => item.value > 0);

  const typeChartData = Object.entries(stats.byType).map(([type, count]) => ({
    name: type,
    value: count,
    color: ASSESSMENT_TYPE_COLORS[type]
  })).filter(item => item.value > 0);

  return (
    <div className="min-h-screen bg-gray-50 p-3 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header - Reduced padding */}
        <div className="bg-white rounded-lg shadow-card p-4 mb-3">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-brand-black">
                Team Performance Dashboard
              </h1>
              <p className="text-sm text-gray-600">
                Track and analyze performance metrics for your team
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={handleExportPDF} 
                disabled={exporting || filteredResults.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-brand-red text-brand-red rounded-lg font-semibold hover:bg-brand-red/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText className="w-4 h-4" /> 
                {exporting ? 'Exporting...' : 'PDF'}
              </button>
              <button 
                onClick={handleExportExcel} 
                disabled={exporting || filteredResults.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" /> 
                {exporting ? 'Exporting...' : 'Excel'}
              </button>
            </div>
          </div>

          {/* Team Overview Cards - More compact */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-brand-black">{teamMembers.length}</div>
                  <div className="text-xs font-medium text-blue-700 truncate">Team Members</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-lg border border-green-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Award className="w-4 h-4 text-green-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-brand-black">{stats.avgScore}%</div>
                  <div className="text-xs font-medium text-green-700 truncate">Average Score</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-3 rounded-lg border border-purple-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-brand-black truncate">
                    {stats.topPerformer?.name || '—'}
                  </div>
                  <div className="text-xs font-medium text-purple-700 truncate">
                    {stats.topPerformer ? `${stats.topPerformer.avg}% avg` : 'Top Performer'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-orange-50 to-red-50 p-3 rounded-lg border border-orange-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <TrendingDown className="w-4 h-4 text-orange-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-brand-black">{stats.needsImprovement.length}</div>
                  <div className="text-xs font-medium text-orange-700 truncate">Need Support</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters - More compact */}
        <div className="bg-white rounded-lg shadow-card p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-bold text-brand-black flex items-center gap-1.5">
              <Filter className="w-4 h-4" />
              Filters
            </h3>
            <button
              onClick={clearFilters}
              className="text-xs text-gray-600 hover:text-brand-red font-medium"
            >
              Clear All
            </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={filters.assessmentType}
                onChange={(e) => handleFilterChange('assessmentType', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent"
              >
                <option value="">All Types</option>
                <option value="SelfAssessment">Self</option>
                <option value="SupervisorOnly">Supervisor</option>
                <option value="Combined">Combined</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Competency</label>
              <select
                value={filters.competencyId}
                onChange={(e) => handleFilterChange('competencyId', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent"
              >
                <option value="">All</option>
                {competencies.map(comp => (
                  <option key={comp._id} value={comp._id}>
                    {comp.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Level</label>
              <select
                value={filters.level}
                onChange={(e) => handleFilterChange('level', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent"
              >
                <option value="">All Levels</option>
                <option value="Basic">Basic</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
                <option value="Expert">Expert</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent"
              >
                <option value="">All</option>
                <option value="FINAL">Final</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
          </div>
          
          <div className="mt-2 text-xs text-gray-500">
            Showing {paginatedResults.length} of {filteredResults.length} results
          </div>
        </div>

        {/* Charts Section - More compact */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          {/* Level Distribution */}
          <div className="bg-white rounded-lg p-4 shadow-card border border-gray-100">
            <h3 className="text-md font-bold text-brand-black mb-2 flex items-center gap-1.5">
              <BarChartIcon className="w-4 h-4" />
              Level Distribution
            </h3>
            {levelChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={levelChartData}>
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip 
                      formatter={(value) => [`${value} results`, 'Count']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {levelChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2">
                  {levelChartData.map(item => (
                    <div key={item.name} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-gray-600">
                        {item.name}: {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <BarChartIcon className="w-12 h-12 mb-1" />
                <p className="text-sm">No data available</p>
              </div>
            )}
          </div>

          {/* Assessment Type Distribution */}
          <div className="bg-white rounded-lg p-4 shadow-card border border-gray-100">
            <h3 className="text-md font-bold text-brand-black mb-2">
              Assessment Types
            </h3>
            {typeChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={typeChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={60}
                      dataKey="value"
                    >
                      {typeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => [`${value} results`, 'Count']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2">
                  {typeChartData.map(item => (
                    <div key={item.name} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-gray-700">{item.name}</span>
                      <span className="text-xs text-gray-500">({item.value})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <Target className="w-12 h-12 mb-1" />
                <p className="text-sm">No assessment data</p>
              </div>
            )}
          </div>
        </div>

        {/* Results Table - More compact */}
        <div className="bg-white rounded-lg shadow-card border border-gray-100 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-md font-bold text-brand-black">Detailed Results</h3>
              <span className="text-xs text-gray-500">
                {filteredResults.length} records
              </span>
            </div>
          </div>
          
          {filteredResults.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-2 text-gray-300">
                <Target className="w-full h-full" />
              </div>
              <h4 className="text-md font-semibold text-gray-600 mb-1">No Results Found</h4>
              <p className="text-gray-400 text-xs">
                {teamResults.length === 0 
                  ? 'No assessment results available for your team yet.'
                  : 'Try adjusting your filters to see more results.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Employee</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Competency</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Type</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Score</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Level</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedResults.map((result) => (
                      <tr 
                        key={result._id} 
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => nav(`/results/${result._id}`)}
                      >
                        <td className="px-3 py-2">
                          <div>
                            <div className="font-medium text-brand-black text-sm">
                              {result.employeeName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {result.position || 'Employee'}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {result.competencyId?.name || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            result.assessmentId?.type === 'SelfAssessment' 
                              ? 'bg-blue-100 text-blue-800'
                              : result.assessmentId?.type === 'SupervisorOnly'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {result.assessmentId?.type === 'SelfAssessment' ? 'Self' :
                             result.assessmentId?.type === 'SupervisorOnly' ? 'Sup.' : 'Comb.'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-20">
                              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-brand-red"
                                  style={{ width: `${result.finalScore}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs font-medium text-brand-black">
                              {result.finalScore}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            result.level === 'Basic' 
                              ? 'bg-yellow-100 text-yellow-800'
                              : result.level === 'Intermediate'
                              ? 'bg-orange-100 text-orange-800'
                              : result.level === 'Advanced'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {result.level}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {new Date(result.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination - New */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={i}
                          onClick={() => handlePageChange(pageNum)}
                          className={`w-7 h-7 text-xs rounded border ${
                            currentPage === pageNum
                              ? 'bg-brand-red text-white border-brand-red'
                              : 'border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}