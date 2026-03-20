import { useState, useEffect, useCallback } from 'react';
import { Inbox, Link2, Check, Clock, RefreshCw, AlertCircle, X, Layers } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

const STATUS_OPTIONS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SYNCED'];

const STATUS_BADGE = {
  PENDING:     'bg-yellow-100 text-yellow-800 border-yellow-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED:   'bg-green-100 text-green-800 border-green-200',
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
  const [linkingId, setLinkingId] = useState(null);
  const [linkStatus, setLinkStatus] = useState('IN_PROGRESS');
  const [matchedUser, setMatchedUser] = useState(null);
  const [userAssessments, setUserAssessments] = useState([]);
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [creatingCompsId, setCreatingCompsId] = useState(null);
  const [loadingPanel, setLoadingPanel] = useState(false);

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

  const openLinkPanel = async (reqId) => {
    setLinkingId(reqId);
    setMatchedUser(null);
    setUserAssessments([]);
    setSelectedAssessmentIds([]);
    setLinkStatus('IN_PROGRESS');
    setLoadingPanel(true);
    try {
      const req = requests.find(r => r._id === reqId);

      // Step 1: Auto-match user by email
      const usersRes = await api.get('/users?limit=200');
      const allUsers = usersRes.data?.data?.users || [];
      const matched = req?.employeeEmail
        ? allUsers.find(u => u.email?.toLowerCase() === req.employeeEmail.toLowerCase())
        : null;

      setMatchedUser(matched || null);

      if (matched) {
        // Auto-link the user first if not already linked
        if (!req.linkedUserId) {
          await api.patch(`/external/assessment-requests/${reqId}`, { linkedUserId: matched._id });
        }

        // Step 2: Fetch assessments where user has completed results
        const resultsRes = await api.get(`/external/assessment-requests/${reqId}/user-results`);
        setUserAssessments(resultsRes.data?.data?.assessments || []);
      }
    } catch (err) {
      show('Failed to load data.', 'error');
    } finally {
      setLoadingPanel(false);
    }
  };

  const handleLink = async (reqId) => {
    if (selectedAssessmentIds.length === 0) {
      show('Select at least one assessment to link.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/external/assessment-requests/${reqId}`, {
        linkedAssessmentIds: selectedAssessmentIds,
        status: linkStatus,
      });
      show('Request linked successfully!', 'success');
      setLinkingId(null);
      loadRequests();
    } catch (err) {
      show('Failed to link: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCompetencies = async (reqId) => {
    setCreatingCompsId(reqId);
    try {
      const { data } = await api.post(`/external/assessment-requests/${reqId}/create-competencies`);
      const result = data?.data;
      show(result?.message || 'Competencies created!', 'success');
      loadRequests();
    } catch (err) {
      show('Failed to create competencies: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setCreatingCompsId(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'PENDING' || r.status === 'IN_PROGRESS').length;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-7">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-brand-black">Assessment Requests</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold border border-orange-200">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">Incoming assessment requests from ZB Succession Planning</p>
        </div>
        <button
          onClick={loadRequests}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg font-medium text-sm text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
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
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
                              {c.name} <span className="text-blue-400">Lvl {c.requiredLevel}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Linked info */}
                      {req.linkedUserId && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg inline-flex border border-green-100">
                          <Link2 className="w-3 h-3" />
                          Linked to: {req.linkedUserId?.name || 'User'} ({req.linkedUserId?.email || 'N/A'})
                          {req.linkedAssessmentIds?.length > 0 && (
                            <span className="ml-1 font-bold">· {req.linkedAssessmentIds.length} assessment{req.linkedAssessmentIds.length !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">
                        {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {req.competencies?.length > 0 && (
                        <button
                          onClick={() => handleCreateCompetencies(req._id)}
                          disabled={creatingCompsId === req._id}
                          className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                        >
                          {creatingCompsId === req._id ? (
                            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                          ) : (
                            <><Layers className="w-3.5 h-3.5" /> Create Competencies</>
                          )}
                        </button>
                      )}
                      {req.status !== 'SYNCED' && (
                        <button
                          onClick={() => linkingId === req._id ? setLinkingId(null) : openLinkPanel(req._id)}
                          className="px-4 py-2 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-opacity-90 transition-colors flex items-center gap-1.5"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          {linkingId === req._id ? 'Cancel' : 'Link & Process'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Link Panel */}
                {linkingId === req._id && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-brand-red" />
                      <p className="text-sm font-semibold text-gray-800">
                        Link: {req.employeeName} — {req.competencies?.map(c => c.name).join(', ') || 'Assessment'}
                      </p>
                    </div>

                    {loadingPanel ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="w-6 h-6 border-3 border-brand-red border-t-transparent rounded-full animate-spin" />
                        <span className="ml-2 text-sm text-gray-500">Loading user data…</span>
                      </div>
                    ) : (
                      <>
                        {/* Matched User */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Matched ZB CAS User</label>
                          {matchedUser ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg">
                              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <span className="text-sm font-medium text-green-800">{matchedUser.name}</span>
                              <span className="text-xs text-green-600">({matchedUser.email})</span>
                            </div>
                          ) : (
                            <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                              <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                              No matching user found for <strong>{req.employeeEmail}</strong>. Create the user in ZB CAS first.
                            </div>
                          )}
                        </div>

                        {/* Completed Assessments (Checkboxes) */}
                        {matchedUser && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">
                              Completed Assessments ({userAssessments.length})
                            </label>
                            {userAssessments.length === 0 ? (
                              <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                                <Clock className="w-3.5 h-3.5 inline mr-1" />
                                No completed assessments yet. The user hasn't finished any assessments.
                              </div>
                            ) : (
                              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                                {userAssessments.map(a => {
                                  const isLinked = a.alreadyLinked;
                                  const isSelected = selectedAssessmentIds.includes(a._id);
                                  return (
                                    <label
                                      key={a._id}
                                      className={`flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer ${
                                        isLinked ? 'bg-gray-50 opacity-60 cursor-default' : isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isLinked || isSelected}
                                        disabled={isLinked}
                                        onChange={(e) => {
                                          if (isLinked) return;
                                          setSelectedAssessmentIds(prev =>
                                            e.target.checked
                                              ? [...prev, a._id]
                                              : prev.filter(id => id !== a._id)
                                          );
                                        }}
                                        className="rounded text-brand-red focus:ring-brand-red w-4 h-4"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium text-gray-900">{a.competencyName}</span>
                                        {a.category && (
                                          <span className="text-xs text-gray-400 ml-2">{a.category}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                          a.status === 'COMPLETED' || a.status === 'ARCHIVED'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-blue-100 text-blue-700'
                                        }`}>
                                          {a.status}
                                        </span>
                                        {isLinked && (
                                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                                            ✓ Sent
                                          </span>
                                        )}
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Status + Actions */}
                        {matchedUser && userAssessments.length > 0 && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Update Status</label>
                              <select
                                value={linkStatus}
                                onChange={e => setLinkStatus(e.target.value)}
                                className="w-48 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-red focus:border-transparent"
                              >
                                <option value="PENDING">PENDING</option>
                                <option value="IN_PROGRESS">IN PROGRESS</option>
                                <option value="COMPLETED">COMPLETED</option>
                              </select>
                            </div>

                            <div className="flex gap-3 pt-1">
                              <button
                                onClick={() => handleLink(req._id)}
                                disabled={saving || selectedAssessmentIds.length === 0}
                                className="px-5 py-2.5 text-sm font-semibold bg-brand-red text-white rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition-colors flex items-center gap-2"
                              >
                                {saving ? (
                                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                                ) : (
                                  <><Check className="w-3.5 h-3.5" /> Link {selectedAssessmentIds.length} Assessment{selectedAssessmentIds.length !== 1 ? 's' : ''}</>
                                )}
                              </button>
                              <button
                                onClick={() => setLinkingId(null)}
                                className="px-5 py-2.5 text-sm font-semibold bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                              >
                                <X className="w-3.5 h-3.5" /> Cancel
                              </button>
                            </div>
                          </>
                        )}
                      </>
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
