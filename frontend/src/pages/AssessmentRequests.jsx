import { useState, useEffect, useCallback } from 'react';
import { Inbox, Link2, Check, Clock, RefreshCw, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, X } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

const STATUS_OPTIONS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SYNCED'];

const STATUS_BADGE = {
  PENDING:     'bg-gray-100 text-gray-600 border-gray-300',
  IN_PROGRESS: 'bg-gray-200 text-gray-800 border-gray-400',
  COMPLETED:   'bg-brand-black text-white border-brand-black',
  SYNCED:      'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_ICON = {
  PENDING:     Clock,
  IN_PROGRESS: RefreshCw,
  COMPLETED:   Check,
  SYNCED:      Check,
};

export default function AssessmentRequests() {
  const { show } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [expandedResults, setExpandedResults] = useState({});
  const [loadingResults, setLoadingResults] = useState({});
  const [markingComplete, setMarkingComplete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (reqId) => {
    if (!window.confirm('Are you sure you want to delete this assessment request?')) return;
    setDeletingId(reqId);
    try {
      await api.delete(`/external/assessment-requests/${reqId}`);
      show('Assessment request deleted successfully.', 'success');
      loadRequests();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to delete request.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter ? `?status=${filter}` : '';
      const res = await api.get(`/external/assessment-requests${params}`);
      setRequests(res.data?.data?.requests || []);
    } catch (err) {
      show('Failed to load requests.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, show]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const toggleExpand = async (reqId) => {
    if (expandedId === reqId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(reqId);

    // Fetch read-only results for this request if not already loaded
    if (!expandedResults[reqId]) {
      setLoadingResults(prev => ({ ...prev, [reqId]: true }));
      try {
        const res = await api.get(`/external/assessment-requests/${reqId}/user-results`);
        setExpandedResults(prev => ({ ...prev, [reqId]: res.data?.data?.assessments || [] }));
      } catch {
        setExpandedResults(prev => ({ ...prev, [reqId]: [] }));
      } finally {
        setLoadingResults(prev => ({ ...prev, [reqId]: false }));
      }
    }
  };

  const handleMarkComplete = async (reqId) => {
    setMarkingComplete(reqId);
    try {
      const { data } = await api.patch(`/external/assessment-requests/${reqId}/mark-complete`);
      show(data?.data?.message || 'Request marked as completed!', 'success');
      setExpandedId(null);
      setExpandedResults(prev => { const n = { ...prev }; delete n[reqId]; return n; });
      loadRequests();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to mark as completed.', 'error');
    } finally {
      setMarkingComplete(null);
    }
  };

  const [linkingUser, setLinkingUser] = useState(null);

  const handleLinkUser = async (reqId) => {
    setLinkingUser(reqId);
    try {
      const { data } = await api.post(`/external/assessment-requests/${reqId}/link-user`);
      show(data.message || 'User linked successfully!', 'success');
      loadRequests();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to link user.', 'error');
    } finally {
      setLinkingUser(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'PENDING' || r.status === 'IN_PROGRESS').length;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-7">
      {/* Header */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl  font-bold text-brand-black">Assessment Requests</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 bg-gray-200 text-gray-700 rounded-full text-xs font-bold border border-gray-300">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
        <button
          onClick={loadRequests}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg font-medium text-sm text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-shrink-0 flex-wrap">
        <button
          onClick={() => setFilter('')}
          className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
            filter === '' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >All</button>
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
              filter === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >{s.replace('_', ' ')}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No assessment requests found</p>
            <p className="text-gray-300 text-sm mt-1">Requests from ZB Succession Planning will appear here</p>
          </div>
        ) : (
          requests.map(req => {
            const SIcon = STATUS_ICON[req.status] || Clock;
            const isExpanded = expandedId === req._id;
            const results = expandedResults[req._id] || [];
            const isLoadingRes = loadingResults[req._id];
            const canMarkComplete = req.status !== 'SYNCED' && req.status !== 'COMPLETED';

            return (
              <div key={req._id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-bold text-base text-gray-900">{req.employeeName}</span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${STATUS_BADGE[req.status]}`}>
                          <SIcon className="w-3 h-3" />
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">
                        {req.employeeEmail} · Position: <strong className="text-gray-700">{req.positionTitle}</strong>
                      </p>

                      {/* Competencies */}
                      {req.competencies?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {req.competencies.map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium border border-gray-200">
                              {c.name} <span className="text-gray-500">{c.targetGroup ? c.targetGroup.replace(/_/g, ' ') : 'Common'}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Linked user info */}
                      {req.linkedUserId && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-700 bg-gray-100 px-2.5 py-1.5 rounded-lg inline-flex border border-gray-200">
                          <Link2 className="w-3 h-3" />
                          Linked to: {req.linkedUserId?.name || 'User'} ({req.linkedUserId?.email || 'N/A'})
                          {req.linkedAssessmentIds?.length > 0 && (
                            <span className="ml-1 font-bold">· {req.linkedAssessmentIds.length} assessment{req.linkedAssessmentIds.length !== 1 ? 's' : ''} assigned</span>
                          )}
                        </div>
                      )}

                      {/* Warning if no linked user */}
                      {!req.linkedUserId && (
                        <div className="mt-2 flex items-center justify-between gap-4 text-xs text-gray-700 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>
                              No matching ZB CAS user found for <strong className="ml-1">{req.employeeEmail}</strong>. Create the user first.
                            </span>
                          </div>
                          <button
                            onClick={() => handleLinkUser(req._id)}
                            disabled={linkingUser === req._id}
                            className="px-3 py-1.5 bg-brand-black hover:bg-gray-800 text-white rounded-md font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0 shadow-sm"
                          >
                            {linkingUser === req._id ? (
                              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Linking...</>
                            ) : (
                              <><Link2 className="w-3.5 h-3.5" /> Link User</>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">
                        {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>

                      {/* Mark Completed / Update Results button */}
                      {req.linkedUserId && (
                        <button
                          onClick={() => handleMarkComplete(req._id)}
                          disabled={markingComplete === req._id}
                          className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm ${
                            (req.status === 'COMPLETED' || req.status === 'SYNCED')
                              ? 'bg-brand-black hover:bg-gray-800' // Black for update
                              : 'bg-brand-black hover:bg-gray-800' // Black for first complete
                          }`}
                        >
                          {markingComplete === req._id ? (
                            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {(req.status === 'COMPLETED' || req.status === 'SYNCED') ? 'Updating...' : 'Completing...'}</>
                          ) : (
                            <><CheckCircle2 className="w-3.5 h-3.5" /> {(req.status === 'COMPLETED' || req.status === 'SYNCED') ? 'Update Results' : 'Mark Completed'}</>
                          )}
                        </button>
                      )}

                      {/* Completed / Synced badge */}
                      {req.status === 'COMPLETED' && (
                        <span className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300 rounded-lg flex items-center gap-1">
                          <Check className="w-3 h-3" /> Ready to Sync in ZB SP
                        </span>
                      )}
                      
                      {req.status === 'SYNCED' && (
                        <span className="px-3 py-1.5 text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200 rounded-lg flex items-center gap-1">
                          <Check className="w-3 h-3" /> Synced to ZB SP
                        </span>
                      )}

                      {/* Expand/Collapse and Delete */}
                      <div className="flex items-center gap-2 mt-1">
                        {req.linkedUserId && (
                          <button
                            onClick={() => toggleExpand(req._id)}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1.5 text-gray-600"
                          >
                            {isExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide Results</> : <><ChevronDown className="w-3.5 h-3.5" /> View Results</>}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(req._id)}
                          disabled={deletingId === req._id}
                          className="px-3 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {deletingId === req._id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expandable: Read-only list of submitted assessment results */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5">
                    <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-black" />
                      Submitted Assessment Results
                    </p>

                    {isLoadingRes ? (
                      <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                        <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                        Loading results…
                      </div>
                    ) : results.length === 0 ? (
                      <div className="px-3 py-3 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-700">
                        <Clock className="w-3.5 h-3.5 inline mr-1" />
                        The employee hasn't submitted any assessment results yet.
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                        {results.map(a => (
                          <div key={a._id} className="flex items-center justify-between px-4 py-3 bg-white">
                            <div>
                              <span className="text-sm font-medium text-gray-900">{a.competencyName}</span>
                              {a.category && <span className="text-xs text-gray-400 ml-2">{a.category}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              {a.finalScore != null && (
                                <span className="text-xs font-bold text-gray-700">Score: {a.finalScore}%</span>
                              )}
                              {a.level && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 font-medium">{a.level}</span>
                              )}
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                a.status === 'COMPLETED' || a.status === 'ARCHIVED'
                                  ? 'bg-brand-black text-white'
                                  : 'bg-gray-200 text-gray-700'
                              }`}>
                                {a.status}
                              </span>
                              <Check className="w-4 h-4 text-gray-700" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
