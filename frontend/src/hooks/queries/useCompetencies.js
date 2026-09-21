import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { queryKeys } from '../queryKeys';

/**
 * Paginated competencies for the admin list (Competencies page).
 * queryFn returns the full payload envelope: { competencies, pagination }.
 */
export function useCompetencies(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.competencies.list(params),
    queryFn: async () => {
      const { data } = await api.get('/competencies', { params });
      return data.data;
    },
    ...options,
  });
}

/**
 * Unpaginated competency list for dropdowns/selectors.
 * Used by Assessments, AssessmentDetail, Recommendations and Feedback —
 * shared query key means one network hit for all mounted consumers.
 */
export function useAllCompetencies(options = {}) {
  return useQuery({
    queryKey: queryKeys.competencies.list({ all: true }),
    queryFn: async () => {
      const { data } = await api.get('/competencies');
      return data.data.competencies || [];
    },
    ...options,
  });
}