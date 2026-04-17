import React, { useCallback, useState } from 'react';
import { Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// Initialize PDF.js worker
const pdfjsVersion = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

interface UploadZoneProps {
  onDataLoaded: (data: { type: 'text' | 'pdf', value: string }) => void;
  isProcessing: boolean;
}

export default function UploadZone({ onDataLoaded, isProcessing }: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('الرجاء رفع ملف PDF صالح');
      return;
    }

    setFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useSystemFonts: true, 
        disableFontFace: false
      });
      
      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + ' ';
      }

      if (!fullText.trim()) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          onDataLoaded({ type: 'pdf', value: base64String });
        };
        reader.readAsDataURL(file);
      } else {
        onDataLoaded({ type: 'text', value: fullText });
      }
    } catch (error: any) {
      console.error('Error processing PDF:', error);
      alert(`فشل تحليل الملف: ${error.message || 'خطأ غير معروف'}`);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
  };

  return (
    <div 
      className={cn(
        "w-full rounded-2xl p-10 lg:p-14 border-2 border-dashed transition-all cursor-pointer flex flex-col items-center text-center gap-4 relative overflow-hidden",
        dragActive ? "border-blue-400 bg-blue-50/30" : "border-gray-200 bg-gray-50/30 hover:bg-gray-50",
        isProcessing && "pointer-events-none opacity-60"
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept=".pdf" onChange={handleChange} disabled={isProcessing} />
      
      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors">
        {isProcessing ? <Loader2 className="w-8 h-8 animate-spin text-blue-500" /> : <Upload className="w-8 h-8" />}
      </div>

      <div className="space-y-1">
        <h3 className="font-bold text-lg text-gray-900">
          {isProcessing ? "جاري المعالجة..." : "انقر أو اسحب الملف هنا"}
        </h3>
        <p className="text-sm text-gray-500 max-w-xs font-medium">
          {fileName ? fileName : "يرجى اختيار ملف PDF يحتوي على قائمة منتجات"}
        </p>
      </div>

      {fileName && !isProcessing && (
        <div className="flex items-center gap-2 mt-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
          <CheckCircle2 size={12} />
          تم تحميل المصدر
        </div>
      )}
    </div>
  );
}
