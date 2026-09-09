import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, large = false }) {
  if (!open) return null;

  return (
    <div 
      className="modal-overlay-enter fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`modal-enter bg-white rounded-2xl shadow-2xl w-full ${large ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto custom-scrollbar`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-xl  font-bold text-brand-black">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
