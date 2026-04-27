import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    Image,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    StatusBar,
    Linking,
    Platform,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { firstProductImageSource, parseProductImageUrls } from '../lib/productImages';
import { isShopFavorite, toggleShopFavorite } from '../lib/favorites';
import { useSettings } from '../context/SettingsContext';

const SECTION_PREVIEW = 5;
const DISCOUNTS_TITLE = 'Last discounts';
const FALLBACK_PRODUCT_IMG = require('../../assets/sneakers.jpeg');

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatMoney(value, currency) {
    if (value == null || value === '') return '';
    const c = currency || 'EUR';
    return `${Number(value)} ${c}`;
}

function rowToProductScreenPayload(row, shopMeta) {
    const currency = row.currency || 'EUR';
    const hasDiscount = row.discount_price != null;
    const urls = parseProductImageUrls(row);
    const priceLabel = formatMoney(row.price, currency);
    const discountLabel = hasDiscount ? formatMoney(row.discount_price, currency) : null;
    return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        price: priceLabel,
        discountPrice: hasDiscount ? discountLabel : null,
        image_urls: urls,
        img: firstProductImageSource(urls, FALLBACK_PRODUCT_IMG),
        store_infos: shopMeta.name,
        store_address: shopMeta.address || '',
        distance: shopMeta.distance || '-- m',
        inStock: row.in_stock !== false,
    };
}

function rowToCardModel(row, shopMeta) {
    const currency = row.currency || 'EUR';
    const hasDiscount = row.discount_price != null;
    const urls = parseProductImageUrls(row);
    return {
        id: row.id,
        name: row.name,
        img: firstProductImageSource(urls, FALLBACK_PRODUCT_IMG),
        oldPrice: hasDiscount ? formatMoney(row.price, currency) : null,
        price: hasDiscount ? formatMoney(row.discount_price, currency) : formatMoney(row.price, currency),
        row,
        shopMeta,
    };
}

function ProductCard({ card }) {
    const navigation = useNavigation();

    const handlePress = () => {
        navigation.navigate('ProductScreen', {
            product: rowToProductScreenPayload(card.row, card.shopMeta),
        });
    };

    return (
        <TouchableOpacity activeOpacity={0.85} style={styles.productCard} onPress={handlePress}>
            <View style={styles.productImageContainer}>
                <Image source={card.img} style={styles.productImage} resizeMode="cover" />
            </View>
            <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={1}>{card.name}</Text>
                <View style={styles.productMeta}>
                    <View style={styles.productPriceContainer}>
                        {card.oldPrice && (
                            <Text style={styles.productOldPrice}>{card.oldPrice}</Text>
                        )}
                        <Text style={styles.productPrice}>{card.price}</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

function CategorySection({ title, rows, shopMeta, navigation, shopId, mode, sectionId }) {
    const total = rows.length;
    const displayed = rows.slice(0, SECTION_PREVIEW);
    const showMore = total > SECTION_PREVIEW;

    const openMore = () => {
        navigation.navigate('ShopSectionScreen', {
            shopId,
            shopMeta,
            mode,
            sectionId: sectionId ?? null,
            title,
        });
    };

    if (total === 0) return null;

    return (
        <View style={styles.categorySection}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.categoryTitle}>{title}</Text>
                {showMore && (
                    <TouchableOpacity onPress={openMore} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
                        <Text style={styles.moreButtonText}>More</Text>
                    </TouchableOpacity>
                )}
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}
            >
                {displayed.map((row) => (
                    <ProductCard key={row.id} card={rowToCardModel(row, shopMeta)} />
                ))}
            </ScrollView>
        </View>
    );
}

