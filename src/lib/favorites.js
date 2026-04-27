import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITE_PRODUCTS_KEY = 'qfind.favorites.products.v1';
const FAVORITE_SHOPS_KEY = 'qfind.favorites.shops.v1';

async function readJson(key, fallback) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function uniqByIdKeepFirst(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const id = it?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

// ---------------------------
// Products
// ---------------------------

export async function getFavoriteProducts() {
  const list = await readJson(FAVORITE_PRODUCTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function isProductFavorite(productId) {
  if (!productId) return false;
  const list = await getFavoriteProducts();
  return list.some((f) => String(f?.id) === String(productId));
}

export async function addProductFavorite({ id, product }) {
  if (!id) throw new Error('missing_product_id');
  const now = Date.now();
  const next = [
    { id: String(id), addedAt: now, product: product || null },
    ...(await getFavoriteProducts()),
  ];
  const deduped = uniqByIdKeepFirst(next);
  await writeJson(FAVORITE_PRODUCTS_KEY, deduped);
  return deduped;
}

export async function removeProductFavorite(productId) {
  const list = await getFavoriteProducts();
  const next = list.filter((f) => String(f?.id) !== String(productId));
  await writeJson(FAVORITE_PRODUCTS_KEY, next);
  return next;
}

export async function toggleProductFavorite({ id, product }) {
  const fav = await isProductFavorite(id);
  if (fav) {
    await removeProductFavorite(id);
    return false;
  }
  await addProductFavorite({ id, product });
  return true;
}

// ---------------------------
// Shops
// ---------------------------

export async function getFavoriteShops() {
  const list = await readJson(FAVORITE_SHOPS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function isShopFavorite(shopId) {
  if (!shopId) return false;
  const list = await getFavoriteShops();
  return list.some((f) => String(f?.id) === String(shopId));
}

export async function addShopFavorite({ id, shop }) {
  if (!id) throw new Error('missing_shop_id');
  const now = Date.now();
  const next = [
    { id: String(id), addedAt: now, shop: shop || null },
    ...(await getFavoriteShops()),
  ];
  const deduped = uniqByIdKeepFirst(next);
  await writeJson(FAVORITE_SHOPS_KEY, deduped);
  return deduped;
}

export async function removeShopFavorite(shopId) {
  const list = await getFavoriteShops();
  const next = list.filter((f) => String(f?.id) !== String(shopId));
  await writeJson(FAVORITE_SHOPS_KEY, next);
  return next;
}

export async function toggleShopFavorite({ id, shop }) {
  const fav = await isShopFavorite(id);
  if (fav) {
    await removeShopFavorite(id);
    return false;
  }
  await addShopFavorite({ id, shop });
  return true;
}

