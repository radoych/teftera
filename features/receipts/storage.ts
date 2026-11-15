// features/receipts/storage.ts — the ONLY module that uploads receipt images.
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/services/supabase';
import { buildReceiptObjectKey } from './objectKey';

const RECEIPT_BUCKET = 'receipts';
const RECEIPT_CONTENT_TYPE = 'image/jpeg';

/**
 * Upload a local JPEG to the private `receipts` bucket under
 * `{householdId}/{uuid}.jpg`. Returns the object key (storage path) for later
 * signed-URL access in Day 11. Throws on read or upload failure.
 */
export async function uploadReceipt(
  localUri: string,
  householdId: string,
): Promise<{ storagePath: string }> {
  const key = buildReceiptObjectKey(householdId, Crypto.randomUUID());
  const bytes = await new File(localUri).bytes();
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(key, bytes, { contentType: RECEIPT_CONTENT_TYPE, upsert: false });
  if (error) throw error;
  return { storagePath: key };
}
