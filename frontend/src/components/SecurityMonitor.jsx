import { AlertTriangle, Eye, Shield } from 'lucide-react';

export default function SecurityMonitor({ violations, isHighRisk }) {
  if (violations.length === 0) return null;

  const recentViolations = violations.slice(-5).reverse();

  return (
    <div className={`fixed bottom-6 right-6 w-80 rounded-xl shadow-2xl border-2 z-50 ${
      isHighRisk ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-500'
    }`}>
      <div className={`px-4 py-3 border-b flex items-center gap-3 ${
        isHighRisk ? 'bg-red-100 border-red-200' : 'bg-yellow-100 border-yellow-200'
      }`}>
        <Shield className={`w-5 h-5 ${isHighRisk ? 'text-red-600' : 'text-yellow-600'}`} />
        <span className={`font-bold text-sm ${isHighRisk ? 'text-red-900' : 'text-yellow-900'}`}>
          Security Monitor
        </span>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${
          isHighRisk ? 'bg-red-200 text-red-900' : 'bg-yellow-200 text-yellow-900'
        }`}>
          {violations.length} events
        </span>
      </div>
      
      <div className="p-4 max-h-64 overflow-y-auto custom-scrollbar">
        {isHighRisk && (
          <div className="mb-3 p-3 bg-red-100 border border-red-300 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-800">
                <strong>High Risk Detected!</strong> Multiple violations may result in assessment invalidation.
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          {recentViolations.map((v, idx) => (
            <div key={idx} className="flex items-start gap-2 p-2 bg-white rounded border border-gray-200">
              <Eye className="w-3 h-3 text-gray-400 flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 truncate">{v.type.replace(/_/g, ' ')}</div>
                <div className="text-[10px] text-gray-500">{new Date(v.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
