import { log } from "../utils/logger";

// services/embeddingService.ts
// On-device embedding generation using simple hash-based embeddings
// Note: For production, install @xenova/transformers for better embeddings

// Model configuration
const MODEL_NAME = 'local-fallback';
const EMBEDDING_DIMENSION = 384;

// Singleton state
let isInitialized = false;

// Fallback: Simple hash-based embedding 
// This creates deterministic embeddings based on character patterns
function generateSimpleEmbedding(text: string): number[] {
  const dimension = EMBEDDING_DIMENSION;
  const embedding = new Array(dimension).fill(0);
  
  if (!text || text.length === 0) {
    // Return zero vector for empty text
    return embedding;
  }
  
  // Use character-based hash for consistent results
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Multiple hash functions for better distribution
    embedding[i % dimension] += charCode;
    embedding[(i * 7) % dimension] += charCode * 0.5;
    embedding[(i * 13) % dimension] += charCode * 0.25;
    embedding[(i * 3 + 1) % dimension] += charCode * 0.125;
  }
  
  // Add some position-based variation
  for (let i = 0; i < Math.min(text.length, 50); i++) {
    const charCode = text.charCodeAt(i);
    embedding[i % dimension] += Math.sin(charCode * (i + 1)) * 10;
  }
  
  // Normalize to unit vector
  let magnitude = 0;
  for (let i = 0; i < dimension; i++) {
    magnitude += embedding[i] * embedding[i];
  }
  magnitude = Math.sqrt(magnitude);
  
  if (magnitude > 0) {
    for (let i = 0; i < dimension; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

/**
 * Initialize the embedding service
 * For now, just marks as initialized
 * In future, could load ML model here
 */
export async function initializeEmbeddingModel(): Promise<void> {
  if (isInitialized) return;
  
  log('[Embedding] Initializing embedding service (fallback mode)');
  isInitialized = true;
}

/**
 * Load the embedding model (singleton)
 * Currently uses fallback embeddings
 */
export async function loadEmbeddingModel(): Promise<void> {
  await initializeEmbeddingModel();
}

/**
 * Generate embedding for a single text
 * @param text - Text to embed
 * @returns Promise resolving to embedding array
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  await loadEmbeddingModel();
  return generateSimpleEmbedding(text);
}

/**
 * Generate embeddings for multiple texts in batch
 * @param texts - Array of texts to embed
 * @returns Promise resolving to array of embeddings
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  await loadEmbeddingModel();
  
  // Process in batch for efficiency
  const embeddings: number[][] = [];
  
  for (const text of texts) {
    embeddings.push(generateSimpleEmbedding(text));
  }
  
  return embeddings;
}

/**
 * Check if model is loaded
 * @returns Boolean indicating if model is ready
 */
export function isModelLoaded(): boolean {
  return isInitialized;
}

/**
 * Get model info
 * @returns Object with model details
 */
export function getModelInfo() {
  return {
    name: MODEL_NAME,
    loaded: isInitialized,
    type: 'fallback-hash',
    embeddingDim: EMBEDDING_DIMENSION,
  };
}

/**
 * Calculate cosine similarity between two embeddings
 * @param a - First embedding
 * @param b - Second embedding
 * @returns Cosine similarity score
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

/**
 * Find top-K most similar chunks to a query embedding
 * @param queryEmbedding - Query embedding
 * @param chunks - Array of chunks with embeddings
 * @param k - Number of top results to return
 * @returns Array of top-K chunks sorted by similarity
 */
export interface ScoredChunk {
  chunk: {
    id: string;
    text: string;
    embedding: number[];
    metadata?: any;
  };
  score: number;
}

export function retrieveTopKChunks(
  queryEmbedding: number[],
  chunks: Array<{ id: string; text: string; embedding: number[]; metadata?: any }>,
  k: number = 5
): ScoredChunk[] {
  if (!chunks || chunks.length === 0) {
    return [];
  }

  // Score all chunks
  const scored = chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top K
  return scored.slice(0, k);
}

/**
 * Unload the model to free memory
 */
export function unloadModel(): void {
  isInitialized = false;
  log('[Embedding] Model unloaded');
}

