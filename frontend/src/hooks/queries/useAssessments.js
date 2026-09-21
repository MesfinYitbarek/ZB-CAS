import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { queryKeys } from '../queryKeys';

/** Employee department list (assessment audience selector). Shared by Assessments + AssessmentDetail. */
export function useDepartmentList(options = {}) {
  return useQuery({
    queryKey: queryKeys.assessments.departments,
    queryFn: async () => {
      const { data } = await api.get('/assessments/employees/departments');
      return data.data.departments || [];
    },
    ...options,
  });
}

/** Student/employee search by name or department (assessment audience picker). */
export function useEmployeeSearch(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.assessments.employeesSearch,
    queryFn: async () => {
      const { data } = await api.get('/assessments/employees/search', { params });
      return data.data;
    },
    ...options,
  });
}