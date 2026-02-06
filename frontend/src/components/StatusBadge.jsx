export default function StatusBadge({ status, type = 'assessment' }) {
  const getStatusConfig = () => {
    if (type === 'assessment') {
      const configs = {
        DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' },
        SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Scheduled' },
        ACTIVE: { bg: 'bg-green-100', text: 'text-green-600', label: 'Active' },
        COMPLETED: { bg: 'bg-brand-red-muted', text: 'text-brand-red', label: 'Completed' },
        ARCHIVED: { bg: 'bg-gray-200', text: 'text-gray-500', label: 'Archived' },
      };
      return configs[status] || configs.DRAFT;
    }

    if (type === 'result') {
      const configs = {
        PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
        FINAL: { bg: 'bg-green-100', text: 'text-green-600', label: 'Final' },
      };
      return configs[status] || configs.PENDING;
    }

    if (type === 'level') {
      const configs = {
        Basic: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Basic' },
        Intermediate: { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Intermediate' },
        Advanced: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Advanced' },
        Expert: { bg: 'bg-green-100', text: 'text-green-600', label: 'Expert' },
      };
      return configs[status] || configs.Basic;
    }

    if (type === 'user') {
      const configs = {
        ACTIVE: { bg: 'bg-green-100', text: 'text-green-600', label: 'Active' },
        INACTIVE: { bg: 'bg-gray-200', text: 'text-gray-500', label: 'Inactive' },
      };
      return configs[status] || configs.ACTIVE;
    }

    return { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  };

  const config = getStatusConfig();

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
