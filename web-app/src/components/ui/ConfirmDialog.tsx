import React from 'react';
import { useUIStore } from '../../store/useStore';
import { X, AlertTriangle, Info } from 'lucide-react';

export function ConfirmDialog() {
  const { confirmState, hideConfirm } = useUIStore();
  const { isOpen, title, message, confirmText = 'OK', cancelText = 'Скасувати', isDestructive = false, onConfirm, onCancel } = confirmState;

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    hideConfirm();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    hideConfirm();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 text-slate-800">
            <div className={`w-8 h-8 rounded-md flex items-center justify-center ${isDestructive ? 'bg-red-500' : 'bg-[#0084ff]'}`}>
              {isDestructive ? <AlertTriangle className="w-5 h-5 text-white" /> : <Info className="w-5 h-5 text-white" />}
            </div>
            <h2 className="text-xl font-bold font-sans">{title}</h2>
          </div>
          <button 
            onClick={handleCancel}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-slate-600 leading-relaxed">
          {message}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={handleCancel}
            className="px-4 py-2 rounded-md text-slate-600 hover:bg-slate-200 font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button 
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-md text-white font-bold transition-colors shadow-sm ${
              isDestructive ? 'bg-red-500 hover:bg-red-600' : 'bg-[#0084ff] hover:bg-[#0073e6]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
