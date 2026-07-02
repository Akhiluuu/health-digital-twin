// services/textExtraction.ts
// Text extraction from images and documents

import * as ImagePicker from 'expo-image-picker';

import { log, error } from "../utils/logger";

// Request permissions for image picker
export async function requestImagePermissions(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Pick an image and extract text using OCR
 * This uses expo-image-picker to get the image
 * For actual OCR, we would need to integrate with ML Kit or a server
 * 
 * @returns Extracted text or null
 */
export async function extractTextFromImage(): Promise<string | null> {
  try {
    // Request permissions
    const hasPermission = await requestImagePermissions();
    if (!hasPermission) {
      log('[TextExtraction] Permission denied');
      return null;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      log('[TextExtraction] No image selected');
      return null;
    }

    const asset = result.assets[0];
    log('[TextExtraction] Image selected:', asset.uri);

    // For now, return a placeholder - actual OCR would require:
    // 1. ML Kit (react-native-mlkit-ocr)
    // 2. Or send to server for OCR
    // 
    // The implementation would look like:
    // const text = await MLKitOCR.recognizeText(asset.uri);
    // return text;

    // Placeholder: return the image info for now
    // In production, integrate with ML Kit
    log('[TextExtraction] OCR not implemented - requires ML Kit integration');
    return `[Image selected: ${asset.fileName || 'unnamed'}]\nNote: OCR requires ML Kit integration. Please use document upload for text extraction.`;
  } catch (err: unknown) {
    error('[TextExtraction] Error:', err);
    return null;
  }
}

/**
 * Get image info from picker result
 * @param asset - Image picker asset
 * @returns Image info object
 */
export function getImageInfo(asset: ImagePicker.ImagePickerAsset): {
  uri: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
} {
  return {
    uri: asset.uri,
    name: asset.fileName || `image_${Date.now()}.jpg`,
    mimeType: asset.mimeType || 'image/jpeg',
    width: asset.width || 0,
    height: asset.height || 0,
  };
}

/**
 * Get image mime type from URI
 * @param uri - Image URI
 * @returns Mime type string
 */
export function getImageMimeType(uri: string): string {
  const extension = uri.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
}

/**
 * Simple text extraction placeholder
 * In a production app, this would use:
 * - react-native-mlkit-ocr for on-device OCR
 * - Or expo-document-scanner for document scanning
 * 
 * @param text - Raw text to clean
 * @returns Cleaned text
 */
export function cleanExtractedText(text: string): string {
  if (!text) return '';
  
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove special characters that might be OCR artifacts
    .replace(/[^\x20-\x7E\n\r\t]/g, '')
    // Fix common OCR errors
    .replace(/\|/g, 'l')
    .replace(/0(?=[a-zA-Z])/g, 'O')
    .replace(/(?<=[a-zA-Z])0/g, 'O')
    .trim();
}

/**
 * Extract text from a document (placeholder for PDF)
 * For PDF text extraction, you would need:
 * - expo-extract-text (if available)
 * - Or send to server
 * 
 * @param uri - Document URI
 * @returns Extracted text
 */
export async function extractTextFromPDF(_uri: string): Promise<string> {
  // This is a placeholder - PDF text extraction requires additional libraries
  // In production, use expo-pdf-reader or similar
  
  log('[TextExtraction] PDF extraction not fully implemented');
  
  // Return placeholder for now
  return `[PDF document]\nNote: Full PDF text extraction requires additional integration.`;
}

/**
 * Validate that extracted text is meaningful
 * @param text - Extracted text
 * @returns Boolean indicating if text is valid
 */
export function isValidExtractedText(text: string | null | undefined): boolean {
  if (!text) return false;
  
  // Check minimum length
  if (text.length < 10) return false;
  
  // Check for meaningful content (at least some letters)
  const hasLetters = /[a-zA-Z]{3,}/.test(text);
  
  return hasLetters;
}

