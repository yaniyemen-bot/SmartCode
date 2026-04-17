import React from 'react';
import { Product } from '../types';
import { cn } from '../lib/utils';
import { CheckCircle2, AlertCircle, Loader2, ExternalLink, Edit3, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';

interface ResultsTableProps {
  products: Product[];
  onExport: () => void;
  onUpdateProduct: (id: string, updates: Partial<Product>) => void;
  onRetryAll: () => void;
}

export default function ResultsTable({ products, onUpdateProduct, onRetryAll }: ResultsTableProps) {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <h3 className="font-bold text-sm text-gray-900">سجل النتائج ({products.length})</h3>
        {products.some(p => p.status === 'error') && (
          <button 
            onClick={onRetryAll}
            className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-100"
          >
            <RotateCcw size={12} />
            إعادة محاولة الكل
          </button>
        )}
      </div>

      <div className="overflow-auto max-h-[600px]">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="border-b border-gray-100 sticky top-0 bg-white z-10">
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-20">الحالة</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">الكود</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">المسمى (Ar)</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">المسمى (En)</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-24">الدقة</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <StatusPill status={product.status} />
                </td>
                <td className="px-6 py-4">
                  <div className="code-pill">{product.code}</div>
                </td>
                <td className="px-6 py-4">
                  <EditableCell 
                    value={product.standardizedNameAr || '-'} 
                    onSave={(val) => onUpdateProduct(product.id, { standardizedNameAr: val })}
                    placeholder="الاسم بالعربي..."
                  />
                </td>
                <td className="px-6 py-4">
                  <EditableCell 
                    value={product.standardizedName || '-'} 
                    onSave={(val) => onUpdateProduct(product.id, { standardizedName: val })}
                    placeholder="Product name in English..."
                  />
                </td>
                <td className="px-6 py-4">
                  <ConfidenceBadge score={product.confidence} />
                </td>
                <td className="px-6 py-4 text-left">
                  {product.source && (
                    <a 
                      href={product.source} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-gray-300 hover:text-blue-500 transition-colors"
                      title="رابط المصدر"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Product['status'] }) {
  const configs = {
    pending: { label: 'انتظار', icon: null, className: 'status-pending' },
    processing: { label: 'معالجة', icon: <Loader2 size={10} className="animate-spin" />, className: 'status-processing' },
    completed: { label: 'مكتمل', icon: <CheckCircle2 size={10} />, className: 'status-success' },
    error: { label: 'فشل', icon: <AlertCircle size={10} />, className: 'status-error' },
  };

  const config = configs[status];
  return (
    <div className={cn("status-pill", config.className)}>
      {config.icon}
      {config.label}
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  if (score === 0) return <span className="text-gray-300">-</span>;
  
  const color = score >= 0.9 ? 'text-emerald-500' : score >= 0.7 ? 'text-blue-500' : 'text-amber-500';
  return (
    <div className={cn("flex items-center gap-1.5 text-[11px] font-bold", color)}>
      <div className="w-1.5 h-1.5 rounded-full bg-current" />
      {Math.round(score * 100)}%
    </div>
  );
}

function EditableCell({ value, onSave, placeholder }: { value: string, onSave: (val: string) => void, placeholder: string }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [val, setVal] = React.useState(value);

  const handleBlur = () => {
    setIsEditing(false);
    if (val !== value) onSave(val);
  };

  if (isEditing) {
    return (
      <input 
        autoFocus
        value={val === '-' ? '' : val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
        className="w-full bg-blue-50 border border-blue-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 ring-blue-500/20"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 group/cell cursor-pointer" onClick={() => setIsEditing(true)}>
      <span className={cn("text-sm", value === '-' ? 'text-gray-300 italic' : 'text-gray-700 font-medium')}>
        {value}
      </span>
      <Edit3 size={10} className="text-gray-200 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
    </div>
  );
}
