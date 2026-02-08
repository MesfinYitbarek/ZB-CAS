import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BarChart3, TrendingUp, Award, Download, Users, Target, TrendingDown, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import api from '../utils/api';

export default function TeamReports() {
  const { user } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamResults, setTeamResults] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [stats, setStats] = useState({
    teamSize: 0,
    avgScore: 0,
    topPerformer: null,
    bottomPerformer: null,
    completionRate: 0,
  });

  const LEVEL_COLORS = {
    Basic: '#F59E0B',
    Intermediate: '#EA580C',
    Advanced: '#2563EB',
    Expert: '#16A34A',
  };

  const TYPE_COLORS = {
    SelfAssessment: '#3B82F6',
    SupervisorOnly: '#10B981',
    Combined: '#8B5CF6',
  };

  useEffect(() => {
    loadTeamReports();
  }, []);

  useEffect(() => {
    if (teamResults.length > 0) {
      calculateStats();
    }
  }, [teamResults, filterType]);

  const loadTeamReports = async () => {
    try {
      // Get supervisor's team members
      const teamRes = await api.get('/users/team-members');
      const team = teamRes.data.data.teamMembers || [];
      setTeamMembers(team);

      // Get all results for team members
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
              employeeId: member._id,
              employeeName: member.name,
              employeePosition: member.position,
              scoreBreakdown
            });
          });
        } catch (err) {
          console.warn(`No results for ${member.name}:`, err.message);
        }
      }

      setTeamResults(allResults);
    } catch (err) {
      console.error('Error loading team reports:', err);
      show('Failed to load team reports.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const filteredResults = applyFilters(teamResults);
    
    if (filteredResults.length === 0) {
      setStats({
        teamSize: teamMembers.length,
        avgScore: 0,
        topPerformer: null,
        bottomPerformer: null,
        completionRate: 0,
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
    
    const bottomPerformer = employeeAvgs.length > 0
      ? employeeAvgs.reduce((min, e) => (e.avg < min.avg ? e : min), employeeAvgs[0])
      : null;

    // Calculate completion rate (employees with at least one result)
    const employeesWithResults = new Set(filteredResults.map(r => r.employeeId));
    const completionRate = Math.round((employeesWithResults.size / teamMembers.length) * 100);

    setStats({ 
      teamSize: teamMembers.length,
      avgScore, 
      topPerformer, 
      bottomPerformer,
      completionRate
    });
  };

  const applyFilters = (results) => {
    if (!filterType) return results;
    return results.filter(r => r.assessmentId?.type === filterType);
  };

  const getPerformanceLevelData = () => {
    const filteredResults = applyFilters(teamResults);
    
    const levelCounts = filteredResults.reduce((acc, r) => {
      acc[r.level] = (acc[r.level] || 0) + 1;
      return acc;
    }, { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 });

    return Object.entries(levelCounts)
      .filter(([_, count]) => count > 0)
      .map(([level, count]) => ({
        name: level,
        value: count,
        color: LEVEL_COLORS[level]
      }));
  };

  const getAssessmentTypeData = () => {
    const filteredResults = applyFilters(teamResults);
    
    const typeCounts = filteredResults.reduce((acc, r) => {
      const type = r.assessmentId?.type || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(typeCounts)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => ({
        name: type,
        value: count,
        color: TYPE_COLORS[type] || '#94A3B8'
      }));
  };

  const getCompetencyPerformanceData = () => {
    const filteredResults = applyFilters(teamResults);
    
    const competencyMap = {};
    filteredResults.forEach(r => {
      const compName = r.competencyId?.name || 'Unknown';
      if (!competencyMap[compName]) {
        competencyMap[compName] = [];
      }
      competencyMap[compName].push(r.finalScore);
    });

    return Object.entries(competencyMap)
      .map(([name, scores]) => ({
        name,
        average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 10); // Top 10 competencies
  };

  const getTopPerformers = (count = 5) => {
    const filteredResults = applyFilters(teamResults);
    
    const employeeMap = {};
    filteredResults.forEach(r => {
      if (!employeeMap[r.employeeId]) {
        employeeMap[r.employeeId] = {
          id: r.employeeId,
          name: r.employeeName,
          position: r.employeePosition,
          scores: [],
          assessments: []
        };
      }
      employeeMap[r.employeeId].scores.push(r.finalScore);
      employeeMap[r.employeeId].assessments.push({
        competency: r.competencyId?.name,
        score: r.finalScore,
        type: r.assessmentId?.type
      });
    });

    return Object.values(employeeMap)
      .map(e => ({
        ...e,
        avg: Math.round(e.scores.reduce((a, b) => a + b, 0) / e.scores.length)
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, count);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const performanceLevelData = getPerformanceLevelData();
  const assessmentTypeData = getAssessmentTypeData();
  const competencyData = getCompetencyPerformanceData();
  const topPerformers = getTopPerformers(5);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-card p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-brand-black mb-2">
                Team Performance Analytics
              </h1>
              <p className="text-gray-600">
                Detailed insights and analytics for your team's performance
              </p>
            </div>
            
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterType('')}
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                  filterType === '' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                All Types
              </button>
              <button
                onClick={() => setFilterType('SelfAssessment')}
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                  filterType === 'SelfAssessment' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Self Assessments
              </button>
              <button
                onClick={() => setFilterType('SupervisorOnly')}
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                  filterType === 'SupervisorOnly' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Supervisor Evaluations
              </button>
              <button
                onClick={() => setFilterType('Combined')}
                className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                  filterType === 'Combined' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Combined
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-brand-black">{stats.teamSize}</div>
                  <div className="text-sm font-medium text-blue-700">Team Members</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Award className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-brand-black">{stats.avgScore}%</div>
                  <div className="text-sm font-medium text-green-700">Average Score</div>
                  <div className="text-xs text-green-600">
                    {teamResults.length} total results
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-lg font-bold text-brand-black truncate">
                    {stats.topPerformer?.name || '—'}
                  </div>
                  <div className="text-sm font-medium text-purple-700">Top Performer</div>
                  {stats.topPerformer && (
                    <div className="text-xs text-purple-600">{stats.topPerformer.avg}% avg</div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-orange-50 to-red-50 p-4 rounded-xl border border-orange-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-lg font-bold text-brand-black truncate">
                    {stats.bottomPerformer?.name || '—'}
                  </div>
                  <div className="text-sm font-medium text-orange-700">Needs Support</div>
                  {stats.bottomPerformer && (
                    <div className="text-xs text-orange-600">{stats.bottomPerformer.avg}% avg</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Filter Status */}
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
            Showing {applyFilters(teamResults).length} results 
            {filterType && ` for ${filterType} assessments`}
            {!filterType && ' across all assessment types'}
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Performance Level Distribution */}
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-bold text-brand-black mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Performance Level Distribution
            </h3>
            {performanceLevelData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={performanceLevelData}>
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12, fontWeight: 500 }}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => [`${value} results`, 'Count']}
                      labelFormatter={(label) => `Level: ${label}`}
                      contentStyle={{ 
                        borderRadius: 8, 
                        border: 'none', 
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {performanceLevelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-4">
                  {performanceLevelData.map(item => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-medium text-gray-700">{item.name}</span>
                      <span className="text-sm text-gray-500">({item.value})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <BarChart3 className="w-16 h-16 mb-2" />
                <p>No performance data available for selected filters</p>
              </div>
            )}
          </div>

          {/* Assessment Type Breakdown */}
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-bold text-brand-black mb-4">
              Assessment Type Breakdown
            </h3>
            {assessmentTypeData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={assessmentTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {assessmentTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => [`${value} results`, 'Count']}
                      contentStyle={{ 
                        borderRadius: 8, 
                        border: 'none', 
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-4">
                  {assessmentTypeData.map(item => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-medium text-gray-700">{item.name}</span>
                      <span className="text-sm text-gray-500">({item.value})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <Target className="w-16 h-16 mb-2" />
                <p>No assessment data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Competency Performance */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100 mb-6">
          <h3 className="text-lg font-bold text-brand-black mb-4">
            Competency Performance
          </h3>
          {competencyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={competencyData} layout="vertical">
                <XAxis 
                  type="number" 
                  domain={[0, 100]} 
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Average Score (%)', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={150} 
                  tick={{ fontSize: 11 }} 
                />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'average') return [`${value}%`, 'Average Score'];
                    return [value, 'Assessment Count'];
                  }}
                  contentStyle={{ 
                    borderRadius: 8, 
                    border: 'none', 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="average" 
                  name="Average Score" 
                  fill="#C8102E" 
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <TrendingUp className="w-16 h-16 mb-2" />
              <p>No competency performance data available</p>
            </div>
          )}
        </div>

        {/* Insights Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top Performers */}
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-bold text-brand-black mb-4">Top Performers</h3>
            {topPerformers.length > 0 ? (
              <div className="space-y-3">
                {topPerformers.map((member, index) => (
                  <div key={member.id} className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      index === 0 ? 'bg-yellow-500' : 
                      index === 1 ? 'bg-gray-400' : 
                      index === 2 ? 'bg-orange-600' : 
                      'bg-brand-red'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-brand-black truncate">
                        {member.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {member.position || 'Team Member'}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-600">
                          {member.assessments.length} assessments
                        </span>
                        {member.assessments.some(a => a.type === 'Combined') && (
                          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                            Combined
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-brand-red">
                        {member.avg}%
                      </div>
                      <div className="text-xs text-gray-500">
                        Average
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Award className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No performance data available</p>
              </div>
            )}
          </div>

          {/* Performance Insights */}
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-bold text-brand-black mb-4">Performance Insights</h3>
            
            <div className="space-y-4">
              {/* Completion Rate */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-gray-700">Assessment Completion</span>
                  <span className="text-sm font-bold text-brand-red">{stats.completionRate}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${stats.completionRate}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Set(teamResults.map(r => r.employeeId)).size} of {teamMembers.length} team members have assessments
                </div>
              </div>

              {/* Score Distribution */}
              {teamResults.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">Score Distribution</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-red-50 p-3 rounded-lg text-center">
                      <div className="text-lg font-bold text-red-600">
                        {teamResults.filter(r => r.finalScore < 60).length}
                      </div>
                      <div className="text-xs text-red-700">Below 60%</div>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded-lg text-center">
                      <div className="text-lg font-bold text-yellow-600">
                        {teamResults.filter(r => r.finalScore >= 60 && r.finalScore < 80).length}
                      </div>
                      <div className="text-xs text-yellow-700">60-79%</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg text-center">
                      <div className="text-lg font-bold text-green-600">
                        {teamResults.filter(r => r.finalScore >= 80).length}
                      </div>
                      <div className="text-xs text-green-700">80%+</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Assessment Types Summary */}
              {assessmentTypeData.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">Assessment Types</div>
                  <div className="space-y-2">
                    {assessmentTypeData.map(type => (
                      <div key={type.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: type.color }}
                          />
                          <span className="text-sm text-gray-700">{type.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{type.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team Average Trend */}
              {teamResults.length > 5 && (
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-semibold text-gray-700">Team Average Trend</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Team average is <span className="font-bold text-green-600">{stats.avgScore}%</span>, 
                    which is {stats.avgScore >= 70 ? 'above' : 'below'} the 70% performance threshold
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}