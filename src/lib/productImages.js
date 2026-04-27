/**
 * Normalize product image URLs from API (`image_urls` only; first URL used for display).
 * @param {Record<string, unknown>} row
 * @returns {string[]}
 */
export function parseProductImageUrls(row) {
    if (!row) return [];
    const raw = row.image_urls ?? row.imageUrls;
    let arr = [];
    if (Array.isArray(raw)) {
        arr = raw
            .map((x) => (typeof x === 'string' ? x : x && typeof x.url === 'string' ? x.url : null))
            .filter(Boolean);
    } else if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                arr = parsed.map(String).filter(Boolean);
            }
        } catch {
            /* ignore */
        }
    }
    return arr;
}

/**
 * First remote image as React Native Image source, or fallback asset (number from require()).
 * @param {string[]} urls
 * @param {number} fallbackRequire
 */
export function firstProductImageSource(urls, fallbackRequire) {
    const u = urls[0];
    if (u) return { uri: String(u) };
    return fallbackRequire;
}
