import AsyncStorage from '@react-native-async-storage/async-storage';

const OWNER_UUID_KEY = 'qfind.owner_uuid.v1';

function fallbackUuidV4() {
  // Non-crypto fallback (last resort)
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOrCreateOwnerUuid() {
  const existing = await AsyncStorage.getItem(OWNER_UUID_KEY);
  if (existing) return existing;

  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    fallbackUuidV4();

  await AsyncStorage.setItem(OWNER_UUID_KEY, uuid);
  return uuid;
}

