import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { queryKeys } from '../queryKeys';

/** Single assessment detail. Shared by AssessmentDetail, AssessmentDetailPage, TakeAssessment, SupervisorEvaluation. */
export function useAssessmentDetail(id, options = {}) {
  return useQuery({
    queryKey: queryKeys.assessments.detail(id),
    queryFn: async () => {
      const { data } = await api.get(`/assessments/${id}`);
      return data.data;
    },
    enabled: !!id,
    ...options,
  });
}

/** Pending supervisor assessments badge/list. */
export function useSupervisorPending(options = {}) {
  return useQuery({
    queryKey: queryKeys.assessments.pending,
    queryFn: async () => {
      const res = await api.get('/supervisors/pending');
      return res.data;
    },
    ...options,
  });
}

/** Completed-evaluation count for supervisors. */
export function useSupervisorCompletedCount(options = {}) {
  return useQuery({
    queryKey: queryKeys.assessments.completedCount,
    queryFn: async () => {
      const res = await api.get('/supervisors/completed-count');
      return res.data;
    },
    ...options,
  });
}