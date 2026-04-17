import React, { useState, useCallback, useEffect } from 'react';
import { Package, Search, Settings, ShieldCheck, Database, History, LayoutDashboard, Menu, X, Upload, Save, RotateCcw, Download, Loader2 } from 'lucide-react';
import { Product, ProcessingStats } from './types';
import { extractCodesFromText, extractCodesFromBinary, standardizeProductBatch } from './services/gemini';
import { cn } from './lib/utils';
import UploadZone from './components/UploadZone';
import ResultsTable from './components/ResultsTable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';

// Simple hash function to identify unique file content sessions
const getHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isQuotaWait, setIsQuotaWait] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Load last session on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem('active_session_id');
    const savedProducts = localStorage.getItem(`session_data_${savedSessionId}`);
    
    if (savedSessionId && savedProducts) {
      setCurrentSessionId(savedSessionId);
      setProducts(JSON.parse(savedProducts));
    }
  }, []);

  // Sync state to local storage whenever products change
  useEffect(() => {
    if (currentSessionId && products.length > 0) {
      localStorage.setItem('active_session_id', currentSessionId);
      localStorage.setItem(`session_data_${currentSessionId}`, JSON.stringify(products));
    }
  }, [products, currentSessionId]);

  const handleDataLoaded = async (data: { type: 'text' | 'pdf', value: string }) => {
    const sessionId = getHash(data.value);
    const existingSession = localStorage.getItem(`session_data_${sessionId}`);
    
    let productsToProcess: Product[] = [];

    if (existingSession) {
      const savedProducts = JSON.parse(existingSession) as Product[];
      productsToProcess = savedProducts;
      setCurrentSessionId(sessionId);
      setProducts(savedProducts);
      
      const hasPending = savedProducts.some(p => p.status === 'pending' || p.status === 'error');
      if (!hasPending) {
        alert('تمت معالجة جميع المنتجات في هذا الملف مسبقاً.');
        return;
      }
    } else {
      setIsProcessing(true);
      setProducts([]); 
      setCurrentSessionId(sessionId);
      let success = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount <= maxRetries && !success) {
        try {
          setIsQuotaWait(false);
          const extracted = data.type === 'text' 
            ? await extractCodesFromText(data.value)
            : await extractCodesFromBinary(data.value);

          if (extracted.length === 0) {
             alert('لم يتم العثور على أي أكواد منتجات في هذا الملف. يرجى التأكد من أن الملف يحتوي على نصوص واضحة أو صور للمنتجات.');
             setIsProcessing(false);
             return;
          }
          productsToProcess = extracted.map((item, idx) => ({
            id: `PROD-${sessionId}-${idx}`,
            code: item.code,
            originalName: item.originalName,
            status: 'pending',
            confidence: 0
          }));
          setProducts(productsToProcess);
          success = true;
        } catch (error: any) {
          const isRateLimit = error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
          if (isRateLimit && retryCount < maxRetries) {
            setIsQuotaWait(true);
            const waitTime = (15 + Math.pow(2, retryCount) * 10) * 1000;
            console.warn(`Extraction Quota reached. Cooling down for ${waitTime/1000}s...`);
            await delay(waitTime);
            retryCount++;
          } else {
            console.error("Extraction failed after retries:", error);
            setIsProcessing(false);
            setIsQuotaWait(false);
            alert('فشل استخراج البيانات من الملف بسبب ازدحام الخدمة أو حجم الملف الكبير. يرجى المحاولة مرة أخرى لاحقاً.');
            return;
          }
        }
      }
    }
    
    // Processing Loop with Batching & Aggressive Rate Limiting Protection
    setIsProcessing(true);
    setIsQuotaWait(false);
    
    try {
      const BATCH_SIZE = 3; 
      // Always get the latest state of pending products
      const getPending = (currentProds: Product[]) => 
        currentProds.filter(p => p.status === 'pending' || p.status === 'error');

      let currentPending = getPending(productsToProcess);
      
      while (currentPending.length > 0) {
        const batch = currentPending.slice(0, BATCH_SIZE);
        
        // Update UI to processing status
        setProducts(prev => prev.map(p => 
          batch.some(b => b.id === p.id) ? { ...p, status: 'processing' } : p
        ));

        await delay(2500); 

        let retryCount = 0;
        const maxRetries = 5; 
        let batchSuccess = false;

        while (retryCount <= maxRetries && !batchSuccess) {
          try {
            setIsQuotaWait(false);
            const batchResults = await standardizeProductBatch(batch.map(b => ({ code: b.code, originalName: b.originalName })));
            
            setProducts(prev => {
              const nextProducts = prev.map(p => {
                const result = batchResults.find(r => r.code === p.code);
                return result && batch.some(b => b.id === p.id) ? { ...p, ...result, status: 'completed' } : p;
              });
              // Update our local tracking array for the next iteration
              return nextProducts;
            });
            batchSuccess = true;
          } catch (error: any) {
            console.error(`Batch attempt ${retryCount + 1} failed:`, error);
            const isRateLimit = error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
            
            if (isRateLimit && retryCount < maxRetries) {
              setIsQuotaWait(true);
              const waitTime = (20 + Math.pow(2, retryCount) * 15) * 1000; 
              await delay(waitTime);
              retryCount++;
            } else {
              setProducts(prev => prev.map(p => batch.some(b => b.id === p.id) ? { ...p, status: 'error' } : p));
              break; 
            }
          }
        }
        
        // Refresh pending list for next batch
        // We use a functional update and then recalculate locally
        // To be safe in a single async function, we can just slice the original array 
        // since we are processing in order.
        currentPending = currentPending.slice(BATCH_SIZE);
      }
    } finally {
      setIsProcessing(false);
      setIsQuotaWait(false);
    }
  };




  const handleUpdateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const retryAllErrors = () => {
    const errorProducts = products.filter(p => p.status === 'error');
    if (errorProducts.length === 0) return;
    
    // We can just re-trigger extraction/processing with existing products if needed, 
    // but for simplicity, let's just trigger based on the IDs.
    // However, our flow expects text. Let's make it smarter.
    setProducts(prev => prev.map(p => p.status === 'error' ? { ...p, status: 'pending' } : p));
    processPending();
  };

  const confirmReset = () => {
    if (currentSessionId) {
      localStorage.removeItem(`session_data_${currentSessionId}`);
      localStorage.removeItem('active_session_id');
    }
    setProducts([]);
    setCurrentSessionId(null);
    setShowResetModal(false);
  };

  const processPending = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const BATCH_SIZE = 5;
      const pending = products.filter(p => p.status === 'pending');
      
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        setProducts(prev => prev.map(p => batch.some(b => b.id === p.id) ? { ...p, status: 'processing' } : p));
        await delay(1500);

        try {
          const results = await standardizeProductBatch(batch.map(b => ({ code: b.code, originalName: b.originalName })));
          setProducts(prev => prev.map(p => {
            const res = results.find(r => r.code === p.code);
            return res && batch.some(b => b.id === p.id) ? { ...p, ...res, status: 'completed' } : p;
          }));
        } catch {
          setProducts(prev => prev.map(p => batch.some(b => b.id === p.id) ? { ...p, status: 'error' } : p));
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const resetSession = () => {
    setShowResetModal(true);
  };

  const handleExport = () => {
    const data = products.map(p => ({
      'Code/SKU': p.code,
      'Name (EN)': p.standardizedName || '',
      'Name (AR)': p.standardizedNameAr || '',
      'Original Hint': p.originalName || '',
      'Category (EN)': p.category || '',
      'Category (AR)': p.categoryAr || '',
      'Confidence': p.confidence,
      'Source': p.source || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const finalData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    saveAs(finalData, `smartcode_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[var(--bg)]" dir="rtl">
      {/* Navigation */}
      <nav className="h-20 bg-white border-b border-[var(--line)] px-6 lg:px-12 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Search size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--ink)] leading-none">SmartCode</h2>
            <p className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase mt-1">AI Logistics Hub</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {products.length > 0 && (
            <>
              <button onClick={handleExport} className="btn btn-secondary !px-4 hover:border-blue-200 hover:text-blue-600">
                <Download size={16} />
                <span className="hidden sm:inline">تصدير XLSX</span>
              </button>
              <button onClick={() => setShowResetModal(true)} className="btn bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 !px-4">
                <RotateCcw size={16} />
                <span className="hidden sm:inline">مسح البيانات</span>
              </button>
            </>
          )}
          <div className="h-8 w-[1px] bg-gray-200 mx-2 hidden sm:block" />
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
            <Settings size={18} />
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col p-6 lg:p-12 gap-8 max-w-[1440px] mx-auto w-full">
        {/* State 1: No Search Data */}
        {!products.length ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto text-center gap-8 py-12"
          >
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-6xl font-extrabold text-[var(--ink)] tracking-tight leading-[1.1]">
                حوّل ملفات المنتجات <br />
                <span className="text-[var(--primary)]">بذكاء فائق</span>
              </h1>
              <p className="text-lg text-[var(--text-muted)] leading-relaxed font-medium">
                ارفع ملف PDF وسيقوم المحرك الذكي باستخراج الأكواد وتعيين مسمياتها التجارية الموحدة تلقائياً باللغتين العربية والإنجليزية.
              </p>
            </div>
            
            <div className="w-full minimal-card p-2 bg-white/40 backdrop-blur-md">
              <UploadZone 
                onDataLoaded={handleDataLoaded} 
                isProcessing={isProcessing} 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 w-full pt-12 border-t border-gray-200">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-sm italic">01</div>
                <div>
                  <p className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1">رفع الملف</p>
                  <p className="text-[10px] text-gray-400 font-medium">يدعم PDF المصور والمشفر</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-sm italic">02</div>
                <div>
                  <p className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1">تحليل AI</p>
                  <p className="text-[10px] text-gray-400 font-medium">توحيد المسميات عالمياً</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center font-bold text-sm italic">03</div>
                <div>
                  <p className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1">تصدير XLSX</p>
                  <p className="text-[10px] text-gray-400 font-medium">بيانات جاهزة للاستخدام</p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          /* State 2: Data Display */
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-10"
          >
            <div className="flex flex-col lg:flex-row gap-8 items-start justify-between">
              <div className="space-y-3">
                <h1 className="text-3xl font-extrabold text-[var(--ink)] tracking-tight">مراجعة مخرجات القراءة</h1>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg border border-gray-200 text-[10px] font-bold uppercase tracking-wider">
                    {currentSessionId?.slice(0, 12)}
                  </div>
                  {isProcessing && (
                    <div className="flex items-center gap-2 text-blue-600 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                      <div className="w-2 h-2 bg-blue-600 rounded-full" />
                      جاري المعالجة الذكية...
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <SmallStat label="إجمالي الأصناف" value={products.length} />
                <SmallStat label="مكتمل المعايرة" value={products.filter(p => p.status === 'completed').length} color="text-emerald-600" />
                <SmallStat label="تنبيهات" value={products.filter(p => p.status === 'error').length} color="text-red-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-10">
              <div className="min-w-0 flex flex-col gap-6">
                <AnimatePresence mode="wait">
                  {isQuotaWait && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-5 shadow-sm shadow-amber-900/5"
                    >
                      <div className="w-10 h-10 bg-amber-100/50 rounded-full flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-amber-900 font-bold text-sm">معدل طلبات مرتفع (Cooling down)</h4>
                        <p className="text-amber-800 text-xs mt-0.5 opacity-80">نحن نحترم حدود الخدمة السحابية. سيتم استئناف المعالجة تلقائياً لتجنب الحظر.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="minimal-card overflow-hidden">
                  <ResultsTable 
                    products={products} 
                    onExport={handleExport}
                    onUpdateProduct={handleUpdateProduct}
                    onRetryAll={retryAllErrors}
                  />
                </div>
              </div>

              <aside className="space-y-8">
                <div className="minimal-card p-8 gap-6 flex flex-col bg-white">
                  <div>
                    <h3 className="font-extrabold text-base text-[var(--ink)]">إضافة بيانات جديدة</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1 font-medium italic">سجلات تكميلية للجلسة الحالية</p>
                  </div>
                  <UploadZone 
                    onDataLoaded={handleDataLoaded} 
                    isProcessing={isProcessing} 
                  />
                </div>

                <div className="minimal-card p-8 bg-slate-50/70 border-dashed border-2">
                  <h3 className="font-bold text-[10px] text-gray-400 uppercase tracking-[0.2em] mb-6">نظام الضمان والجودة</h3>
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100 shrink-0">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gray-800">التدقيق العالمي</p>
                        <p className="text-[10px] text-gray-500 leading-relaxed font-medium">يتم فحص الأكواد مقابل قواعد بيانات GS1 و Manufacturer Catalogs الموثقة.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100 shrink-0">
                        <Database className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gray-800">الأرشفة اللحظية</p>
                        <p className="text-[10px] text-gray-500 leading-relaxed font-medium">تُحفظ البيانات في سجل المتصفح المحلي لضمان عدم ضياع مجهودك في حال الانقطاع.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </motion.div>
        )}
      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] p-10 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-3">
                <RotateCcw className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-extrabold text-[var(--ink)] mb-3 tracking-tight">مسح البيانات؟</h3>
              <p className="text-[var(--text-muted)] text-sm mb-10 leading-relaxed font-medium px-4">
                هل أنت متأكد؟ سيتم حذف كافة النتائج الحالية نهائياً من ذاكرة المتصفح للبدء في مشروع جديد.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-4 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold transition-all"
                >
                  تراجع
                </button>
                <button 
                  onClick={confirmReset}
                  className="flex-1 py-4 px-6 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold transition-all shadow-xl shadow-red-500/20"
                >
                  تأكيد
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SmallStat({ label, value, color }: { label: string, value: number | string, color?: string }) {
  return (
    <div className="minimal-card px-6 py-4 flex flex-col gap-1 min-w-[160px] hover:border-gray-300 transition-colors">
      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{label}</span>
      <span className={cn("text-3xl font-black tabular-nums tracking-tighter", color || "text-[var(--ink)]")}>
        {value}
      </span>
    </div>
  );
}



