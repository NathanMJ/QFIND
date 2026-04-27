import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    Dimensions,
    Animated,
    Easing,
    Platform,
    ActivityIndicator,
    Image,
    RefreshControl,
    Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabaseClient';
import { firstProductImageSource, parseProductImageUrls } from '../lib/productImages';

// Logo Imports
const LogoApple = require('../../assets/logo-apple.png');
import { useNavigation } from '@react-navigation/native';
import FCShop from '../components/FCShop';
import FCProduct from '../components/FCProduct';
import FCSwitchMap from '../components/FCSwitchMap';
import FCFilterBar from '../components/FCFilterBar';
import BrowseScreenSkeleton from '../components/BrowseScreenSkeleton';
import { useSettings } from '../context/SettingsContext';

// react-native-maps only works on native (iOS/Android), not on web
let MapView = null;
let Marker = null;
if (Platform.OS !== 'web') {
    MapView = require('react-native-map-clustering').default;
    Marker = require('react-native-maps').Marker;
}

const { width } = Dimensions.get('window');

/** Fallback si GPS refusé / timeout / indispo (Ashkelon seed). */
const DEFAULT_COORDS = { latitude: 31.6688, longitude: 34.5718 };

/** Cap blocking GPS waits (Android can hang 15–30s without a fix). */
const GPS_FIX_TIMEOUT_MS = 4000;

function distanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371000; // meters
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(s));
}

