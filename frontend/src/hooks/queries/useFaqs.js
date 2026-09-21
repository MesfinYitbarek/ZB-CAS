import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { queryKeys } from '../queryKeys';

/** Admin FAQ list (all categories included). Returns the payload envelope. */
export function useFaqList(options = {}) {
  return useQuery({
    queryKey: queryKeys.faqs.list,
    queryFn: async () => {
      const { data } = await api.get('/faq/all');
      return data.data;
    },
    ...options,
  });
}

/** FAQ categories — shared by FAQs admin page and SupportWidget. */
export function useFaqCategories(options = {}) {
  return useQuery({
    queryKey: queryKeys.faqs.categories,
    queryFn: async () => {
      const { data } = await api.get('/faq/categories');
      return data.data;
    },
    ...options,
  });
}

/** Public FAQ list for the SupportWidget. */
export function usePublicFaqs(options = {}) {
  return useQuery({
    queryKey: queryKeys.faqs.public,
    queryFn: async () => {
      const { data } = await api.get('/faq/public');
      return data.data;
    },
    ...options,
  });
}