export interface Product {
  id: string;
  code: string;
  originalName?: string;
  standardizedName?: string;
  standardizedNameAr?: string;
  category?: string;
  categoryAr?: string;
  confidence: number;
  source?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface ProcessingStats {
  total: number;
  processed: number;
  errors: number;
}
