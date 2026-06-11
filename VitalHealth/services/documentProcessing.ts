// services/documentProcessing.ts
// Document processing pipeline: extraction -> chunking -> embedding

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { Chunk, ChunkOptions, createChunks } from './chunkingService';
import { generateEmbeddings, retrieveTopKChunks, ScoredChunk } from './embeddingService';

// Storage keys
const KEY_DOCUMENTS = '@hai_documents';
const KEY_CHUNKS = '@hai_chunks';

// Types
export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'image';
  chunkCount: number;
  uploadedAt: number;
  size?: number;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export interface ProcessingProgress {
  stage: 'extracting' | 'chunking' | 'embedding' | 'storing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
}

/**
 * Generate a unique document ID
 */
function generateDocId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load documents from storage
 */
export async function loadDocuments(): Promise<Document[]> {
  try {
    const data = await AsyncStorage.getItem(KEY_DOCUMENTS);
    if (!data) return [];
    try { const p = JSON.parse(data); return Array.isArray(p) ? p : []; } catch { return []; }
  } catch (error) {
    console.error('[DocProcessing] Error loading documents:', error);
    return [];
  }
}

/**
 * Save documents to storage
 */
export async function saveDocuments(docs: Document[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_DOCUMENTS, JSON.stringify(docs));
  } catch (error) {
    console.error('[DocProcessing] Error saving documents:', error);
  }
}

/**
 * Load embedded chunks from storage
 */
export async function loadChunks(): Promise<EmbeddedChunk[]> {
  try {
    const data = await AsyncStorage.getItem(KEY_CHUNKS);
    if (!data) return [];
    try { const p = JSON.parse(data); return Array.isArray(p) ? p : []; } catch { return []; }
  } catch (error) {
    console.error('[DocProcessing] Error loading chunks:', error);
    return [];
  }
}

/**
 * Save embedded chunks to storage
 */
export async function saveChunks(chunks: EmbeddedChunk[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_CHUNKS, JSON.stringify(chunks));
  } catch (error) {
    console.error('[DocProcessing] Error saving chunks:', error);
  }
}

/**
 * Pick a document (PDF or image)
 */
export async function pickDocument(): Promise<{
  uri: string;
  name: string;
  type: 'pdf' | 'image';
  mimeType: string;
} | null> {
  try {
    // Show selection dialog
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const isPdf = asset.mimeType === 'application/pdf';

    return {
      uri: asset.uri,
      name: asset.name,
      type: isPdf ? 'pdf' : 'image',
      mimeType: asset.mimeType || (isPdf ? 'application/pdf' : 'image/jpeg'),
    };
  } catch (error) {
    console.error('[DocProcessing] Error picking document:', error);
    return null;
  }
}

/**
 * Pick an image using image picker
 */
export async function pickImage(): Promise<{
  uri: string;
  name: string;
  type: 'image';
  mimeType: string;
} | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      console.log('[DocProcessing] Image picker permission denied');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];

    return {
      uri: asset.uri,
      name: asset.fileName || `image_${Date.now()}.jpg`,
      type: 'image',
      mimeType: asset.mimeType || 'image/jpeg',
    };
  } catch (error) {
    console.error('[DocProcessing] Error picking image:', error);
    return null;
  }
}

/**
 * Process a document: extract text, chunk, and embed
 * This is the main function that processes documents on-device
 */
