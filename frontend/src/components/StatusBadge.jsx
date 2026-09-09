export default function StatusBadge({ status, type = 'assessment' }) {
  const getStatusConfig = () => {
    if (type === 'assessment') {
      const configs = {
        DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' },
        SCHEDULED: { bg: 'bg-gray-200', text: 'text-gray-700', label: 'Scheduled' },
        ACTIVE: { bg: 'bg-brand-black', text: 'text-white', label: 'Active' },
        COMPLETED: { bg: 'bg-brand-red-muted', text: 'text-brand-red', label: 'Completed' },
        ARCHIVED: { bg: 'bg-gray-200', text: 'text-gray-500', label: 'Archived' },
      };
      return configs[status] || configs.DRAFT;
    }

    if (type === 'result') {
      const configs = {
        PENDING: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
        FINAL: { bg: 'bg-brand-black', text: 'text-white', label: 'Final' },
      };
      return configs[status] || configs.PENDING;
    }

    if (type === 'level') {
      const configs = {
        Basic: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Basic' },
        Intermediate: { bg: 'bg-gray-200', text: 'text-gray-800', label: 'Intermediate' },
        Advanced: { bg: 'bg-brand-black', text: 'text-white', label: 'Advanced' },
        Expert: { bg: 'bg-brand-red', text: 'text-white', label: 'Expert' },
      };
      return configs[status] || configs.Basic;
    }

    if (type === 'user') {
      const configs = {
        ACTIVE: { bg: 'bg-brand-black', text: 'text-white', label: 'Active' },
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
