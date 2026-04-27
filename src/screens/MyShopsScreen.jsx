import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Pressable,
    ScrollView,
    Image,
    Alert,
    TextInput,
    Modal,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Animated,
    Dimensions,
    ActivityIndicator,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SHOP_MENU_WIDTH = 168;
const SHOP_MENU_SCREEN_MARGIN = 8;
const PICKER_ITEM_HEIGHT = 44;
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { getOrCreateOwnerUuid } from '../lib/ownerUuid';

// Available shop categories
const SHOP_CATEGORIES = [
    { key: 'Tech', label: 'Tech', icon: 'laptop-outline', color: '#6366F1' },
    { key: 'Shopping', label: 'Shopping', icon: 'bag-outline', color: '#A78BFA' },
    { key: 'Restaurants', label: 'Restaurants', icon: 'restaurant-outline', color: '#FF6B6B' },
    { key: 'Cafes', label: 'Cafes', icon: 'cafe-outline', color: '#4ECDC4' },
    { key: 'Services', label: 'Services', icon: 'construct-outline', color: '#3B82F6' },
    { key: 'Health', label: 'Health', icon: 'fitness-outline', color: '#EC4899' },
    { key: 'Beauty', label: 'Beauty', icon: 'sparkles-outline', color: '#F472B6' },
    { key: 'Fun', label: 'Fun', icon: 'game-controller-outline', color: '#F59E0B' },
    { key: 'Education', label: 'Education', icon: 'school-outline', color: '#14B8A6' },
    { key: 'Automotive', label: 'Automotive', icon: 'car-outline', color: '#64748B' },
];

const MAX_CATEGORIES = 5;

/** When Photon omits housenumber, try to keep a number the user typed (e.g. "Shay Agnon 32"). */
function guessHouseNumberFromQuery(query, streetHint, nameHint) {
    const qh = String(query || '').trim();
    if (!qh) return '';
    const contextLower = `${streetHint || ''} ${nameHint || ''}`.toLowerCase();
    const re = /\b(\d{1,4}[a-zA-Z]?)\b/g;
    const candidates = [];
    let m;
    while ((m = re.exec(qh)) !== null) {
        const token = m[1];
        if (/^\d{7}$/.test(token)) continue;
        if (/^\d{5}$/.test(token)) continue;
        if (/^\d{4}$/.test(token)) {
            const n = parseInt(token, 10);
            if (n >= 1900 && n <= 2099) continue;
        }
        candidates.push(token);
    }
    if (candidates.length === 0) return '';
    const uniq = [...new Set(candidates)];
    for (const c of uniq) {
        if (!contextLower.includes(c.toLowerCase())) return c;
    }
    return uniq[0] || '';
}