export async function processDocument(
  document: {
    uri: string;
    name: string;
    type: 'pdf' | 'image';
    mimeType: string;
  },
  options: {
    chunkSize?: number;
    chunkOverlap?: number;
    onProgress?: (progress: ProcessingProgress) => void;
  } = {}
): Promise<{
  document: Document;
  chunks: EmbeddedChunk[];
}> {
  const { chunkSize = 500, chunkOverlap = 100, onProgress } = options;
  
  const updateProgress = (stage: ProcessingProgress['stage'], progress: number, message: string) => {
    if (onProgress) {
      onProgress({ stage, progress, message });
    }
  };

  try {
    // Stage 1: Extract text
    updateProgress('extracting', 10, 'Extracting text from document...');
    
    let extractedText: string;
    
    if (document.type === 'pdf') {
      // For PDF, we'd normally use a PDF text extraction library
      // For now, we'll use a placeholder
      // In production, integrate with: expo-extract-text or react-native-pdf-extractor
      extractedText = await extractTextFromPDFDocument(document.uri, document.name);
    } else {
      // For images, we'd use OCR
      // For now, placeholder
      extractedText = await extractTextFromImageDocument(document.uri, document.name);
    }
    
    if (!extractedText || extractedText.length < 10) {
      throw new Error('Failed to extract meaningful text from document');
    }
    
    console.log('[DocProcessing] Extracted text length:', extractedText.length);
    updateProgress('chunking', 40, 'Chunking text...');

    // Stage 2: Chunk text
    const chunkOptions: ChunkOptions = { chunkSize, chunkOverlap };
    const docId = generateDocId();
    const chunks = createChunks(extractedText, docId, document.name, chunkOptions);
    
    if (chunks.length === 0) {
      throw new Error('Failed to create text chunks');
    }
    
    console.log('[DocProcessing] Created chunks:', chunks.length);
    updateProgress('embedding', 60, 'Generating embeddings...');

    // Stage 3: Generate embeddings
    const textChunks = chunks.map(c => c.text);
    const embeddings = await generateEmbeddings(textChunks);
    
    // Combine chunks with embeddings
    const embeddedChunks: EmbeddedChunk[] = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));
    
    console.log('[DocProcessing] Generated embeddings for', embeddings.length, 'chunks');
    updateProgress('storing', 90, 'Storing locally...');

    // Stage 4: Create document record
    const doc: Document = {
      id: docId,
      name: document.name,
      type: document.type,
      chunkCount: embeddedChunks.length,
      uploadedAt: Date.now(),
    };

    updateProgress('complete', 100, 'Document processed successfully!');
    
    return { document: doc, chunks: embeddedChunks };
    
  } catch (error) {
    updateProgress('error', 0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

// Placeholder functions for text extraction
// In production, integrate with actual OCR/PDF libraries

async function extractTextFromPDFDocument(uri: string, name: string): Promise<string> {
  console.log('[DocProcessing] Extracting text from PDF:', name);
  
  // Placeholder: In production, use:
  // - expo-extract-text
  // - react-native-pdf-extractor
  // - Or send to server for extraction
  
  // For demo, return sample medical document text
  // This would be replaced with actual extracted text
  return `
Patient Name: John Doe
Date: ${new Date().toLocaleDateString()}

Medical History:
- Hypertension diagnosed in 2020
- Type 2 Diabetes Mellitus
- Current medications:
  - Metformin 500mg twice daily
  - Lisinopril 10mg once daily
  - Aspirin 81mg once daily

Lab Results (Latest):
- Blood Glucose (Fasting): 126 mg/dL (Normal: 70-100)
- HbA1c: 7.2% (Target: <7%)
- Blood Pressure: 138/85 mmHg
- Total Cholesterol: 210 mg/dL
- LDL: 130 mg/dL
- HDL: 45 mg/dL

Physician Notes:
Patient shows improved glycemic control with current medication regimen.
Continue current treatment plan. Follow up in 3 months.
Recommend dietary modifications and regular exercise.
  `.trim();
}

async function extractTextFromImageDocument(uri: string, name: string): Promise<string> {
  console.log('[DocProcessing] Extracting text from image:', name);
  
  // Placeholder: In production, use:
  // - react-native-mlkit-ocr
  // - expo-ml-kit (if available)
  // - Or send to server for OCR
  
  // For demo, return sample prescription text
  return `
Prescription

Medication: Amoxicillin 500mg
Dosage: Three times daily
Duration: 7 days
Instructions: Take with food

Prescribed for: Respiratory infection
Date: ${new Date().toLocaleDateString()}
Physician: Dr. Smith
  `.trim();
}

/**
 * Process a query: embed locally and retrieve top-K chunks
 */
export async function processQuery(
  query: string,
  chunks: EmbeddedChunk[],
  topK: number = 5
): Promise<{
  queryEmbedding: number[];
  topChunks: ScoredChunk[];
}> {
  // Generate embedding for query
  const { generateEmbedding: embedQuery } = await import('./embeddingService');
  const queryEmbedding = await embedQuery(query);
  
  // Retrieve top-K chunks
  const topChunks = retrieveTopKChunks(queryEmbedding, chunks, topK);
  
  return {
    queryEmbedding,
    topChunks,
  };
}

/**
 * Delete a document and its chunks
 */
export async function deleteDocument(
  docId: string,
  documents: Document[],
  chunks: EmbeddedChunk[]
): Promise<{ documents: Document[]; chunks: EmbeddedChunk[] }> {
  const updatedDocs = documents.filter(d => d.id !== docId);
  const updatedChunks = chunks.filter(c => c.metadata?.docId !== docId);
  
  await saveDocuments(updatedDocs);
  await saveChunks(updatedChunks);
  
  return { documents: updatedDocs, chunks: updatedChunks };
}

/**
 * Clear all documents and chunks
 */
export async function clearAllData(): Promise<void> {
  await saveDocuments([]);
  await saveChunks([]);
  console.log('[DocProcessing] All document data cleared');
}

