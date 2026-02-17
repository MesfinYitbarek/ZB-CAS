import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Plus, Star, CheckCircle2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import Modal from '../components/Modal';
import api from '../utils/api';

export default function Feedback() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState([]);
  const [modal, setModal] = useState(false);
  const [filterReviewed, setFilterReviewed] = useState('');
  
  // New state for assessment filter (admin only)
  const [selectedAssessment, setSelectedAssessment] = useState('');
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  const initForm = () => ({ assessmentId: '', content: '', rating: 0 });
  const [form, setForm] = useState(initForm());

  // Fetch assessments for filter dropdown
  useEffect(() => {
    api.get('/assessments').then(({ data }) => setAssessments(data.data.assessments)).catch(() => {});
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      
      // Add filters
      if (filterReviewed !== '') params.reviewed = filterReviewed;
      
      // Add assessment filter for admin
      if (isAdmin && selectedAssessment) {
        params.assessmentId = selectedAssessment;
      }
      
      const { data } = await api.get('/feedback', { params });
      setItems(data.data.feedbacks);
      
      // Update pagination from API response
      if (data.data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit)
        }));
      }
    } catch (_) {
      show('Failed to load feedback.', 'error');
    }
    setLoading(false);
  }, [filterReviewed, selectedAssessment, pagination.page, pagination.limit, isAdmin]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleSubmit = async () => {
    if (!form.assessmentId || !form.content) return show('Assessment and content are required.', 'error');
    try {
      await api.post('/feedback', form);
      show('Feedback submitted.', 'success');
      setModal(false);
      setForm(initForm());
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  const reviewItem = async (id) => {
    try {
      await api.patch(`/feedback/${id}/review`);
      show('Marked as reviewed.', 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  // Pagination handlers
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

  // Handle filter changes
  const handleFilterChange = (value) => {
    setFilterReviewed(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Handle assessment filter change (admin)
  const handleAssessmentFilterChange = (e) => {
    setSelectedAssessment(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Clear all filters (admin)
  const clearFilters = () => {
    setFilterReviewed('');
    setSelectedAssessment('');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const StarRating = ({ value, onChange }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          onClick={() => onChange && onChange(v)}
          className={`${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
          type="button"
        >
          <Star className="w-5 h-5" fill={value >= v ? '#EA580C' : 'none'} color={value >= v ? '#EA580C' : '#D1D5DB'} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Feedback</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin ? 'Filter and review employee feedback by assessment.' : 'Share your feedback on assessments.'}
          </p>
        </div>
        {!isAdmin && (
          <button
            onClick={() => {
              setForm(initForm());
              setModal(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Submit Feedback
          </button>
        )}
      </div>

      {/* Filters (admin) */}
      {isAdmin && (
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-brand-red" />
            <h3 className="font-semibold text-brand-black">Filter Feedback</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Assessment Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Filter by Assessment
              </label>
              <select
                value={selectedAssessment}
                onChange={handleAssessmentFilterChange}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              >
                <option value="">All Assessments</option>
                {assessments.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.description || 'Assessment'} {a.competencyId?.name ? `(${a.competencyId.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Review Status Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Filter by Status
              </label>
              <div className="flex gap-2">
                {[
                  ['', 'All'],
                  ['false', 'Pending'],
                  ['true', 'Reviewed'],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => handleFilterChange(val)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                      filterReviewed === val 
                        ? 'border-brand-red bg-brand-red/10 text-brand-red' 
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters & Page Size */}
            <div className="flex items-end justify-end gap-3">
              {(selectedAssessment || filterReviewed !== '') && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-brand-red transition-colors"
                >
                  Clear Filters
                </button>
              )}
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Show:</span>
                <select 
                  value={pagination.limit} 
                  onChange={handlePageSizeChange}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
                >
                  <option value="5">5 per page</option>
                  <option value="10">10 per page</option>
                  <option value="20">20 per page</option>
                  <option value="50">50 per page</option>
                </select>
              </div>
            </div>
          </div>

          {/* Active Filters Display */}
          {(selectedAssessment || filterReviewed !== '') && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Active filters:</span>
              {selectedAssessment && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-red/10 text-brand-red rounded-full text-sm">
                  Assessment: {assessments.find(a => a._id === selectedAssessment)?.description || 'Selected'}
                  <button 
                    onClick={() => setSelectedAssessment('')}
                    className="ml-1 hover:text-brand-red-dark"
                  >
                    ×
                  </button>
                </span>
              )}
              {filterReviewed !== '' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-red/10 text-brand-red rounded-full text-sm">
                  Status: {filterReviewed === 'true' ? 'Reviewed' : 'Pending'}
                  <button 
                    onClick={() => setFilterReviewed('')}
                    className="ml-1 hover:text-brand-red-dark"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Feedback cards with pagination info */}
      {loading ? (
        <div className="flex items-center justify-center p-16">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Pagination info */}
          {items.length > 0 && (
            <div className="text-sm text-gray-600 mb-3">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} feedback entries
            </div>
          )}
          
          <div className="space-y-3 mb-6">
            {items.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <h3 className="text-lg font-semibold">No feedback found.</h3>
                <p className="text-sm mt-2">
                  {selectedAssessment || filterReviewed !== '' 
                    ? 'Try adjusting your filters' 
                    : 'Be the first to submit feedback!'}
                </p>
              </div>
            )}
            {items.map((f) => (
              <div key={f._id} className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="font-semibold text-sm text-brand-black">{f.userId?.name || 'Anonymous'}</span>
                    <span className="text-xs text-gray-400 ml-3">{new Date(f.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {f.reviewed && <span className="badge badge-active">Reviewed</span>}
                    {isAdmin && !f.reviewed && (
                      <button 
                        onClick={() => reviewItem(f._id)} 
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Mark Reviewed
                      </button>
                    )}
                  </div>
                </div>
                {f.rating > 0 && (
                  <div className="mb-2">
                    <StarRating value={f.rating} />
                  </div>
                )}
                <p className="text-sm text-gray-700 leading-relaxed mb-2">{f.content}</p>
                <p className="text-xs text-gray-400">
                  Assessment: {f.assessmentId?.description || '—'} 
                  {f.assessmentId?.competencyId?.name && ` (${f.assessmentId.competencyId.name})`}
                </p>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {pagination.total > pagination.limit && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-200">
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
                      for (let i = 1; i <= pagination.totalPages; i++) {
                        pages.push(i);
                      }
                    } else {
                      let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
                      let end = Math.min(pagination.totalPages, start + maxVisible - 1);
                      
                      if (end - start + 1 < maxVisible) {
                        start = Math.max(1, end - maxVisible + 1);
                      }
                      
                      for (let i = start; i <= end; i++) {
                        pages.push(i);
                      }
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

      {/* Submit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Submit Feedback">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Assessment</label>
            <select 
              value={form.assessmentId} 
              onChange={(e) => setForm({ ...form, assessmentId: e.target.value })} 
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
            >
              <option value="">— Select an assessment —</option>
              {assessments.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.description || 'Assessment'} {a.competencyId?.name ? `(${a.competencyId.name})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Rating (optional)</label>
            <StarRating value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your Feedback</label>
            <textarea 
              rows={4} 
              value={form.content} 
              onChange={(e) => setForm({ ...form, content: e.target.value })} 
              placeholder="Share your thoughts on the assessment..." 
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button 
            onClick={() => setModal(false)} 
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
          >
            Submit
          </button>
        </div>
      </Modal>
    </div>
  );
}