export default function ShopScreen({ route, navigation }) {
    const shop = route?.params?.shop ?? null;
    const { formatDistance } = useSettings();

    const shopIdValid = Boolean(shop?.id && UUID_RE.test(String(shop.id)));
    const shopName = shop?.title || shop?.name || '';
    const shopAddress = shop?.adress || shop?.address || '';
    const shopDistance =
        shop?.distanceM != null
            ? formatDistance(shop.distanceM)
            : shop?.distance || '-- m';
    const shopPhone = shop?.phone || '';
    const openTime = shop?.openTime || shop?.open_time || null;
    const closeTime = shop?.closeTime || shop?.close_time || null;

    const shopMeta = useMemo(
        () => ({
            name: shopName || 'Shop',
            address: shopAddress,
            distance: shopDistance,
        }),
        [shopName, shopAddress, shopDistance]
    );

    const [catalogLoading, setCatalogLoading] = useState(false);
    const [sectionBlocks, setSectionBlocks] = useState([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!shopIdValid) {
                setSectionBlocks([]);
                return;
            }
            setCatalogLoading(true);
            try {
                const { data: sections, error: errSec } = await supabase
                    .from('shop_sections')
                    .select('id,title,sort_order')
                    .eq('shop_id', shop.id)
                    .order('sort_order', { ascending: true });
                if (errSec) throw errSec;

                const { data: products, error: errProd } = await supabase
                    .from('products')
                    .select(
                        'id,name,description,price,discount_price,currency,in_stock,image_urls,section_id,created_at'
                    )
                    .eq('shop_id', shop.id);
                if (errProd) throw errProd;
                if (cancelled) return;

                const prows = products || [];
                const discounted = prows
                    .filter((p) => p.discount_price != null && p.in_stock !== false)
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                const blocks = [];
                if (discounted.length > 0) {
                    blocks.push({
                        key: '__discounts__',
                        title: DISCOUNTS_TITLE,
                        rows: discounted,
                        mode: 'discounts',
                        sectionId: null,
                    });
                }
                for (const sec of sections || []) {
                    const inSec = prows.filter((p) => p.section_id === sec.id && p.in_stock !== false);
                    if (inSec.length === 0) continue;
                    inSec.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    blocks.push({
                        key: sec.id,
                        title: sec.title,
                        rows: inSec,
                        mode: 'section',
                        sectionId: sec.id,
                    });
                }
                setSectionBlocks(blocks);
            } catch (err) {
                console.error('[ShopScreen] catalog fetch failed', err);
                if (!cancelled) setSectionBlocks([]);
            } finally {
                if (!cancelled) setCatalogLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [shop?.id, shopIdValid]);

    const shopLogoSource =
        shop?.logoUrl != null && shop?.logoUrl !== '' ? { uri: shop.logoUrl } : null;

    // Calculate if shop is currently open
    const isShopOpen = useCallback(() => {
        if (!openTime || !closeTime) return false;
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [openH, openM] = openTime.split(':').map(Number);
        const [closeH, closeM] = closeTime.split(':').map(Number);
        const openMinutes = openH * 60 + openM;
        const closeMinutes = closeH * 60 + closeM;

        if (closeMinutes > openMinutes) {
            return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
        } else if (closeMinutes < openMinutes) {
            return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
        }
        return false;
    }, [openTime, closeTime]);

    const isOpen = isShopOpen();

    const [isFavorite, setIsFavorite] = useState(shop.isFavorite || false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const fav = await isShopFavorite(shop?.id);
                if (!cancelled) setIsFavorite(Boolean(fav));
            } catch {
                // keep default
            }
        })();
        return () => { cancelled = true; };
    }, [shop?.id]);

    const toggleFavorite = () => {
        if (!isFavorite) {
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 12 }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }),
            ]).start();
        }

        (async () => {
            try {
                const shopSnapshot = {
                    id: shop?.id,
                    title: shop?.title || shop?.name || '',
                    adress: shop?.adress || shop?.address || '',
                    address: shop?.address || shop?.adress || '',
                    distance: shop?.distance || '-- m',
                    distanceM: shop?.distanceM ?? null,
                    phone: shop?.phone || '',
                    openTime: shop?.openTime || shop?.open_time || null,
                    closeTime: shop?.closeTime || shop?.close_time || null,
                    logoUrl: shop?.logoUrl || shop?.logo_url || null,
                    coverUrl: shop?.coverUrl || shop?.cover_url || null,
                    latitude: shop?.latitude,
                    longitude: shop?.longitude,
                };

                const next = await toggleShopFavorite({
                    id: shop?.id,
                    shop: shopSnapshot,
                });
                setIsFavorite(Boolean(next));
            } catch (e) {
                console.error('[ShopScreen] toggle favorite failed', e);
            }
        })();
    };

    const handleCall = () => {
        if (shopPhone) {
            Linking.openURL(`tel:${shopPhone}`);
        }
    };

    const handleFindUs = () => {
        const lat = shop.latitude || 31.662121;
        const lng = shop.longitude || 34.554262;
        const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
        const latLng = `${lat},${lng}`;
        const label = shopName;
        const url = Platform.select({
            ios: `${scheme}${label}@${latLng}`,
            android: `${scheme}${latLng}(${label})`,
            default: `https://www.google.com/maps/search/?api=1&query=${latLng}`,
        });
        Linking.openURL(url);
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {!shopIdValid ? (
                <View style={styles.emptyState}>
                    <Ionicons name="storefront-outline" size={64} color="#c7cbd3" />
                    <Text style={styles.emptyTitle}>Shop not found</Text>
                    <Text style={styles.emptySubTitle}>Please go back and select a shop.</Text>
                    <TouchableOpacity
                        style={styles.emptyBackBtn}
                        activeOpacity={0.85}
                        onPress={() => navigation.goBack()}
                    >
                        <Ionicons name="arrow-back" size={18} color="#fff" />
                        <Text style={styles.emptyBackBtnText}>Go back</Text>
                    </TouchableOpacity>
                </View>
            ) : (
            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                bounces={false}
            >
                {/* Header Image */}
                <View style={styles.headerImageContainer}>
                    {shop?.coverUrl ? (
                        <Image source={{ uri: shop.coverUrl }} style={styles.headerImage} resizeMode="cover" />
                    ) : (
                        <View style={styles.headerPlaceholder} />
                    )}
                    {/* Back button */}
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>

                    {/* Favorite button */}
                    <TouchableOpacity
                        style={styles.favoriteButton}
                        onPress={toggleFavorite}
                        activeOpacity={0.7}
                    >
                        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                            <Ionicons
                                name={isFavorite ? 'heart' : 'heart-outline'}
                                size={24}
                                color={isFavorite ? '#1ba5b8' : '#fff'}
                            />
                        </Animated.View>
                    </TouchableOpacity>

                    {/* Dark gradient overlay at bottom */}
                    <View style={styles.headerOverlay} />
                </View>

                {/* Shop Info Card */}
                <View style={styles.infoCard}>
                    {/* Logo circle - overlapping */}
                    <View style={styles.logoContainer}>
                        <View style={styles.logoCircle}>
                            {shopLogoSource ? (
                                <Image
                                    source={shopLogoSource}
                                    style={{ width: '100%', height: '100%' }}
                                    resizeMode="cover"
                                />
                            ) : (
                                <Ionicons name="storefront" size={36} color="#000" />
                            )}
                        </View>
                    </View>

                    {/* Shop name + address + distance */}
                    <View style={styles.shopHeader}>
                        <View style={styles.shopNameBlock}>
                            <Text style={styles.shopName}>{shopName || 'Shop'}</Text>
                            {shopAddress ? <Text style={styles.shopAddress}>{shopAddress}</Text> : null}
                        </View>
                        <View style={styles.distanceBlock}>
                            <Ionicons name="walk-outline" size={18} color="#666" />
                            <Text style={styles.distanceText}>{shopDistance}</Text>
                        </View>
                    </View>

                    {/* Status */}
                    <View style={[styles.statusBadge, { backgroundColor: isOpen ? '#e8f8f0' : '#fde8e8' }]}>
                        <View style={[styles.statusDot, { backgroundColor: isOpen ? '#27ae60' : '#e74c3c' }]} />
                        <Text style={[styles.statusBadgeText, { color: isOpen ? '#27ae60' : '#e74c3c' }]}>
                            {isOpen ? 'Open now' : 'Currently closed'}
                        </Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionButtons}>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#27ae60' }]} onPress={handleCall} activeOpacity={0.8}>
                            <Ionicons name="call" size={28} color="#fff" />
                            <Text style={styles.actionBtnText}>Call the shop</Text>
                        </TouchableOpacity>

                        {openTime && closeTime ? (
                            <View style={[styles.actionBtn, { backgroundColor: isOpen ? '#fff' : '#888' }]}>
                                <Ionicons name="time-outline" size={28} color={isOpen ? '#333' : '#fff'} />
                                <Text style={[styles.actionBtnText, { color: isOpen ? '#333' : '#fff' }]}>{openTime} - {closeTime}</Text>
                            </View>
                        ) : (
                            <View style={[styles.actionBtn, { backgroundColor: '#f5f5f5' }]}>
                                <Ionicons name="time-outline" size={28} color="#999" />
                                <Text style={[styles.actionBtnText, { color: '#999' }]}>Hours n/a</Text>
                            </View>
                        )}

                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#f5f5f5' }]} onPress={handleFindUs} activeOpacity={0.8}>
                            <Ionicons name="location-sharp" size={28} color="#e74c3c" />
                            <Text style={[styles.actionBtnText, { color: '#333' }]}>Find us</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Product Sections (Supabase: sections + Last discounts) */}
                <View style={styles.productsContainer}>
                    {catalogLoading && (
                        <View style={styles.catalogLoadingBox}>
                            <ActivityIndicator size="small" color="#1ba5b8" />
                        </View>
                    )}
                    {!catalogLoading &&
                        sectionBlocks.map((b) => (
                            <CategorySection
                                key={b.key}
                                title={b.title}
                                rows={b.rows}
                                shopMeta={shopMeta}
                                navigation={navigation}
                                shopId={shop.id}
                                mode={b.mode}
                                sectionId={b.sectionId}
                            />
                        ))}
                    {!catalogLoading && shopIdValid && sectionBlocks.length === 0 && (
                        <Text style={styles.noProductsText}>No products for this shop.</Text>
                    )}
                </View>

                {/* Bottom spacing */}
                <View style={{ height: 40 }} />
            </ScrollView>
            )}
        </View>
    );
}