function parsePriceToNumber(value) {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const s = String(value).trim();
    if (!s) return null;
    // Handles "123", "123.45", "123,45", "123 EUR", "₪123", etc.
    const cleaned = s.replace(',', '.').match(/-?\d+(\.\d+)?/g)?.[0];
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

const PRODUCT_IMAGES = [
    require('../../assets/iphone.jpeg'),
    require('../../assets/sneakers.jpeg'),
];

export default function BrowseScreen() {
    const navigation = useNavigation();
    const { formatDistance } = useSettings();
    const [searchQuery, setSearchQuery] = useState('');
    const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [viewMode, setViewMode] = useState('list');
    const [userLocation, setUserLocation] = useState(null);
    const [locationLoading, setLocationLoading] = useState(false);
    const [nearbyLoading, setNearbyLoading] = useState(true);
    const [selectedShop, setSelectedShop] = useState(null);
    const [shops, setShops] = useState([]);
    const [productsLeft, setProductsLeft] = useState([]);
    const [productsRight, setProductsRight] = useState([]);
    const [productsOffset, setProductsOffset] = useState(0);
    const [productsHasMore, setProductsHasMore] = useState(true);
    const [productsLoadingMore, setProductsLoadingMore] = useState(false);
    const [refreshPromptVisible, setRefreshPromptVisible] = useState(false);
    const [pendingCoords, setPendingCoords] = useState(null);
    const [filters, setFilters] = useState({
        categories: [],
        distance: null,
        priceMin: null,
        priceMax: null,
        promoOnly: false,
    });
    const [refreshing, setRefreshing] = useState(false);
    const searchAnim = useRef(new Animated.Value(0)).current;
    const panelAnim = useRef(new Animated.Value(0)).current;
    const searchInputRef = useRef(null);
    const locationSubRef = useRef(null);
    const listLocationSubRef = useRef(null);
    const lastFetchCoordsRef = useRef(null);
    const dismissedForCoordsRef = useRef(null);
    const productColumnByIdRef = useRef(new Map());
    const measuredHeightsByProductIdRef = useRef(new Map());
    const columnHeightsRef = useRef({ left: 0, right: 0 });
    const productsLoadingMoreRef = useRef(false);
    const productsHasMoreRef = useRef(true);

    const PAGE_SIZE = 8; // test value

    /** Fast path: last fix, then a single low-accuracy GPS read (one Supabase RPC after this). */
    const resolveBrowseCoords = useCallback(async () => {
        try {
            if (Platform.OS !== 'web') {
                const enabled = await Location.hasServicesEnabledAsync();
                if (!enabled) return DEFAULT_COORDS;
            }

            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return DEFAULT_COORDS;

            const last = await Location.getLastKnownPositionAsync({
                maxAge: 5 * 60 * 1000,
            });
            if (last?.coords) {
                return {
                    latitude: last.coords.latitude,
                    longitude: last.coords.longitude,
                };
            }

            const pos = await Promise.race([
                Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Low,
                }),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('location_timeout')), GPS_FIX_TIMEOUT_MS);
                }),
            ]).catch(() => null);

            if (!pos?.coords) return DEFAULT_COORDS;

            return {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            };
        } catch {
            return DEFAULT_COORDS;
        }
    }, []);

    const applyNearbyPayload = useCallback((data) => {
        const nearbyShops = data?.nearbyShops ?? [];

        const mappedShops = nearbyShops.map((s) => ({
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

        setShops(mappedShops);
    }, [formatDistance]);

    const mapNearbyProducts = useCallback((nearbyProducts, shopsById) => {
        const arr = nearbyProducts ?? [];
        return arr.map((p, i) => {
            const shop = shopsById?.get?.(p.shop_id);
            const price = p.discount_price ?? p.price;
            const oldPrice = p.discount_price ? p.price : null;
            const currency = p.currency || 'EUR';
            const imageUrls = parseProductImageUrls(p);
            const storeName = p.shop_name ?? shop?.name ?? '';
            const storeAddress = p.shop_address ?? shop?.address ?? '';

            return {
                id: p.id,
                shop_id: p.shop_id,
                section_id: p.section_id ?? null,
                name: p.name,
                rating: 4.5,
                price: price != null ? `${price} ${currency}` : '',
                priceValue: price != null ? Number(price) : null,
                old_price: oldPrice != null ? `${oldPrice} ${currency}` : null,
                oldPriceValue: oldPrice != null ? Number(oldPrice) : null,
                store_infos: storeName,
                store_address: storeAddress,
                currency,
                image_urls: imageUrls,
                img: firstProductImageSource(
                    imageUrls,
                    PRODUCT_IMAGES[i % PRODUCT_IMAGES.length]
                ),
                distanceM: p.distance_m != null ? Number(p.distance_m) : null,
                distance: formatDistance(p.distance_m),
                inStock: p.in_stock ?? true,
                description: p.description || '',
            };
        });
    }, [formatDistance]);

    const resetProductsMasonry = useCallback(() => {
        setProductsLeft([]);
        setProductsRight([]);
        setProductsOffset(0);
        setProductsHasMore(true);
        setProductsLoadingMore(false);
        productsLoadingMoreRef.current = false;
        productsHasMoreRef.current = true;
        productColumnByIdRef.current = new Map();
        measuredHeightsByProductIdRef.current = new Map();
        columnHeightsRef.current = { left: 0, right: 0 };
    }, []);

    const assignProductsToColumns = useCallback((newProducts) => {
        const leftNext = [];
        const rightNext = [];

        let leftH = columnHeightsRef.current.left || 0;
        let rightH = columnHeightsRef.current.right || 0;
        const defaultEstimateH = 320;

        for (const p of newProducts) {
            const id = p?.id;
            if (!id) continue;
            if (productColumnByIdRef.current.has(id)) continue;

            const estH = measuredHeightsByProductIdRef.current.get(id) ?? defaultEstimateH;
            const side = leftH <= rightH ? 'left' : 'right';

            productColumnByIdRef.current.set(id, side);
            if (side === 'left') {
                leftNext.push(p);
                leftH += estH;
            } else {
                rightNext.push(p);
                rightH += estH;
            }
        }

        columnHeightsRef.current = { left: leftH, right: rightH };

        if (leftNext.length) setProductsLeft((prev) => [...prev, ...leftNext]);
        if (rightNext.length) setProductsRight((prev) => [...prev, ...rightNext]);
    }, []);

    const onProductMeasured = useCallback((productId, height) => {
        if (!productId || !Number.isFinite(height) || height <= 0) return;
        const side = productColumnByIdRef.current.get(productId);
        if (!side) return;

        const prevH = measuredHeightsByProductIdRef.current.get(productId);
        if (prevH === height) return;
        measuredHeightsByProductIdRef.current.set(productId, height);

        if (prevH != null) {
            columnHeightsRef.current = {
                ...columnHeightsRef.current,
                [side]: (columnHeightsRef.current[side] || 0) - prevH + height,
            };
        } else {
            columnHeightsRef.current = {
                ...columnHeightsRef.current,
                [side]: (columnHeightsRef.current[side] || 0) + height,
            };
        }
    }, []);

    const fetchNearbyWithCoords = useCallback(async (coords) => {
        const { data, error } = await supabase.rpc('get_nearby', {
            lat: coords.latitude,
            lng: coords.longitude,
            shops_limit: 12,
            products_limit: 0,
        });
        if (error) throw error;
        applyNearbyPayload(data);
    }, [applyNearbyPayload]);

    const fetchNearbyProductsPage = useCallback(async ({ coords, offset }) => {
        const { data, error } = await supabase.rpc('get_nearby_products', {
            lat: coords.latitude,
            lng: coords.longitude,
            limit: PAGE_SIZE,
            offset,
            per_shop_max: 3,
        });
        if (error) throw error;
        return data;
    }, []);

    const loadInitialProducts = useCallback(async (coords) => {
        resetProductsMasonry();
        const payload = await fetchNearbyProductsPage({ coords, offset: 0 });
        const productsRaw = payload?.products ?? [];
        const mapped = mapNearbyProducts(productsRaw);
        assignProductsToColumns(mapped);
        setProductsOffset(mapped.length);
        const hasMore = payload?.has_more !== false;
        setProductsHasMore(Boolean(hasMore));
        productsHasMoreRef.current = Boolean(hasMore);
    }, [assignProductsToColumns, fetchNearbyProductsPage, mapNearbyProducts, resetProductsMasonry]);

    const loadMoreProducts = useCallback(async () => {
        const coords = lastFetchCoordsRef.current;
        if (!coords) return;
        if (productsLoadingMoreRef.current) return;
        if (!productsHasMoreRef.current) return;

        productsLoadingMoreRef.current = true;
        setProductsLoadingMore(true);
        try {
            const offset = productsOffset;
            const payload = await fetchNearbyProductsPage({ coords, offset });
            const productsRaw = payload?.products ?? [];
            const mapped = mapNearbyProducts(productsRaw);
            assignProductsToColumns(mapped);

            const nextOffset = offset + mapped.length;
            setProductsOffset(nextOffset);
            const hasMore = payload?.has_more !== false && mapped.length > 0;
            setProductsHasMore(Boolean(hasMore));
            productsHasMoreRef.current = Boolean(hasMore);
        } catch (e) {
            console.error('[BrowseScreen] loadMoreProducts failed:', e);
        } finally {
            productsLoadingMoreRef.current = false;
            setProductsLoadingMore(false);
        }
    }, [assignProductsToColumns, fetchNearbyProductsPage, mapNearbyProducts, productsOffset]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setNearbyLoading(true);
            try {
                const coords = await resolveBrowseCoords();
                if (cancelled) return;
                await fetchNearbyWithCoords(coords);
                lastFetchCoordsRef.current = coords;
                dismissedForCoordsRef.current = null;
                setPendingCoords(null);
                setRefreshPromptVisible(false);
                await loadInitialProducts(coords);
            } catch (err) {
                console.error('[BrowseScreen] Initial nearby fetch failed:', err);
                if (!cancelled) {
                    setShops([]);
                    resetProductsMasonry();
                }
            } finally {
                if (!cancelled) setNearbyLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [resolveBrowseCoords, fetchNearbyWithCoords, loadInitialProducts, resetProductsMasonry]);

    // Pull-to-refresh
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const coords =
                userLocation != null
                    ? { latitude: userLocation.latitude, longitude: userLocation.longitude }
                    : await resolveBrowseCoords();
            await fetchNearbyWithCoords(coords);
            lastFetchCoordsRef.current = coords;
            dismissedForCoordsRef.current = null;
            setPendingCoords(null);
            setRefreshPromptVisible(false);
            await loadInitialProducts(coords);
        } catch (err) {
            console.error('[BrowseScreen] Refresh failed:', err);
        } finally {
            setRefreshing(false);
        }
    }, [userLocation, resolveBrowseCoords, fetchNearbyWithCoords, loadInitialProducts]);

    // Lightweight location watcher (list mode): prompt refresh when moved > 10m from last fetch coords
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                if (Platform.OS !== 'web') {
                    const enabled = await Location.hasServicesEnabledAsync();
                    if (!enabled) return;
                }

                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;

                // Avoid duplicate watchers
                if (listLocationSubRef.current) {
                    listLocationSubRef.current.remove();
                    listLocationSubRef.current = null;
                }

                listLocationSubRef.current = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 8000,
                        distanceInterval: 10,
                    },
                    (location) => {
                        if (cancelled) return;
                        const c = location?.coords;
                        if (!c) return;

                        const next = { latitude: c.latitude, longitude: c.longitude };

                        // Filter noisy updates: if accuracy too poor, ignore (10m threshold is very sensitive)
                        const acc = c.accuracy;
                        if (acc != null && Number(acc) > 30) return;

                        const base = lastFetchCoordsRef.current;
                        if (!base) return;

                        const movedM = distanceMeters(base, next);
                        if (!(movedM > 10)) return;

                        // Anti-spam: if user dismissed for a nearby coords, don't re-prompt
                        const dismissed = dismissedForCoordsRef.current;
                        if (dismissed) {
                            const d = distanceMeters(dismissed, next);
                            if (d < 10) return;
                        }

                        setPendingCoords(next);
                        setRefreshPromptVisible(true);
                    }
                );
            } catch (e) {
                console.warn('[BrowseScreen] list location watcher failed:', e);
            }
        })();

        return () => {
            cancelled = true;
            if (listLocationSubRef.current) {
                listLocationSubRef.current.remove();
                listLocationSubRef.current = null;
            }
        };
    }, []);

    const openShopPanel = (shop) => {
        setSelectedShop(shop);
        Animated.timing(panelAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
        }).start();
    };

    const closeShopPanel = () => {
        Animated.timing(panelAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
            easing: Easing.in(Easing.cubic),
        }).start(() => setSelectedShop(null));
    };

    // Request permission and track GPS location in real-time
    useEffect(() => {
        if (viewMode === 'map') {
            (async () => {
                setLocationLoading(true);

                // Check that GPS is enabled on the device
                const enabled = await Location.hasServicesEnabledAsync();
                if (!enabled) {
                    alert('Please enable GPS / Location Services on your device.');
                    setLocationLoading(false);
                    return;
                }

                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    alert('Location permission denied. Please enable it in settings.');
                    setLocationLoading(false);
                    return;
                }

                // Track position in real-time
                if (locationSubRef.current) {
                    locationSubRef.current.remove();
                    locationSubRef.current = null;
                }

                locationSubRef.current = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.BestForNavigation,
                        timeInterval: 1000,
                        distanceInterval: 1,
                    },
                    (location) => {
                        setUserLocation({
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            latitudeDelta: 0.005,
                            longitudeDelta: 0.005,
                        });
                        setLocationLoading(false);
                    }
                );
            })();
        }

        // Cleanup: stop tracking when leaving map
        return () => {
            if (locationSubRef.current) {
                locationSubRef.current.remove();
                locationSubRef.current = null;
            }
        };
    }, [viewMode]);

    const toggleSearch = () => {
        if (isSearchOpen) {
            searchInputRef.current?.blur();
            Animated.timing(searchAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: false,
                easing: Easing.inOut(Easing.cubic),
            }).start(() => {
                setIsSearchOpen(false);
                setSearchQuery('');
                setAppliedSearchQuery('');
            });
        } else {
            setIsSearchOpen(true);
            Animated.timing(searchAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: false,
                easing: Easing.out(Easing.cubic),
            }).start(() => {
                searchInputRef.current?.focus();
            });
        }
    };

    const applySearch = useCallback(() => {
        const next = searchQuery;
        setAppliedSearchQuery(next);
        Keyboard.dismiss();
        // Keep dropdown open so user can quickly refine; list/map updates after commit
    }, [searchQuery]);

    const toggleCategoryFilter = (category) => {
        const current = filters.categories || [];
        const exists = current.find((f) => f.id === category.id);
        if (exists) {
            setFilters({ ...filters, categories: current.filter((f) => f.id !== category.id) });
        } else {
            setFilters({ ...filters, categories: [...current, category] });
        }
    };

    const dropdownHeight = searchAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 55],
    });
    const dropdownOpacity = searchAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
    });

    const appliedCategoryNames = (filters.categories || [])
        .map((c) => c?.name)
        .filter(Boolean);

    const categoryFilterActive = appliedCategoryNames.length > 0;
    const categorySet = new Set(appliedCategoryNames);

    const q = appliedSearchQuery.trim().toLowerCase();

    const maxDistanceM = filters.distance != null ? Number(filters.distance) : null;
    const priceMin = filters.priceMin != null ? Number(filters.priceMin) : null;
    const priceMax = filters.priceMax != null ? Number(filters.priceMax) : null;
    const promoOnly = filters.promoOnly === true;

    const filteredShops = (categoryFilterActive ? shops.filter((s) => categorySet.has(s.category)) : shops)
        .filter((s) => {
            if (maxDistanceM == null) return true;
            return s?.distanceM != null && Number(s.distanceM) <= maxDistanceM;
        })
        .filter((s) => {
            if (!q) return true;
            const hay = `${s?.name || s?.title || ''} ${s?.adress || s?.address || ''} ${s?.category || ''}`.toLowerCase();
            return hay.includes(q);
        });

    const shopById = new Map(shops.map((s) => [s.id, s]));
    const productsAll = [...productsLeft, ...productsRight];
    const filteredProducts = (categoryFilterActive
        ? productsAll.filter((p) => {
            const shop = shopById.get(p.shop_id);
            return shop?.category && categorySet.has(shop.category);
        })
        : productsAll
    )
        .filter((p) => {
            if (maxDistanceM == null) return true;
            return p?.distanceM != null && Number(p.distanceM) <= maxDistanceM;
        })
        .filter((p) => {
            const pv = p?.priceValue ?? parsePriceToNumber(p?.price);
            if (pv == null) return true; // don't hide items with unknown price
            if (priceMin != null && pv < priceMin) return false;
            if (priceMax != null && pv > priceMax) return false;
            return true;
        })
        .filter((p) => {
            if (!promoOnly) return true;
            // Promotion = has old price / discount
            return p?.oldPriceValue != null || parsePriceToNumber(p?.old_price) != null;
        })
        .filter((p) => {
        if (!q) return true;
        const hay = `${p?.name || ''} ${p?.store_infos || ''} ${p?.store_address || ''}`.toLowerCase();
        return hay.includes(q);
    });

    const filteredProductsIdSet = new Set(filteredProducts.map((p) => p.id));
    const filteredLeft = productsLeft.filter((p) => filteredProductsIdSet.has(p.id));
    const filteredRight = productsRight.filter((p) => filteredProductsIdSet.has(p.id));

    const handleSeeAllShopsNearYou = useCallback(async () => {
        try {
            const coords =
                userLocation != null
                    ? { latitude: userLocation.latitude, longitude: userLocation.longitude }
                    : await resolveBrowseCoords();
            navigation.navigate('ShopsListScreen', { coords, filters, searchQuery: appliedSearchQuery });
        } catch (err) {
            console.error('[BrowseScreen] See all shops failed:', err);
            navigation.navigate('ShopsListScreen');
        }
    }, [appliedSearchQuery, filters, navigation, resolveBrowseCoords, userLocation]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <TouchableOpacity
                onPress={toggleSearch}
                activeOpacity={0.7}
                style={{
                    position: 'absolute',
                    bottom: 16,
                    right: 16,
                    backgroundColor: '#2d253b',
                    borderRadius: 50,
                    width: 42,
                    height: 42,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: 'rgba(255,255,255,0.9)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 6,
                    zIndex: 20,
                }}
            >
                <Ionicons name={isSearchOpen ? 'close' : 'search-outline'} size={18} color="#ffffff" />
            </TouchableOpacity>


            {/* Header */}
            <View style={{
                backgroundColor: '#f2f4f7ff',
                paddingHorizontal: 16,
                paddingTop: 50,
                paddingBottom: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
                elevation: 5,
                zIndex: 10,
            }}>
                <Text style={{ fontSize: 34, fontWeight: 'bold', color: '#2d253bff' }}>QFind</Text>
                <FCSwitchMap mode={viewMode} onModeChange={setViewMode} />
            </View>

            {/* Filter Bar */}
            <FCFilterBar filters={filters} onFiltersChange={setFilters} />

            {/* Search dropdown */}
            <Animated.View style={{
                height: dropdownHeight,
                opacity: dropdownOpacity,
                overflow: 'hidden',
                backgroundColor: '#f2f4f7',
                paddingHorizontal: 16,
                justifyContent: 'center',
                zIndex: 5,
            }}>
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#eceff3ff',
                    borderRadius: 8,
                    padding: 8,
                    borderColor: '#2d253bff',
                    borderWidth: 1,
                }}>
                    <Ionicons name="search-outline" size={20} color="#2d253bff" />
                    <TextInput
                        ref={searchInputRef}
                        placeholder="Search..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={applySearch}
                        style={{
                            flex: 1,
                            fontSize: 16,
                            color: '#2d253bff',
                            marginLeft: 8,
                            outlineStyle: 'none',
                        }}
                    />
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={applySearch}
                        style={{
                            marginLeft: 10,
                            backgroundColor: '#2d253b',
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            </Animated.View>

            {viewMode === 'list' ? (
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    onScroll={({ nativeEvent }) => {
                        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent || {};
                        if (!layoutMeasurement || !contentOffset || !contentSize) return;
                        const distanceToBottom =
                            contentSize.height - (layoutMeasurement.height + contentOffset.y);
                        if (distanceToBottom < 350) {
                            loadMoreProducts();
                        }
                    }}
                    scrollEventThrottle={180}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#2d253b"
                            colors={['#2d253b']}
                            progressBackgroundColor="#f2f4f7"
                        />
                    }
                >
                    {nearbyLoading ? (
                        <BrowseScreenSkeleton />
                    ) : (
                        <>
                            {filteredShops.length > 0 && (
                                <View style={styles.containerSection}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <Text style={styles.sectionTitle}>Shops near you</Text>
                                        <TouchableOpacity
                                            onPress={handleSeeAllShopsNearYou}
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}
                                        >
                                            <Text style={{ textAlign: 'right', fontSize: 16, fontWeight: 'bold' }}>See all </Text>
                                            <Ionicons name="chevron-forward-outline" size={24} color="black" />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ position: 'relative' }}>
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={{ gap: 3 }}
                                        >
                                            {filteredShops.map((shop) => (
                                                <FCShop key={shop.id} shop={shop} />
                                            ))}
                                        </ScrollView>

                                    </View>
                                </View>
                            )}

                            {filteredProducts.length > 0 && (
                                <View style={styles.containerSection}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <Text style={styles.sectionTitle}>Products near you</Text>
                                    </View>
                                    <View style={styles.masonryContainer}>
                                        <View style={styles.masonryColumn}>
                                            {filteredLeft.map((p) => (
                                                <FCProduct
                                                    key={`left-${p.id}`}
                                                    product={p}
                                                    onMeasured={onProductMeasured}
                                                />
                                            ))}
                                        </View>
                                        <View style={styles.masonryColumn}>
                                            {filteredRight.map((p) => (
                                                <FCProduct
                                                    key={`right-${p.id}`}
                                                    product={p}
                                                    onMeasured={onProductMeasured}
                                                />
                                            ))}
                                        </View>
                                    </View>

                                    {productsLoadingMore && (
                                        <View style={{ paddingVertical: 6 }}>
                                            <ActivityIndicator size="small" color="#2d253b" />
                                        </View>
                                    )}

                                    {!productsLoadingMore && productsHasMore && (
                                        <TouchableOpacity
                                            onPress={loadMoreProducts}
                                            activeOpacity={0.85}
                                            style={{
                                                alignSelf: 'center',
                                                marginTop: 8,
                                                backgroundColor: '#2d253b',
                                                paddingHorizontal: 14,
                                                paddingVertical: 10,
                                                borderRadius: 12,
                                            }}
                                        >
                                            <Text style={{ color: 'white', fontWeight: '900' }}>Load more</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            ) : (
                locationLoading ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#2d253b" />
                        <Text style={{ marginTop: 10, color: '#2d253b' }}>Locating...</Text>
                    </View>
                ) : (
                    MapView && <MapView
                        style={styles.map}
                        clusterColor="#2d253b"
                        clusterTextColor="white"
                        renderCluster={(cluster) => {
                            const { id, geometry, onPress, properties } = cluster;
                            const pointCount = properties.point_count;
                            const coordinate = {
                                latitude: geometry.coordinates[1],
                                longitude: geometry.coordinates[0],
                            };
                            return (
                                <Marker
                                    key={`cluster-${id}`}
                                    coordinate={coordinate}
                                    onPress={onPress}
                                    zIndex={100} // Ensure clusters are above other markers
                                >
                                    <View style={styles.clusterMarker}>
                                        <Text style={styles.clusterText}>{pointCount}</Text>
                                    </View>
                                </Marker>
                            );
                        }}
                        region={userLocation || {
                            latitude: 31.6688,
                            longitude: 34.5718,
                            latitudeDelta: 0.01,
                            longitudeDelta: 0.01,
                        }}
                        showsUserLocation={true}
                        showsMyLocationButton={true}
                    >
                        {/* User location marker */}
                        {userLocation && Marker && (
                            <Marker
                                coordinate={{
                                    latitude: userLocation.latitude,
                                    longitude: userLocation.longitude,
                                }}
                                title="My location"
                                description="You are here"
                                pinColor="#1ba5b8"
                                cluster={false}
                            />
                        )}

                        {/* Shop markers */}
                        {Marker && filteredShops.map((shop) => (
                            <Marker
                                key={shop.id}
                                coordinate={{
                                    latitude: shop.latitude,
                                    longitude: shop.longitude,
                                }}
                                onPress={() => openShopPanel(shop)}
                            >
                                <View style={styles.customMarker}>
                                    <View style={[styles.markerCircle, { backgroundColor: 'white' }]}>
                                        <Image
                                            source={shop.logo || LogoApple}
                                            style={styles.markerImage}
                                            resizeMode="cover"
                                        />
                                    </View>
                                </View>
                            </Marker>
                        ))}
                    </MapView>
                )
            )
            }

            {/* Shop preview panel */}
            {selectedShop && (
                <Animated.View style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    transform: [{
                        translateY: panelAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [300, 0],
                        }),
                    }],
                    backgroundColor: 'white',
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    padding: 20,
                    paddingBottom: 30,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -3 },
                    shadowOpacity: 0.2,
                    shadowRadius: 8,
                    elevation: 15,
                    zIndex: 30,
                }}>
                    {/* Drag handle */}
                    <View style={{ alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd' }} />
                    </View>

                    {/* Header with close button */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2d253b' }}>{selectedShop.name}</Text>
                        <TouchableOpacity onPress={closeShopPanel} activeOpacity={0.7}>
                            <Ionicons name="close-circle" size={28} color="#ccc" />
                        </TouchableOpacity>
                    </View>

                    {/* Category */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                        <Ionicons name="pricetag" size={16} color="#FF6B6B" />
                        <Text style={{ fontSize: 14, color: '#666', fontWeight: '600' }}>{selectedShop.category}</Text>
                    </View>

                    {/* Description */}
                    <Text style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>{selectedShop.description}</Text>

                    {/* Button */}
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                            closeShopPanel();
                            navigation.navigate('ShopScreen', { shop: selectedShop });
                        }}
                        style={{
                            backgroundColor: '#2d253b',
                            borderRadius: 12,
                            paddingVertical: 14,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>View shop</Text>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {refreshPromptVisible && (
                <View
                    style={{
                        position: 'absolute',
                        left: 16,
                        right: 16,
                        bottom: selectedShop ? 320 : 90,
                        backgroundColor: 'white',
                        borderRadius: 14,
                        padding: 12,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15,
                        shadowRadius: 10,
                        elevation: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                    }}
                >
                    <Text style={{ flex: 1, fontWeight: '800', color: '#2d253b' }}>
                        Nouvelle position détectée. Rafraîchir les résultats ?
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                                dismissedForCoordsRef.current = pendingCoords;
                                setRefreshPromptVisible(false);
                            }}
                        >
                            <Text style={{ fontWeight: '900', color: '#6b7280' }}>Non</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={async () => {
                                if (!pendingCoords) return;
                                setRefreshing(true);
                                try {
                                    await fetchNearbyWithCoords(pendingCoords);
                                    lastFetchCoordsRef.current = pendingCoords;
                                } catch (e) {
                                    console.error('[BrowseScreen] Prompt refresh failed:', e);
                                } finally {
                                    setRefreshing(false);
                                    dismissedForCoordsRef.current = null;
                                    setPendingCoords(null);
                                    setRefreshPromptVisible(false);
                                }
                            }}
                            style={{
                                backgroundColor: '#2d253b',
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 10,
                            }}
                        >
                            <Text style={{ color: 'white', fontWeight: '900' }}>Refresh</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f2f4f7',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 30,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2d253bff',
    },
    containerSection: {
        margin: 10
    },
    masonryContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 20,
        padding: 10
    },
    masonryColumn: {
        flex: 1,
        gap: 0,
    },
    map: {
        flex: 1,
    },
    customMarker: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerCircle: {
        width: 36,
        height: 36,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'white',
        backgroundColor: 'white',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 15,
        overflow: 'hidden',
    },
    markerImage: {
        width: '100%',
        height: '100%',
    },
    clusterMarker: {
        width: 36,
        height: 36,
        borderRadius: 20,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#2d253b',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 10,
    },
    clusterText: {
        color: '#2d253b',
        fontWeight: 'bold',
        fontSize: 16,
    },
});
