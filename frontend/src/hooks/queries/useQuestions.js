import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { queryKeys } from '../queryKeys';

/**
 * Questions list — paginated/filtered (Questions admin page) OR filtered by
 * competency/target group (Assessments, AssessmentDetail selectors). The
 * queryFn returns the raw payload envelope so consumers read .questions / .pagination.
 */
export function useQuestions(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.questions.list(params),
    queryFn: async () => {
      const { data } = await api.get('/questions', { params });
      return data.data;
    },
    ...options,
  });
}