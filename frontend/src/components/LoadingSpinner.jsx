export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-6 h-6 border-2',
    md: 'w-10 h-10 border-4',
    lg: 'w-16 h-16 border-4',
  };

  return (
    <div className={`border-brand-red border-t-transparent rounded-full animate-spin ${sizes[size]} ${className}`} />
  );
}

export function LoadingPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="flex items-center justify-center p-16">
      <LoadingSpinner />
    </div>
  );
}
