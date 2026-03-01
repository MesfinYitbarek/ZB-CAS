import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Activity, User, ClipboardList, FileText, MessageSquare, Filter, Download } from 'lucide-react';
import { exportToExcel, generateFilename } from '../utils/exportUtils';
import api from '../utils/api';

export default function ActivityLog() {
  const { isAdmin } = useAuth();
  const { show } = useToast();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [users, setUsers] = useState([]);

  useEffect(() => {
    loadActivities();
    if (isAdmin) {
      api.get('/users').then(({ data }) => setUsers(data.data.users || [])).catch(() => {});
    }
  }, [filterType, filterUser]);

  const loadActivities = async () => {
    setLoading(true);
    try {
      // Fetch various activities from different endpoints
      const [assessments, results, feedback, usersData] = await Promise.all([
        api.get('/assessments'),
        api.get('/results'),
        api.get('/feedback'),
        isAdmin ? api.get('/users') : Promise.resolve({ data: { data: { users: [] } } }),
      ]);

      const logs = [];

      // Assessment activities
      (assessments.data.data.assessments || []).forEach(a => {
        logs.push({
          id: `assess-${a._id}`,
          type: 'assessment',
          action: a.status === 'DRAFT' ? 'created' : a.status === 'ACTIVE' ? 'activated' : 'updated',
          description: `Assessment "${a.description}" ${a.status.toLowerCase()}`,
          user: a.createdBy?.name || 'System',
          userId: a.createdBy?._id,
          timestamp: a.createdAt,
          metadata: { competency: a.competencyId?.name, type: a.type },
        });
      });

      // Result activities
      (results.data.data.results || []).forEach(r => {
        logs.push({
          id: `result-${r._id}`,
          type: 'result',
          action: r.status === 'FINAL' ? 'finalized' : 'generated',
          description: `Result ${r.status.toLowerCase()} for ${r.userId?.name}`,
          user: 'System',
          userId: r.userId?._id,
          timestamp: r.createdAt,
          metadata: { score: r.finalScore, level: r.level },
        });
      });

      // Feedback activities
      (feedback.data.data.feedbacks || []).forEach(f => {
        logs.push({
          id: `feedback-${f._id}`,
          type: 'feedback',
          action: f.reviewed ? 'reviewed' : 'submitted',
          description: `Feedback ${f.reviewed ? 'reviewed' : 'submitted'}`,
          user: f.userId?.name || 'Anonymous',
          userId: f.userId?._id,
          timestamp: f.createdAt,
          metadata: { rating: f.rating },
        });
      });

      // User activities (admin only)
      if (isAdmin) {
        (usersData.data.data.users || []).forEach(u => {
          logs.push({
            id: `user-${u._id}`,
            type: 'user',
            action: 'created',
            description: `User "${u.name}" registered`,
            user: 'System',
            userId: u._id,
            timestamp: u.createdAt,
            metadata: { role: u.role, department: u.department },
          });
        });
      }

      // Sort by timestamp (newest first)
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Apply filters
      let filtered = logs;
      if (filterType) {
        filtered = filtered.filter(l => l.type === filterType);
      }
      if (filterUser) {
        filtered = filtered.filter(l => l.userId === filterUser);
      }

      setActivities(filtered.slice(0, 100)); // Limit to 100 most recent
    } catch (_) {
      show('Failed to load activity log.', 'error');
    }
    setLoading(false);
  };

  const handleExport = async () => {
    try {
      const exportData = {
        type: 'activities',
        activities: activities.map(a => ({
          'Type': a.type,
          'Action': a.action,
          'Description': a.description,
          'User': a.user,
          'Date': new Date(a.timestamp).toLocaleString(),
          'Metadata': JSON.stringify(a.metadata),
        })),
      };

      await exportToExcel({ type: 'activities', activities: exportData.activities }, generateFilename('activity_log', 'xlsx'));
      show('Activity log exported successfully!', 'success');
    } catch (_) {
      show('Export failed.', 'error');
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'user': return User;
      case 'assessment': return ClipboardList;
      case 'result': return FileText;
      case 'feedback': return MessageSquare;
      default: return Activity;
    }
  };

  const getColor = (type) => {
    switch (type) {
      case 'user': return 'text-blue-600 bg-blue-100';
      case 'assessment': return 'text-brand-red bg-brand-red/10';
      case 'result': return 'text-green-600 bg-green-100';
      case 'feedback': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-7">
      {/* Sticky Header */}
      <div className="flex justify-between items-start mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Activity Log</h1>
          <p className="text-gray-500 mt-1">System-wide activity tracking and audit trail</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
          <Download className="w-4 h-4" /> Export Log
        </button>
      </div>

      {/* Sticky Filters */}
      <div className="flex gap-3 mb-6 flex-shrink-0">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
          <option value="">All Types</option>
          <option value="user">User Activities</option>
          <option value="assessment">Assessments</option>
          <option value="result">Results</option>
          <option value="feedback">Feedback</option>
        </select>

        {isAdmin && (
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm w-48">
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u._id} value={u._id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Scrollable Activity Timeline */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white rounded-xl shadow-card border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activities.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-semibold">No activities found</h3>
              </div>
            ) : (
              activities.map((activity) => {
                const Icon = getIcon(activity.type);
                const colorClass = getColor(activity.type);

                return (
                  <div key={activity.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm text-brand-black">{activity.description}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${colorClass}`}>
                            {activity.action}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>{activity.user}</span>
                          <span>•</span>
                          <span>{new Date(activity.timestamp).toLocaleString()}</span>
                          {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-gray-400">
                                {Object.entries(activity.metadata).map(([k, v]) => `${k}: ${v}`).join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
