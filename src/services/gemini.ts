import { GoogleGenAI, Type } from "@google/genai";
import { Product } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function standardizeProductBatch(batch: { code: string, originalName?: string }[]): Promise<Partial<Product>[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a professional global inventory data expert. 
      Analyze this list of product codes (SKUs, GTINs, Part Numbers) and hints to provide global standardized names, categories, and confidence levels.
      
      Requirements for each item:
      1. standardizedName: Professional English product name (Technical, clear, brand-correct).
      2. standardizedNameAr: Professional Arabic standardized name. Use proper commercial Arabic terms, avoiding literal translations that don't make sense in business.
      3. category: Main category in English.
      4. categoryAr: Main category in Arabic.
      5. confidence: A decimal (0-1) indicating match certainty.
      6. source: A verified URL if found.
      
      Use Search grounding to verify the most accurate data for each SKU/Code. Look for official manufacturer sites, GS1, or major retailers.
      
      Input Batch:
      ${JSON.stringify(batch)}`,
      config: {
        tools: [
          { googleSearch: {} }
        ],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING },
              standardizedName: { type: Type.STRING },
              standardizedNameAr: { type: Type.STRING },
              category: { type: Type.STRING },
              categoryAr: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              source: { type: Type.STRING }
            },
            required: ["code", "standardizedName", "standardizedNameAr", "confidence"]
          }
        }
      }
    });

    const results = JSON.parse(response.text || '[]');
    return results.map((res: any) => ({
      ...res,
      status: 'completed' as const
    }));
  } catch (error) {
    console.error("Batch standardization error:", error);
    throw error; // Let the UI handle retry/backoff
  }
}


export async function extractCodesFromText(text: string): Promise<{ code: string, originalName?: string }[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert at parsing messy OCR data from industrial and commercial PDF documents.
      Analyze the provided text and extract a list of product codes (SKUs, GTINs, Part Numbers, Serial Numbers).
      
      Rules:
      1. Identify codes even if they have formatting artifacts (e.g. "S-K_U 123" -> "SKU123").
      2. Capture any surrounding text that acts as a product name or description as "originalName".
      3. If a line is clearly a header, skip it.
      4. If you see multiple similar products, list them all.
      
      Raw Text:
      ${text.slice(0, 15000)} // Limit context to stay safe
      
      Return as a clean JSON array of objects with "code" and "originalName" properties.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING },
              originalName: { type: Type.STRING }
            },
            required: ["code"]
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini extraction error:", error);
    throw error;
  }
}

export async function extractCodesFromBinary(base64Data: string): Promise<{ code: string, originalName?: string }[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64Data
            }
          },
          {
            text: `You are an expert at visual OCR and data extraction from technical product catalogs.
            Analyze this PDF document and extract all product codes (SKUs, GTINs, Part Numbers) and their corresponding names.
            
            Return as a clean JSON array of objects with "code" and "originalName" properties.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING },
              originalName: { type: Type.STRING }
            },
            required: ["code"]
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini binary extraction error:", error);
    throw error;
  }
}

