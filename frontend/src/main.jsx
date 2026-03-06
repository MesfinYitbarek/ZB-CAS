import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import AuthProvider from './context/AuthContext'
import ToastProvider from './context/ToastContext'
import './index.css'

// Global QueryClient — configured for the ZB-CAS usage patterns:
//   • staleTime 60s: most data (users, assessments, results) changes infrequently;
//     avoid refetching on every tab-focus during normal browsing.
//   • retry 1: API errors are usually real; one retry is enough before surfacing.
//   • refetchOnWindowFocus false: prevents noisy re-fetches while HR is working
//     across browser tabs; manual invalidation is preferred on mutations.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            60 * 1000,  // 1 minute
      retry:                1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
