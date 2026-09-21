import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { queryKeys } from '../queryKeys';

/**
 * Live analytics hooks. The `params` object (from the reports filter drawer)
 * is part of the query key so every filter change re-fetches, while identical
 * filter sets share cache.
 */

/** GET /reports/stats — used by Overview, Department and Competency pages. */
export function useReportStats(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.stats(params),
    queryFn: async () => {
      const { data } = await api.get('/reports/stats', { params });
      return data.data;
    },
    ...options,
  });
}

/** GET /reports/heatmap — competency breakdown. */
export function useReportHeatmap(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.heatmap(params),
    queryFn: async () => {
      const { data } = await api.get('/reports/heatmap', { params });
      return data.data;
    },
    ...options,
  });
}

/** GET /reports/department/:name — department drill-down. */
export function useReportDepartment(name, params, options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.department(name, params),
    queryFn: async () => {
      const { data } = await api.get(`/reports/department/${name}`, { params });
      return data.data;
    },
    enabled: !!name,
    ...options,
  });
}

/** GET /reports/filter-options — filter drawer mount data (single cache for the reports layout). */
export function useReportFilterOptions(options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.filterOptions,
    queryFn: async () => {
      const { data } = await api.get('/reports/filter-options');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/** GET /reports/employees?search= — debounced employee picker search. */
export function useReportEmployees(search, options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.employees(search || ''),
    queryFn: async () => {
      const { data } = await api.get('/reports/employees', { params: { search } });
      return data.data;
    },
    enabled: !!search,
    ...options,
  });
}

/** GET /reports/generated — saved reports list. */
export function useGeneratedReports(options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.generated.all,
    queryFn: async () => {
      const { data } = await api.get('/reports/generated');
      return data.data;
    },
    ...options,
  });
}

/** GET /reports/generated/:id/preview — row preview inside the detail modal. */
export function useGeneratedReportPreview(id, options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.generated.preview(id, { limit: 100 }),
    queryFn: async () => {
      const { data } = await api.get(`/reports/generated/${id}/preview?limit=100`);
      return data.data;
    },
    enabled: !!id,
    ...options,
  });
}