export default function MyShopsScreen() {
    const navigation = useNavigation();
    const [shops, setShops] = useState([]);
    const [shopsLoading, setShopsLoading] = useState(true);
    const [shopMenuOpenId, setShopMenuOpenId] = useState(null);
    const [shopMenuLayout, setShopMenuLayout] = useState(null);
    const menuBtnRefs = useRef({});
    const [ownerUuid, setOwnerUuid] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [newShopName, setNewShopName] = useState('');
    const [newShopAddress, setNewShopAddress] = useState('');
    const [newShopPhone, setNewShopPhone] = useState('');
    const [newShopOpenTime, setNewShopOpenTime] = useState('09:00');
    const [newShopCloseTime, setNewShopCloseTime] = useState('21:00');
    const [selectedCategories, setSelectedCategories] = useState([]);

    // Address autocomplete (OSM via Photon - works well on mobile without API key)
    const [addressSuggestions, setAddressSuggestions] = useState([]);
    const [addressSuggestLoading, setAddressSuggestLoading] = useState(false);
    const [addressSuggestError, setAddressSuggestError] = useState('');
    const [addressFieldFocused, setAddressFieldFocused] = useState(false);
    const addressReqSeq = useRef(0);
    const skipAddressSuggestUntilRefocus = useRef(false);
    const addressInputRef = useRef(null);
    /** Delay blur so a tap on a suggestion can run onPress before the list unmounts. */
    const addressBlurTimeoutRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const uuid = await getOrCreateOwnerUuid();
                if (!cancelled) setOwnerUuid(uuid);
                // Register UUID in DB (no-op if already exists)
                await supabase.rpc('ensure_owner', { p_owner: uuid });
            } catch (e) {
                console.error('[MyShopsScreen] owner uuid init failed', e);
                if (!cancelled) setOwnerUuid(null);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const fetchMyShops = useCallback(async () => {
        if (!ownerUuid) return;
        setShopsLoading(true);
        try {
            const { data, error } = await supabase
                .from('shops')
                .select('id,name,address,category,phone,open_time,close_time,logo_url,cover_url,created_at,owner_uuid')
                .eq('owner_uuid', ownerUuid)
                .order('created_at', { ascending: false });
            if (error) throw error;

            const mapped = (data || []).map((s) => ({
                id: s.id,
                name: s.name,
                address: s.address || '',
                phone: s.phone || '',
                openTime: s.open_time || null,
                closeTime: s.close_time || null,
                hours: s.open_time && s.close_time ? `${s.open_time} - ${s.close_time}` : '',
                logo: s.logo_url || null,
                coverImage: s.cover_url ? s.cover_url : null,
                category: s.category || null,
            }));
            setShops(mapped);
        } catch (e) {
            console.error('[MyShopsScreen] fetch shops failed', e);
            setShops([]);
        } finally {
            setShopsLoading(false);
        }
    }, [ownerUuid]);

    useFocusEffect(
        useCallback(() => {
            fetchMyShops();
        }, [fetchMyShops])
    );

    const toggleCategory = (key) => {
        setSelectedCategories((prev) => {
            if (prev.includes(key)) {
                return prev.filter((k) => k !== key);
            }
            if (prev.length >= MAX_CATEGORIES) return prev;
            return [...prev, key];
        });
    };

    // Time picker state for creation modal
    const [createTimePickerVisible, setCreateTimePickerVisible] = useState(false);
    const [createTimePickerTarget, setCreateTimePickerTarget] = useState('open'); // 'open' or 'close'
    const [createTempHour, setCreateTempHour] = useState('09');
    const [createTempMinute, setCreateTempMinute] = useState('00');
    const createHourScrollRef = useRef(null);
    const createMinuteScrollRef = useRef(null);

    // Generate hours and minutes arrays
    const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

    const openCreateTimePicker = (target) => {
        const time = target === 'open' ? newShopOpenTime : newShopCloseTime;
        const [h, m] = time.split(':');
        setCreateTempHour(h);
        setCreateTempMinute(m);
        setCreateTimePickerTarget(target);
        setCreateTimePickerVisible(true);

        // Auto-scroll to selected values after modal renders
        setTimeout(() => {
            const hourIndex = HOURS.indexOf(h);
            const minuteIndex = MINUTES.indexOf(m);
            if (createHourScrollRef.current && hourIndex >= 0) {
                createHourScrollRef.current.scrollTo({ y: hourIndex * PICKER_ITEM_HEIGHT, animated: false });
            }
            if (createMinuteScrollRef.current && minuteIndex >= 0) {
                createMinuteScrollRef.current.scrollTo({ y: minuteIndex * PICKER_ITEM_HEIGHT, animated: false });
            }
        }, 100);
    };

    const confirmCreateTimePicker = () => {
        const newTime = `${createTempHour}:${createTempMinute}`;
        if (createTimePickerTarget === 'open') {
            setNewShopOpenTime(newTime);
        } else {
            setNewShopCloseTime(newTime);
        }
        setCreateTimePickerVisible(false);
    };

    // Beta code gate state (codes and quotas live in public.beta_access_codes)
    const [betaModalVisible, setBetaModalVisible] = useState(false);
    const [betaCode, setBetaCode] = useState('');
    const [betaError, setBetaError] = useState('');
    const [betaVerifyLoading, setBetaVerifyLoading] = useState(false);
    const [grantedBetaCode, setGrantedBetaCode] = useState('');
    const shakeAnim = useRef(new Animated.Value(0)).current;

    const triggerShake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
    };

    const handleBetaCodeSubmit = async () => {
        const raw = betaCode.trim();
        if (!raw) return;
        setBetaVerifyLoading(true);
        setBetaError('');
        try {
            const { data, error } = await supabase.rpc('verify_beta_access_code', { p_code: raw });
            if (error) throw error;
            if (data === true) {
                setGrantedBetaCode(raw.toUpperCase());
                setBetaModalVisible(false);
                setBetaCode('');
                setBetaError('');
                setModalVisible(true);
            } else {
                setBetaError('Invalid access code. Please try again.');
                triggerShake();
            }
        } catch (e) {
            console.error('[MyShopsScreen] verify_beta_access_code failed', e);
            setBetaError('Unable to verify. Check your connection.');
            triggerShake();
        } finally {
            setBetaVerifyLoading(false);
        }
    };

    const handleOpenBetaModal = () => {
        setBetaCode('');
        setBetaError('');
        setGrantedBetaCode('');
        setBetaModalVisible(true);
    };

    const handleAddShop = () => {
        if (!newShopName.trim()) {
            Alert.alert('Error', 'Please enter a shop name.');
            return;
        }
        if (!String(grantedBetaCode || '').trim()) {
            Alert.alert('Error', 'Please verify your beta access code first.');
            return;
        }
        const draftShop = {
            name: newShopName.trim(),
            address: newShopAddress.trim() || '',
            phone: newShopPhone.trim() || '',
            openTime: newShopOpenTime,
            closeTime: newShopCloseTime,
            categories: selectedCategories,
            betaAccessCode: grantedBetaCode.trim(),
        };
        setNewShopName('');
        setNewShopAddress('');
        setNewShopPhone('');
        setNewShopOpenTime('09:00');
        setNewShopCloseTime('21:00');
        setSelectedCategories([]);
        setModalVisible(false);

        navigation.navigate('ConfirmShopLocationScreen', { draftShop });
    };

    useEffect(() => {
        // Reset suggestions whenever modal closes
        if (!modalVisible) {
            if (addressBlurTimeoutRef.current) {
                clearTimeout(addressBlurTimeoutRef.current);
                addressBlurTimeoutRef.current = null;
            }
            setAddressSuggestions([]);
            setAddressSuggestLoading(false);
            setAddressSuggestError('');
            setAddressFieldFocused(false);
            skipAddressSuggestUntilRefocus.current = false;
        }
    }, [modalVisible]);

    useEffect(() => {
        if (!modalVisible) return;

        if (!addressFieldFocused || skipAddressSuggestUntilRefocus.current) {
            setAddressSuggestLoading(false);
            setAddressSuggestions([]);
            setAddressSuggestError('');
            return;
        }

        const query = String(newShopAddress || '').trim();
        if (query.length < 3) {
            setAddressSuggestions([]);
            setAddressSuggestLoading(false);
            setAddressSuggestError('');
            return;
        }

        const seq = ++addressReqSeq.current;
        setAddressSuggestLoading(true);
        setAddressSuggestError('');

        const t = setTimeout(() => {
            (async () => {
                try {
                    const url =
                        'https://photon.komoot.io/api/' +
                        `?q=${encodeURIComponent(query)}&limit=5&lang=fr`;

                    const res = await fetch(url, {
                        headers: {
                            Accept: 'application/json',
                            'Accept-Language': 'fr',
                        },
                    });
                    if (!res.ok) throw new Error(`addr_autocomplete_http_${res.status}`);
                    const json = await res.json().catch(() => null);

                    // Ignore out-of-date responses
                    if (addressReqSeq.current !== seq) return;

                    const features = Array.isArray(json?.features) ? json.features : [];
                    const mapped = features
                        .map((f) => {
                            const p = f?.properties || {};
                            const street = p.street ? String(p.street) : (p.name ? String(p.name) : '');
                            const nameOnly = p.name && p.street ? String(p.name) : '';
                            let house = p.housenumber ? String(p.housenumber) : '';
                            if (!house) {
                                const guessed = guessHouseNumberFromQuery(query, street, nameOnly);
                                if (guessed) house = guessed;
                            }
                            const city = p.city ? String(p.city) : (p.state ? String(p.state) : '');
                            const country = p.country ? String(p.country) : '';

                            const streetAddress = [house, street].filter(Boolean).join(' ').trim();
                            const label = [country, city, streetAddress].filter(Boolean).join(', ').trim();

                            const coords = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : null;
                            const lon = coords?.[0] != null ? Number(coords[0]) : null;
                            const lat = coords?.[1] != null ? Number(coords[1]) : null;

                            return {
                                id: String(p.osm_id ?? p.osm_key ?? p.name ?? Math.random()),
                                label: label || String(p.name || '').trim(),
                                lat,
                                lon,
                            };
                        })
                        .filter((x) => x.label);

                    setAddressSuggestions(mapped);
                    if (mapped.length === 0) setAddressSuggestError('No results.');
                } catch (e) {
                    if (addressReqSeq.current !== seq) return;
                    setAddressSuggestions([]);
                    setAddressSuggestError('Unable to fetch suggestions. Check your connection.');
                } finally {
                    if (addressReqSeq.current !== seq) return;
                    setAddressSuggestLoading(false);
                }
            })();
        }, 350);

        return () => clearTimeout(t);
    }, [modalVisible, newShopAddress, addressFieldFocused]);

    const handleUpdateShop = (updatedShop) => {
        setShops((prev) =>
            prev.map((s) => (s.id === updatedShop.id ? updatedShop : s))
        );
    };

    const closeShopMenu = useCallback(() => {
        setShopMenuOpenId(null);
        setShopMenuLayout(null);
    }, []);

    const openShopMenuAtButton = useCallback((shopId) => {
        const r = menuBtnRefs.current[shopId];
        if (r?.measureInWindow) {
            r.measureInWindow((x, y, w, h) => {
                setShopMenuLayout({ x, y, width: w, height: h });
                setShopMenuOpenId(shopId);
            });
        } else {
            setShopMenuLayout(null);
            setShopMenuOpenId(shopId);
        }
    }, []);

    const onPressShopMenuTrigger = useCallback(
        (shop) => {
            if (shopMenuOpenId === shop.id) {
                closeShopMenu();
                return;
            }
            openShopMenuAtButton(shop.id);
        },
        [shopMenuOpenId, closeShopMenu, openShopMenuAtButton]
    );

    const handleShopPress = (shop) => {
        closeShopMenu();
        navigation.navigate('MyShopEditScreen', {
            shop,
            onUpdate: handleUpdateShop,
        });
    };

    const promptRemoveShop = (shop) => {
        Alert.alert(
            'Remove shop',
            'Are you sure to remove the shop?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        void performRemoveShop(shop);
                    },
                },
            ]
        );
    };

    const performRemoveShop = async (shop) => {
        closeShopMenu();
        try {
            const ownerUuid = await getOrCreateOwnerUuid();
            if (!ownerUuid) {
                Alert.alert('Error', 'Unable to identify this device.');
                return;
            }
            const { error } = await supabase.rpc('delete_shop', {
                p_shop_id: shop.id,
                p_owner: ownerUuid,
            });
            if (error) throw error;
            setShops((prev) => prev.filter((s) => s.id !== shop.id));
        } catch (e) {
            console.error('[MyShopsScreen] delete_shop failed', e);
            Alert.alert('Error', 'Could not remove the shop. Please try again.');
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                    style={styles.backBtn}
                >
                    <Ionicons name="arrow-back" size={24} color="#2d253b" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>My Shops</Text>
                <TouchableOpacity
                    onPress={handleOpenBetaModal}
                    activeOpacity={0.7}
                    style={styles.addBtn}
                >
                    <Ionicons name="add" size={26} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Shop List */}
            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                onScrollBeginDrag={closeShopMenu}
                keyboardShouldPersistTaps="handled"
            >
                {shopsLoading ? (
                    <View style={styles.emptyState}>
                        <ActivityIndicator size="large" color="#2d253b" />
                        <Text style={styles.emptySubText}>Loading your shops…</Text>
                    </View>
                ) : shops.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="storefront-outline" size={64} color="#ccc" />
                        <Text style={styles.emptyText}>No shops yet</Text>
                        <Text style={styles.emptySubText}>
                            Tap the + button to add your first shop
                        </Text>
                    </View>
                ) : (
                    shops.map((shop) => (
                        <View key={shop.id} style={styles.shopCard}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => handleShopPress(shop)}
                            >
                                <View style={styles.shopCoverClip}>
                                    <View style={styles.shopCoverContainer}>
                                        {shop.coverImage ? (
                                            <Image
                                                source={{ uri: shop.coverImage }}
                                                style={styles.shopCover}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <View style={styles.shopCoverPlaceholder}>
                                                <Ionicons name="image-outline" size={32} color="#ccc" />
                                            </View>
                                        )}
                                        <View style={styles.shopLogoOverlay}>
                                            {shop.logo ? (
                                                <Image
                                                    source={{ uri: shop.logo }}
                                                    style={styles.shopLogoImage}
                                                    resizeMode="cover"
                                                />
                                            ) : (
                                                <View style={styles.shopLogoPlaceholder}>
                                                    <Ionicons name="storefront" size={24} color="#2d253b" />
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>

                            <View style={styles.shopBottomRow}>
                                <TouchableOpacity
                                    style={styles.shopInfoTouchable}
                                    activeOpacity={0.7}
                                    onPress={() => handleShopPress(shop)}
                                >
                                    <View style={styles.shopInfo}>
                                        <Text style={styles.shopName}>{shop.name}</Text>
                                        <Text style={styles.shopAddress}>{shop.address}</Text>
                                    </View>
                                </TouchableOpacity>

                                <View style={styles.shopMenuColumn}>
                                    <TouchableOpacity
                                        ref={(el) => {
                                            if (el) menuBtnRefs.current[shop.id] = el;
                                            else delete menuBtnRefs.current[shop.id];
                                        }}
                                        style={styles.shopMenuBtn}
                                        onPress={() => onPressShopMenuTrigger(shop)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        activeOpacity={0.65}
                                    >
                                        <Ionicons name="ellipsis-horizontal" size={22} color="#888" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            <Modal
                visible={Boolean(shopMenuOpenId && shopMenuLayout)}
                transparent
                animationType="fade"
                statusBarTranslucent={Platform.OS === 'android'}
                onRequestClose={closeShopMenu}
            >
                <View style={styles.shopMenuModalRoot}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeShopMenu} />
                    {(() => {
                        if (!shopMenuOpenId || !shopMenuLayout) return null;
                        const menuShop = shops.find((s) => s.id === shopMenuOpenId);
                        if (!menuShop) return null;
                        const top = shopMenuLayout.y + shopMenuLayout.height + 4;
                        const left = Math.max(
                            SHOP_MENU_SCREEN_MARGIN,
                            Math.min(
                                shopMenuLayout.x + shopMenuLayout.width - SHOP_MENU_WIDTH,
                                SCREEN_WIDTH - SHOP_MENU_SCREEN_MARGIN - SHOP_MENU_WIDTH
                            )
                        );
                        return (
                            <View
                                style={[
                                    styles.shopMenuDropdownModal,
                                    { top, left, width: SHOP_MENU_WIDTH },
                                ]}
                            >
                                <TouchableOpacity
                                    style={styles.shopMenuItem}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        closeShopMenu();
                                        promptRemoveShop(menuShop);
                                    }}
                                >
                                    <Text style={styles.shopMenuItemDanger}>Remove shop</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.shopMenuItem}
                                    activeOpacity={0.7}
                                    onPress={closeShopMenu}
                                >
                                    <Text style={styles.shopMenuItemMuted}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        );
                    })()}
                </View>
            </Modal>

            {/* Add Shop Modal */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add a new shop</Text>
                            <TouchableOpacity
                                onPress={() => setModalVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="close" size={26} color="#2d253b" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <Text style={styles.inputLabel}>Shop name *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. My Cool Shop"
                                placeholderTextColor="#aaa"
                                value={newShopName}
                                onChangeText={setNewShopName}
                            />

                            <Text style={styles.inputLabel}>Address</Text>
                            <View style={{ position: 'relative' }}>
                                <TextInput
                                    ref={addressInputRef}
                                    style={styles.input}
                                    placeholder="e.g. 123 Main Street"
                                    placeholderTextColor="#aaa"
                                    value={newShopAddress}
                                    onChangeText={setNewShopAddress}
                                    autoCorrect={false}
                                    onFocus={() => {
                                        if (addressBlurTimeoutRef.current) {
                                            clearTimeout(addressBlurTimeoutRef.current);
                                            addressBlurTimeoutRef.current = null;
                                        }
                                        skipAddressSuggestUntilRefocus.current = false;
                                        setAddressFieldFocused(true);
                                    }}
                                    onBlur={() => {
                                        if (addressBlurTimeoutRef.current) {
                                            clearTimeout(addressBlurTimeoutRef.current);
                                        }
                                        addressBlurTimeoutRef.current = setTimeout(() => {
                                            addressBlurTimeoutRef.current = null;
                                            setAddressFieldFocused(false);
                                            setAddressSuggestions([]);
                                            setAddressSuggestLoading(false);
                                            setAddressSuggestError('');
                                        }, 200);
                                    }}
                                />

                                {addressFieldFocused &&
                                (addressSuggestLoading || addressSuggestions.length > 0 || addressSuggestError) ? (
                                    <View style={styles.suggestionBox}>
                                        {addressSuggestLoading ? (
                                            <View style={styles.suggestionLoadingRow}>
                                                <ActivityIndicator size="small" color="#2d253b" />
                                                <Text style={styles.suggestionLoadingText}>Searching…</Text>
                                            </View>
                                        ) : null}

                                        {!addressSuggestLoading && addressSuggestError ? (
                                            <View style={styles.suggestionEmptyRow}>
                                                <Ionicons name="information-circle-outline" size={16} color="#888" />
                                                <Text style={styles.suggestionEmptyText}>{addressSuggestError}</Text>
                                            </View>
                                        ) : null}

                                        {addressSuggestions.map((s) => (
                                            <TouchableOpacity
                                                key={s.id}
                                                activeOpacity={0.7}
                                                onPress={() => {
                                                    if (addressBlurTimeoutRef.current) {
                                                        clearTimeout(addressBlurTimeoutRef.current);
                                                        addressBlurTimeoutRef.current = null;
                                                    }
                                                    skipAddressSuggestUntilRefocus.current = true;
                                                    addressReqSeq.current += 1;
                                                    setNewShopAddress(s.label);
                                                    setAddressSuggestions([]);
                                                    setAddressSuggestError('');
                                                    setAddressSuggestLoading(false);
                                                    setAddressFieldFocused(false);
                                                    addressInputRef.current?.blur();
                                                    Keyboard.dismiss();
                                                }}
                                                style={styles.suggestionItem}
                                            >
                                                <Ionicons name="location-outline" size={16} color="#666" />
                                                <Text style={styles.suggestionText} numberOfLines={2}>
                                                    {s.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                ) : null}
                            </View>

                            <Text style={styles.inputLabel}>Phone</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. +972-3-1234567"
                                placeholderTextColor="#aaa"
                                value={newShopPhone}
                                onChangeText={setNewShopPhone}
                                keyboardType="phone-pad"
                            />

                            <Text style={styles.inputLabel}>Opening hours</Text>
                            <View style={styles.createTimePickerRow}>
                                <TouchableOpacity
                                    style={styles.createTimePickerButton}
                                    onPress={() => openCreateTimePicker('open')}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="time-outline" size={18} color="#1ba5b8" />
                                    <View>
                                        <Text style={styles.createTimePickerLabel}>Opens at</Text>
                                        <Text style={styles.createTimePickerValue}>{newShopOpenTime}</Text>
                                    </View>
                                </TouchableOpacity>

                                <View style={styles.createTimePickerSeparator}>
                                    <Ionicons name="arrow-forward" size={18} color="#ccc" />
                                </View>

                                <TouchableOpacity
                                    style={styles.createTimePickerButton}
                                    onPress={() => openCreateTimePicker('close')}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="time" size={18} color="#e74c3c" />
                                    <View>
                                        <Text style={styles.createTimePickerLabel}>Closes at</Text>
                                        <Text style={styles.createTimePickerValue}>{newShopCloseTime}</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.categorySectionHeader}>
                                <Text style={styles.inputLabel}>Categories</Text>
                                <Text style={styles.categoryCount}>
                                    {selectedCategories.length}/{MAX_CATEGORIES}
                                </Text>
                            </View>
                            <View style={styles.categoryGrid}>
                                {SHOP_CATEGORIES.map((cat) => {
                                    const isSelected = selectedCategories.includes(cat.key);
                                    const isDisabled = !isSelected && selectedCategories.length >= MAX_CATEGORIES;
                                    return (
                                        <TouchableOpacity
                                            key={cat.key}
                                            activeOpacity={0.7}
                                            onPress={() => toggleCategory(cat.key)}
                                            disabled={isDisabled}
                                            style={[
                                                styles.categoryChip,
                                                isSelected && { backgroundColor: cat.color + '20', borderColor: cat.color },
                                                isDisabled && styles.categoryChipDisabled,
                                            ]}
                                        >
                                            <Ionicons
                                                name={cat.icon}
                                                size={18}
                                                color={isSelected ? cat.color : isDisabled ? '#ccc' : '#888'}
                                            />
                                            <Text
                                                style={[
                                                    styles.categoryChipText,
                                                    isSelected && { color: cat.color, fontWeight: '700' },
                                                    isDisabled && { color: '#ccc' },
                                                ]}
                                            >
                                                {cat.label}
                                            </Text>
                                            {isSelected && (
                                                <Ionicons name="checkmark-circle" size={16} color={cat.color} />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.createBtn}
                            activeOpacity={0.8}
                            onPress={handleAddShop}
                        >
                            <Ionicons name="add-circle" size={22} color="#fff" />
                            <Text style={styles.createBtnText}>Create Shop</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Time Picker Modal for Shop Creation */}
            <Modal
                visible={createTimePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setCreateTimePickerVisible(false)}
            >
                <View style={styles.timeModalOverlay}>
                    <View style={styles.timeModalContent}>
                        <Text style={styles.timeModalTitle}>
                            {createTimePickerTarget === 'open' ? 'Opening time' : 'Closing time'}
                        </Text>

                        <View style={styles.pickerContainer}>
                            {/* Hours column */}
                            <View style={styles.pickerColumn}>
                                <Text style={styles.pickerColumnLabel}>Hour</Text>
                                <ScrollView
                                    ref={createHourScrollRef}
                                    style={styles.pickerScroll}
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled
                                >
                                    {HOURS.map((h) => (
                                        <TouchableOpacity
                                            key={h}
                                            style={[
                                                styles.pickerItem,
                                                createTempHour === h && styles.pickerItemSelected,
                                            ]}
                                            onPress={() => setCreateTempHour(h)}
                                        >
                                            <Text
                                                style={[
                                                    styles.pickerItemText,
                                                    createTempHour === h && styles.pickerItemTextSelected,
                                                ]}
                                            >
                                                {h}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* Separator */}
                            <Text style={styles.pickerColon}>:</Text>

                            {/* Minutes column */}
                            <View style={styles.pickerColumn}>
                                <Text style={styles.pickerColumnLabel}>Min</Text>
                                <ScrollView
                                    ref={createMinuteScrollRef}
                                    style={styles.pickerScroll}
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled
                                >
                                    {MINUTES.map((m) => (
                                        <TouchableOpacity
                                            key={m}
                                            style={[
                                                styles.pickerItem,
                                                createTempMinute === m && styles.pickerItemSelected,
                                            ]}
                                            onPress={() => setCreateTempMinute(m)}
                                        >
                                            <Text
                                                style={[
                                                    styles.pickerItemText,
                                                    createTempMinute === m && styles.pickerItemTextSelected,
                                                ]}
                                            >
                                                {m}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>

                        {/* Preview */}
                        <View style={styles.timeModalPreview}>
                            <Ionicons name="time" size={20} color="#1ba5b8" />
                            <Text style={styles.timeModalPreviewText}>{createTempHour}:{createTempMinute}</Text>
                        </View>

                        {/* Actions */}
                        <View style={styles.timeModalActions}>
                            <TouchableOpacity
                                style={styles.timeModalCancelBtn}
                                onPress={() => setCreateTimePickerVisible(false)}
                            >
                                <Text style={styles.timeModalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.timeModalConfirmBtn}
                                onPress={confirmCreateTimePicker}
                            >
                                <Ionicons name="checkmark" size={18} color="#fff" />
                                <Text style={styles.timeModalConfirmText}>Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Beta Access Code Modal */}
            <Modal
                visible={betaModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setBetaModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.betaOverlay}
                >
                    <TouchableOpacity
                        style={styles.betaOverlayDismiss}
                        activeOpacity={1}
                        onPress={() => setBetaModalVisible(false)}
                    />
                    <Animated.View
                        style={[
                            styles.betaContainer,
                            { transform: [{ translateX: shakeAnim }] },
                        ]}
                    >
                        {/* Lock icon */}
                        <View style={styles.betaIconWrap}>
                            <Ionicons name="lock-closed" size={32} color="#fff" />
                        </View>

                        <Text style={styles.betaTitle}>Beta Access</Text>
                        <Text style={styles.betaSubtitle}>
                            Enter the code provided by the QFind team to unlock shop creation.
                        </Text>

                        <TextInput
                            style={[
                                styles.betaInput,
                                betaError ? styles.betaInputError : null,
                            ]}
                            placeholder="Enter access code"
                            placeholderTextColor="#999"
                            value={betaCode}
                            onChangeText={(text) => {
                                setBetaCode(text);
                                if (betaError) setBetaError('');
                            }}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            returnKeyType="done"
                            onSubmitEditing={handleBetaCodeSubmit}
                        />

                        {betaError ? (
                            <View style={styles.betaErrorRow}>
                                <Ionicons name="alert-circle" size={16} color="#e74c3c" />
                                <Text style={styles.betaErrorText}>{betaError}</Text>
                            </View>
                        ) : null}

                        <TouchableOpacity
                            style={[
                                styles.betaSubmitBtn,
                                (!betaCode.trim() || betaVerifyLoading) && styles.betaSubmitBtnDisabled,
                            ]}
                            activeOpacity={0.8}
                            onPress={handleBetaCodeSubmit}
                            disabled={!betaCode.trim() || betaVerifyLoading}
                        >
                            {betaVerifyLoading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons name="arrow-forward" size={20} color="#fff" />
                            )}
                            <Text style={styles.betaSubmitText}>Verify Code</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.betaCancelBtn}
                            activeOpacity={0.7}
                            onPress={() => setBetaModalVisible(false)}
                        >
                            <Text style={styles.betaCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Modal>
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
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#e8ebf0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        flex: 1,
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2d253b',
        marginLeft: 12,
    },
    addBtn: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: '#2d253b',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },

    // Empty State
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
    },
    emptyText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#999',
        marginTop: 16,
    },
    emptySubText: {
        fontSize: 14,
        color: '#bbb',
        marginTop: 6,
        textAlign: 'center',
    },

    // Shop Card
    shopCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'visible',
        marginBottom: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
    },
    shopCoverClip: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
    },
    shopBottomRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    shopInfoTouchable: {
        flex: 1,
    },
    shopMenuModalRoot: {
        flex: 1,
    },
    shopMenuDropdownModal: {
        position: 'absolute',
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingVertical: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 14,
        elevation: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#e8ebf0',
    },
    shopMenuColumn: {
        paddingRight: 4,
        paddingTop: 2,
    },
    shopMenuBtn: {
        paddingVertical: 10,
        paddingHorizontal: 10,
    },
    shopMenuItem: {
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    shopMenuItemDanger: {
        fontSize: 15,
        fontWeight: '600',
        color: '#c0392b',
    },
    shopMenuItemMuted: {
        fontSize: 15,
        fontWeight: '500',
        color: '#666',
    },
    shopCoverContainer: {
        height: 120,
        backgroundColor: '#e8ebf0',
        position: 'relative',
    },
    shopCover: {
        width: '100%',
        height: '100%',
    },
    shopCoverPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#e8ebf0',
    },
    shopLogoOverlay: {
        position: 'absolute',
        bottom: -24,
        left: 16,
        zIndex: 5,
    },
    shopLogoImage: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 3,
        borderColor: '#fff',
    },
    shopLogoPlaceholder: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#f2f4f7',
        borderWidth: 3,
        borderColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    shopInfo: {
        paddingTop: 30,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    shopName: {
        fontSize: 17,
        fontWeight: '700',
        color: '#2d253b',
    },
    shopAddress: {
        fontSize: 13,
        color: '#888',
        marginTop: 3,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2d253b',
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2d253b',
        marginBottom: 6,
        marginTop: 12,
    },
    input: {
        backgroundColor: '#f2f4f7',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#2d253b',
    },
    suggestionBox: {
        marginTop: 8,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e8ebf0',
        overflow: 'hidden',
    },
    suggestionLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    suggestionLoadingText: {
        fontSize: 13,
        color: '#666',
        fontWeight: '600',
    },
    suggestionEmptyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    suggestionEmptyText: {
        flex: 1,
        fontSize: 13,
        color: '#888',
        fontWeight: '600',
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    suggestionText: {
        flex: 1,
        fontSize: 13,
        color: '#2d253b',
        fontWeight: '600',
        lineHeight: 18,
    },
    createBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2d253b',
        borderRadius: 14,
        paddingVertical: 14,
        marginTop: 20,
        gap: 8,
    },
    createBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },

    // Time Picker buttons in creation modal
    createTimePickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    createTimePickerButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#f2f4f7',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
    },
    createTimePickerLabel: {
        fontSize: 11,
        color: '#999',
        fontWeight: '500',
    },
    createTimePickerValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#2d253b',
    },
    createTimePickerSeparator: {
        paddingHorizontal: 2,
    },

    // Category picker
    categorySectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    categoryCount: {
        fontSize: 13,
        fontWeight: '600',
        color: '#999',
        marginTop: 12,
    },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#f2f4f7',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    categoryChipDisabled: {
        opacity: 0.4,
    },
    categoryChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },

    // Time Picker Modal
    timeModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    timeModalContent: {
        backgroundColor: '#fff',
        borderRadius: 24,
        paddingHorizontal: 28,
        paddingTop: 24,
        paddingBottom: 20,
        width: SCREEN_WIDTH * 0.8,
        maxWidth: 340,
    },
    timeModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#2d253b',
        textAlign: 'center',
        marginBottom: 20,
    },
    pickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    pickerColumn: {
        alignItems: 'center',
        flex: 1,
    },
    pickerColumnLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#999',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    pickerScroll: {
        height: 180,
    },
    pickerItem: {
        height: PICKER_ITEM_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: 20,
        borderRadius: 10,
        alignItems: 'center',
    },
    pickerItemSelected: {
        backgroundColor: '#1ba5b8',
    },
    pickerItemText: {
        fontSize: 20,
        fontWeight: '600',
        color: '#999',
    },
    pickerItemTextSelected: {
        color: '#fff',
        fontWeight: '700',
    },
    pickerColon: {
        fontSize: 28,
        fontWeight: '700',
        color: '#2d253b',
        marginTop: 20,
    },
    timeModalPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        paddingVertical: 10,
        backgroundColor: '#f2f4f7',
        borderRadius: 12,
    },
    timeModalPreviewText: {
        fontSize: 24,
        fontWeight: '700',
        color: '#2d253b',
    },
    timeModalActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 20,
    },
    timeModalCancelBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        borderRadius: 12,
        backgroundColor: '#f2f4f7',
    },
    timeModalCancelText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#888',
    },
    timeModalConfirmBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 13,
        borderRadius: 12,
        backgroundColor: '#1ba5b8',
    },
    timeModalConfirmText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },

    // Beta Access Code Modal
    betaOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    betaOverlayDismiss: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    betaContainer: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 28,
        width: '85%',
        maxWidth: 360,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 10,
    },
    betaIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#2d253b',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    betaTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2d253b',
        marginBottom: 6,
    },
    betaSubtitle: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
        paddingHorizontal: 8,
    },
    betaInput: {
        width: '100%',
        backgroundColor: '#f2f4f7',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 17,
        color: '#2d253b',
        textAlign: 'center',
        letterSpacing: 3,
        fontWeight: '700',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    betaInputError: {
        borderColor: '#e74c3c',
        backgroundColor: '#fef2f2',
    },
    betaErrorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 6,
    },
    betaErrorText: {
        fontSize: 13,
        color: '#e74c3c',
        fontWeight: '500',
    },
    betaSubmitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2d253b',
        borderRadius: 14,
        paddingVertical: 14,
        width: '100%',
        marginTop: 18,
        gap: 8,
    },
    betaSubmitBtnDisabled: {
        opacity: 0.4,
    },
    betaSubmitText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    betaCancelBtn: {
        marginTop: 14,
        paddingVertical: 6,
    },
    betaCancelText: {
        fontSize: 14,
        color: '#999',
        fontWeight: '500',
    },
});
