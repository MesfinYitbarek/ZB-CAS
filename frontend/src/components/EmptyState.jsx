export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-16 px-4">
      {Icon && <Icon className="w-16 h-16 mx-auto mb-4 text-gray-300" />}
      <h3 className="text-lg font-semibold text-gray-600 mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">{description}</p>}
      {action && action}
    </div>
  );
}
