import { supabase } from './supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as base64Decode } from 'base-64';

export const PRODUCT_IMAGES_BUCKET = 'product_images';
export const SHOP_IMAGES_BUCKET = 'shop_images';

function guessFileExt(contentType) {
  if (!contentType) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('heic')) return 'heic';
  return 'jpg';
}

function base64ToUint8Array(base64) {
  const binary = base64Decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Upload a local image (file://...) to Supabase Storage and return its public URL.
 * Works in Expo/RN by reading the file via expo-file-system (fetch(file://) is unreliable on Android).
 */
export async function uploadProductImage({
  ownerUuid,
  shopId,
  productId,
  index,
  localUri,
  contentType: contentTypeOverride,
}) {
  const encodingBase64 =
    FileSystem.EncodingType?.Base64 ??
    FileSystem.EncodingType?.base64 ??
    'base64';

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: encodingBase64,
  });
  const bytes = base64ToUint8Array(base64);
  const contentType = contentTypeOverride || 'image/jpeg';
  const ext = guessFileExt(contentType);

  const path = `${ownerUuid}/${shopId}/${productId}/${index}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) throw new Error('missing_public_url');

  return publicUrl;
}

/**
 * Upload a shop image (logo or cover) and return its public URL.
 * Uses a unique filename (no upsert needed).
 */
export async function uploadShopImage({
  ownerUuid,
  shopId,
  kind, // 'logo' | 'cover'
  localUri,
  contentType: contentTypeOverride,
}) {
  const encodingBase64 =
    FileSystem.EncodingType?.Base64 ??
    FileSystem.EncodingType?.base64 ??
    'base64';

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: encodingBase64,
  });
  const bytes = base64ToUint8Array(base64);
  const contentType = contentTypeOverride || 'image/jpeg';
  const ext = guessFileExt(contentType);

  const safeKind = kind === 'logo' ? 'logo' : 'cover';
  const filename = `${safeKind}_${Date.now()}.${ext}`;
  const path = `${ownerUuid}/${shopId}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(SHOP_IMAGES_BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(SHOP_IMAGES_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) throw new Error('missing_public_url');

  return publicUrl;
}

