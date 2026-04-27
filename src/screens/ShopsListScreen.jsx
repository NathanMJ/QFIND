import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    Image,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabaseClient';
import { useSettings } from '../context/SettingsContext';

const LogoApple = require('../../assets/logo-apple.png');

const DEFAULT_COORDS = { latitude: 31.6688, longitude: 34.5718 };
const GPS_FIX_TIMEOUT_MS = 4000;

function ShopListItem({ shop }) {
    const navigation = useNavigation();
    const { formatDistance } = useSettings();
    const [isFavorite, setIsFavorite] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const toggleFavorite = () => {
        if (!isFavorite) {
            Animated.sequence([
                Animated.spring(scaleAnim, {
                    toValue: 1.35,
                    useNativeDriver: true,
                    speed: 50,
                    bounciness: 12,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    speed: 20,
                    bounciness: 10,
                }),
            ]).start();
        }
        setIsFavorite((prev) => !prev);
    };

    const handlePress = () => {
        navigation.navigate('ShopScreen', { shop });
    };

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={handlePress}
            style={styles.shopCard}
        >
            {/* Shop Image */}
            <View style={styles.shopImageContainer}>
                {(shop?.coverUrl || shop?.cover_url) ? (
                    <Image
                        source={{ uri: String(shop.coverUrl || shop.cover_url).trim() }}
                        style={styles.shopImage}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={styles.shopImagePlaceholder} />
                )}
                {/* Open/Closed badge */}
                <View style={[
                    styles.statusBadge,
                    { backgroundColor: shop.isOpen ? '#27ae6020' : '#e74c3c20' },
                ]}>
                    <View style={[
                        styles.statusDot,
                        { backgroundColor: shop.isOpen ? '#27ae60' : '#e74c3c' },
                    ]} />
                    <Text style={[
                        styles.statusBadgeText,
                        { color: shop.isOpen ? '#27ae60' : '#e74c3c' },
                    ]}>
                        {shop.isOpen ? 'Open' : 'Closed'}
                    </Text>
                </View>

                {/* Favorite button */}
                <TouchableOpacity
                    onPress={toggleFavorite}
                    activeOpacity={0.7}
                    style={styles.favoriteBtn}
                >
                    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                        <Ionicons
                            name={isFavorite ? 'heart' : 'heart-outline'}
                            size={20}
                            color={isFavorite ? '#1ba5b8' : '#fff'}
                        />
                    </Animated.View>
                </TouchableOpacity>
            </View>

            {/* Shop Info */}
            <View style={styles.shopInfo}>
                <View style={styles.shopInfoTop}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
                        <View style={styles.categoryRow}>
                            <Ionicons name="pricetag-outline" size={12} color="#888" />
                            <Text style={styles.shopCategory}>{shop.category}</Text>
                        </View>
                    </View>
                    {/* Logo */}
                    <View style={styles.shopLogo}>
                        {(shop?.logoUrl || shop?.logo_url) ? (
                            <Image
                                source={{ uri: String(shop.logoUrl || shop.logo_url).trim() }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={styles.shopLogoPlaceholder}>
                                <Ionicons name="storefront-outline" size={20} color="#2d253b" />
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.shopAddress}>
                    <Ionicons name="location-outline" size={14} color="#999" />
                    <Text style={styles.shopAddressText} numberOfLines={1}>{shop.adress}</Text>
                </View>

                <View style={styles.shopMeta}>
                    <View style={styles.metaItem}>
                        <Ionicons name="star" size={16} color="#F59E0B" />
                        <Text style={styles.metaText}>{shop.rating}</Text>
                        <Text style={styles.metaSubtext}>({shop.reviews})</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="walk-outline" size={16} color="#3B82F6" />
                        <Text style={styles.metaText}>
                            {shop?.distanceM != null ? formatDistance(shop.distanceM) : shop.distance}
                        </Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={16} color="#888" />
                        <Text style={styles.metaSubtext}>{shop.hours}</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

export default function ShopsListScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { formatDistance } = useSettings();
    const initialCoords = route?.params?.coords || null;
    const appliedFilters = route?.params?.filters || null;
    const appliedSearchQuery = route?.params?.searchQuery || '';

    const [coords, setCoords] = useState(initialCoords);
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);

    const resultsCountText = useMemo(() => {
        if (loading) return 'Loading...';
        if (errorMsg) return errorMsg;
        return `${shops.length} shops found`;
    }, [errorMsg, loading, shops.length]);

    const resolveCoords = useRef(async () => {
        try {
            if (coords) return coords;

            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return DEFAULT_COORDS;

            const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
            if (last?.coords) {
                return { latitude: last.coords.latitude, longitude: last.coords.longitude };
            }

            const pos = await Promise.race([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('location_timeout')), GPS_FIX_TIMEOUT_MS)),
            ]).catch(() => null);

            if (!pos?.coords) return DEFAULT_COORDS;
            return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch {
            return DEFAULT_COORDS;
        }
    }).current;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setErrorMsg(null);
            try {
                const c = await resolveCoords();
                if (cancelled) return;
                setCoords(c);

                const { data, error } = await supabase.rpc('get_nearby', {
                    lat: c.latitude,
                    lng: c.longitude,
                    shops_limit: 100,
                    products_limit: 0,
                });
                if (error) throw error;

                const nearbyShops = data?.nearbyShops ?? [];
                const mapped = nearbyShops.map((s) => ({
                    id: s.id,
                    name: s.name,
                    title: s.name,
                    category: s.category || 'Shop',
                    adress: s.address || '',
                    latitude: s.latitude,
                    longitude: s.longitude,
                    description: '',
                    rating: 4.5,
                    reviews: 0,
                    distanceM: s.distance_m != null ? Number(s.distance_m) : null,
                    distance: formatDistance(s.distance_m),
                    phone: s.phone || '',
                    openTime: s.open_time || null,
                    closeTime: s.close_time || null,
                    hours: s.open_time && s.close_time ? `${s.open_time} - ${s.close_time}` : '',
                    isOpen: true,
                    logo: s.logo_url ? { uri: s.logo_url } : LogoApple,
                    logoUrl: s.logo_url || null,
                    coverUrl: s.cover_url || null,
                }));

                let filtered = mapped;
                const catNames = (appliedFilters?.categories || []).map((c) => c?.name).filter(Boolean);
                if (catNames.length > 0) {
                    const set = new Set(catNames);
                    filtered = filtered.filter((s) => set.has(s.category));
                }
                const dist = appliedFilters?.distance;
                if (dist != null) {
                    const maxM = Number(dist);
                    filtered = filtered.filter((s) => s.distanceM != null && s.distanceM <= maxM);
                }

                const q = String(appliedSearchQuery || '').trim().toLowerCase();
                if (q) {
                    filtered = filtered.filter((s) => {
                        const hay = `${s?.name || s?.title || ''} ${s?.adress || s?.address || ''} ${s?.category || ''}`.toLowerCase();
                        return hay.includes(q);
                    });
                }

                if (!cancelled) setShops(filtered);
            } catch (e) {
                console.error('[ShopsListScreen] nearby fetch failed:', e);
                if (!cancelled) {
                    setShops([]);
                    setErrorMsg('Failed to load nearby shops');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appliedFilters, appliedSearchQuery, formatDistance, resolveCoords]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                    style={styles.backButton}
                >
                    <Ionicons name="arrow-back" size={24} color="#2d253b" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Shops near you</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Results count */}
            <View style={styles.resultsBar}>
                <Text style={styles.resultsCount}>{resultsCountText}</Text>
            </View>

            {/* Shop List */}
            {loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#2d253b" />
                    <Text style={{ marginTop: 10, color: '#2d253b' }}>Loading shops...</Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {shops.map((shop) => (
                        <ShopListItem key={shop.id} shop={shop} />
                    ))}
                    <View style={{ height: 30 }} />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f2f4f7',
    },
    header: {
        backgroundColor: '#f2f4f7',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
        zIndex: 10,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#e8ebf0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2d253b',
    },
    resultsBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    resultsCount: {
        fontSize: 14,
        color: '#888',
        fontWeight: '500',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        gap: 14,
    },

    // Shop Card
    shopCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    shopImageContainer: {
        width: '100%',
        height: 140,
        position: 'relative',
    },
    shopImage: {
        width: '100%',
        height: '100%',
    },
    shopImagePlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#e8ebf0',
    },
    statusBadge: {
        position: 'absolute',
        top: 12,
        left: 12,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        gap: 5,
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    statusBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    favoriteBtn: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: '#00000044',
        padding: 6,
        borderRadius: 50,
    },

    // Shop Info
    shopInfo: {
        padding: 14,
        gap: 8,
    },
    shopInfoTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    shopName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1a1a1a',
    },
    categoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    shopCategory: {
        fontSize: 12,
        color: '#888',
        fontWeight: '500',
    },
    shopLogo: {
        width: 42,
        height: 42,
        borderRadius: 21,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    shopLogoPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#e8ebf0',
    },
    shopAddress: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    shopAddressText: {
        fontSize: 13,
        color: '#999',
        flex: 1,
    },
    shopMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    metaSubtext: {
        fontSize: 12,
        color: '#999',
    },
});
