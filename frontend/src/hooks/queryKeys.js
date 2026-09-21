/* queryKeys.js
 * Central query-key factory for @tanstack/react-query.
 * Every domain hook consumes a key from here so cache invalidation is
 * consistent across the whole app (no key-string drift between pages).
 *
 * Rule of thumb: keys are hierarchical arrays — ['domain', 'entity', params].
 * Parity with params is what makes pagination/filters re-query correctly.
 */

export const queryKeys = {
  users: {
    all: ['users'],
    list: (params) => ['users', 'list', params],
    detail: (id) => ['users', 'detail', id],
    me: ['users', 'me'],
    team: (id) => ['users', 'team', id],
  },

  competencies: {
    all: ['competencies'],
    list: (params) => ['competencies', 'list', params],
  },

  questions: {
    all: ['questions'],
    list: (params) => ['questions', 'list', params],
  },

  faqs: {
    all: ['faqs'],
    list: ['faqs', 'list'],
    categories: ['faqs', 'categories'],
    public: ['faqs', 'public'],
  },

  recommendations: {
    all: ['recommendations'],
    list: (params) => ['recommendations', 'list', params],
    byGroupLevel: (params) => ['recommendations', 'by-group-level', params],
  },

  assessments: {
    all: ['assessments'],
    list: (params) => ['assessments', 'list', params],
    detail: (id) => ['assessments', 'detail', id],
    departments: ['assessments', 'departments'],
    employeesSearch: ['assessments', 'employees-search'],
    pending: ['assessments', 'pending'],
    completedCount: ['assessments', 'completed-count'],
  },

  externalRequests: {
    all: ['external-requests'],
    list: (params) => ['external-requests', 'list', params],
    userResults: (id) => ['external-requests', 'user-results', id],
  },

  supervisors: {
    pending: ['supervisors', 'pending'],
  },

  responses: {
    progress: (assessmentId) => ['responses', 'progress', assessmentId],
    supervisor: (assessmentId, employeeId) => ['responses', 'supervisor', assessmentId, employeeId],
    securityViolations: (assessmentId, userId) => ['responses', 'security-violations', assessmentId, userId],
  },

  results: {
    all: ['results'],
    list: (params) => ['results', 'list', params],
    detail: (id) => ['results', 'detail', id],
    filterOptions: ['results', 'filter-options'],
    user: (userId) => ['results', 'user', userId],
  },

  feedback: {
    all: ['feedback'],
    list: (params) => ['feedback', 'list', params],
    eligible: ['feedback', 'eligible'],
    adminSummary: (params) => ['feedback', 'admin-summary', params],
    byAssessment: (assessmentId, params) => ['feedback', 'by-assessment', assessmentId, params],
  },

  activityLog: {
    list: (params) => ['activities', 'list', params],
  },

  dashboard: {
    admin: (period) => ['dashboard', 'admin', period],
    supervisor: (period) => ['dashboard', 'supervisor', period],
    employee: (period) => ['dashboard', 'employee', period],
  },

  reports: {
    all: ['reports'],
    stats: (params) => ['reports', 'stats', params],
    heatmap: (params) => ['reports', 'heatmap', params],
    department: (name, params) => ['reports', 'department', name, params],
    filterOptions: ['reports', 'filter-options'],
    employees: (params) => ['reports', 'employees', params],
    generated: {
      all: ['reports', 'generated'],
      detail: (id) => ['reports', 'generated', 'detail', id],
      preview: (id, params) => ['reports', 'generated', 'preview', id, params],
    },
  },

  notifications: {
    all: ['notifications'],
    list: (params) => ['notifications', 'list', params],
    unreadCount: ['notifications', 'unread-count'],
  },

  chat: {
    all: ['chat'],
    admins: ['chat', 'admins'],
    conversations: ['chat', 'conversations'],
    conversation: (id) => ['chat', 'conversation', id],
    unread: ['chat', 'unread'],
  },
};