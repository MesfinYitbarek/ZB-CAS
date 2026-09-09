import { createContext, useContext } from 'react';

const ReportsContext = createContext(null);

export const useReports = () => useContext(ReportsContext);

export default ReportsContext;