const HEADER_HEIGHT = 220;
const LOGO_SIZE = 70;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f2f4f7',
    },

    // Header Image
    headerImageContainer: {
        width: '100%',
        height: HEADER_HEIGHT,
        position: 'relative',
    },
    headerImage: {
        width: '100%',
        height: '100%',
    },
    headerPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#2d253b',
    },
    headerOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        backgroundColor: 'rgba(0,0,0,0.15)',
    },
    backButton: {
        position: 'absolute',
        top: 48,
        left: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    favoriteButton: {
        position: 'absolute',
        top: 48,
        right: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },

    // Info Card
    infoCard: {
        backgroundColor: '#fff',
        marginTop: -20,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 20,
        position: 'relative',
    },
    logoContainer: {
        position: 'absolute',
        top: -LOGO_SIZE / 2,
        right: 20,
        zIndex: 5,
    },
    logoCircle: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        borderRadius: LOGO_SIZE / 2,
        overflow: 'hidden',
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 5,
        borderWidth: 2,
        borderColor: '#f0f0f0',
    },

    // Shop header
    shopHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 6,
        paddingRight: LOGO_SIZE + 10,
    },
    shopNameBlock: {},
    shopName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1a1a1a',
    },
    shopAddress: {
        fontSize: 14,
        color: '#888',
        marginTop: 2,
    },
    distanceBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    distanceText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '600',
    },

    // Status
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginBottom: 12,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusBadgeText: {
        fontSize: 13,
        fontWeight: '700',
    },

    // Action Buttons
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        gap: 10,
    },
    actionBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 6,
    },
    actionBtnText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
    },

    // Products
    productsContainer: {
        paddingTop: 10,
    },
    categorySection: {
        marginBottom: 10,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    categoryTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1a1a1a',
        paddingRight: 12,
    },
    moreButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1ba5b8',
    },
    catalogLoadingBox: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    noProductsText: {
        textAlign: 'center',
        color: '#888',
        paddingVertical: 24,
        paddingHorizontal: 20,
        fontSize: 15,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: 80,
        gap: 10,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#2d253b',
        marginTop: 6,
    },
    emptySubTitle: {
        fontSize: 13,
        color: '#6b7280',
        fontWeight: '600',
        textAlign: 'center',
    },
    emptyBackBtn: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#2d253b',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
    },
    emptyBackBtnText: {
        color: '#fff',
        fontWeight: '800',
    },
    categoryScroll: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 12,
    },

    // Product Card
    productCard: {
        width: 155,
        backgroundColor: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    productImageContainer: {
        width: '100%',
        height: 110,
        backgroundColor: '#f8f8f8',
    },
    productImage: {
        width: '100%',
        height: '100%',
    },
    productInfo: {
        padding: 8,
    },
    productName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1a1a1a',
        marginBottom: 4,
    },
    productMeta: {
        flexDirection: 'row',
        justifyContent: 'flex-end'
    },
    productPriceContainer: {
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        flexDirection: 'row',
        gap: 5,
    },
    productOldPrice: {
        fontSize: 11,
        color: '#e74c3c',
        textDecorationLine: 'line-through',
    },
    productPrice: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#1a1a1a',
    },
});
