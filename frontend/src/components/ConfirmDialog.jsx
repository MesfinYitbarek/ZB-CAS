import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  if (!open) return null;

  return (
    <div className="modal-overlay-enter fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-enter bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-100' : 'bg-brand-red/10'}`}>
              <AlertTriangle className={`w-6 h-6 ${danger ? 'text-red-600' : 'text-brand-red'}`} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg  font-bold text-brand-black mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-lg font-semibold text-white transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-red hover:bg-brand-red-dark'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
