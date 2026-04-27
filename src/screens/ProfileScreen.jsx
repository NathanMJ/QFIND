import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSettings } from '../context/SettingsContext';
import { getOrCreateOwnerUuid } from '../lib/ownerUuid';
import { supabase } from '../lib/supabaseClient';

// Category colors for visit items in preview
const CATEGORY_COLORS = {
    'Tech': '#6366F1',
    'Shopping': '#A78BFA',
    'Restaurants': '#FF6B6B',
    'Cafes': '#4ECDC4',
    'Services': '#3B82F6',
    'Health': '#EC4899',
    'Beauty': '#F472B6',
    'Fun': '#F59E0B',
};

const CATEGORY_ICONS = {
    'Tech': 'laptop-outline',
    'Shopping': 'bag-outline',
    'Restaurants': 'restaurant-outline',
    'Cafes': 'cafe-outline',
    'Services': 'construct-outline',
    'Health': 'fitness-outline',
    'Beauty': 'sparkles-outline',
    'Fun': 'game-controller-outline',
};

function formatShortDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function formatHistoryDateTime(occurredAt) {
    if (!occurredAt) return { date: null, time: null };
    const d = new Date(occurredAt);
    if (Number.isNaN(d.getTime())) return { date: null, time: null };
    const date = d.toISOString().slice(0, 10);
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
}

export default function ProfileScreen() {
    const navigation = useNavigation();
    const { getCurrencySymbol } = useSettings();
    const currencySymbol = getCurrencySymbol();
    const [ownerUuid, setOwnerUuid] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [walletBalance, setWalletBalance] = useState(0);
    const [historyPreview, setHistoryPreview] = useState([]);
    const [myShopsPreview, setMyShopsPreview] = useState([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const uuid = await getOrCreateOwnerUuid();
                if (!cancelled) setOwnerUuid(uuid);
            } catch (e) {
                console.error('[ProfileScreen] failed to get owner uuid', e);
                if (!cancelled) setOwnerUuid(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (!ownerUuid) return;
            setProfileLoading(true);
            try {
                const { data, error } = await supabase.rpc('get_owner_profile', {
                    p_owner: ownerUuid,
                    p_history_limit: 4,
                });
                if (error) throw error;
                if (cancelled) return;

                const balance = Number(data?.wallet_balance ?? 0);
                setWalletBalance(Number.isFinite(balance) ? balance : 0);

                const history = Array.isArray(data?.history) ? data.history : [];
                setHistoryPreview(history);

                const shops = Array.isArray(data?.my_shops) ? data.my_shops : [];
                setMyShopsPreview(shops.slice(0, 3));
            } catch (e) {
                console.error('[ProfileScreen] get_owner_profile failed', e);
                if (!cancelled) {
                    setWalletBalance(0);
                    setHistoryPreview([]);
                    setMyShopsPreview([]);
                }
            } finally {
                if (!cancelled) setProfileLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [ownerUuid]);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity
                    onPress={() => navigation.navigate('SettingsScreen')}
                    activeOpacity={0.7}
                    style={styles.settingsBtn}
                >
                    <Ionicons name="settings-outline" size={24} color="#2d253b" />
                </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Wallet Card */}
                <View style={styles.walletCard}>
                    <View style={styles.walletHeader}>
                        <Ionicons name="wallet-outline" size={24} color="#2d253b" />
                        <Text style={styles.walletLabel}>Cashback</Text>
                    </View>
                    <Text style={styles.walletBalance}>
                        {walletBalance.toFixed(2)} {currencySymbol}
                    </Text>
                    {profileLoading && (
                        <Text style={styles.loadingHint}>Syncing…</Text>
                    )}
                </View>

                {/* History Preview */}
                <View style={styles.historySection}>
                    <View style={styles.historySectionHeader}>
                        <Ionicons name="time-outline" size={22} color="#2d253b" />
                        <Text style={styles.historySectionTitle}>History</Text>
                    </View>
                    {historyPreview.map((item, idx) => {
                        const key = item?.occurred_at ? `${item.type}-${item.occurred_at}-${idx}` : `${item?.type ?? 'item'}-${idx}`;
                        const { date, time } = formatHistoryDateTime(item?.occurred_at);

                        if (item?.type === 'visit') {
                            const catColor = CATEGORY_COLORS[item?.shop_category] || '#888';
                            const catIcon = CATEGORY_ICONS[item?.shop_category] || 'storefront-outline';
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={styles.historyItem}
                                    activeOpacity={0.7}
                                    onPress={() =>
                                        navigation.navigate('ShopScreen', {
                                            shop: {
                                                id: item?.shop_id ?? null,
                                                name: item?.shop_name ?? '',
                                                adress: item?.shop_address ?? '',
                                                address: item?.shop_address ?? '',
                                                category: item?.shop_category ?? null,
                                            },
                                        })
                                    }
                                >
                                    <View style={[styles.historyIcon, { backgroundColor: catColor + '15' }]}>
                                        <Ionicons name={catIcon} size={20} color={catColor} />
                                    </View>
                                    <View style={styles.historyInfo}>
                                        <Text style={styles.historyName}>{item?.shop_name ?? 'Shop'}</Text>
                                        <Text style={styles.historyAddress}>{item?.shop_address ?? ''}</Text>
                                    </View>
                                    <View style={styles.historyRight}>
                                        <Text style={styles.historyDate}>{date ? formatShortDate(date) : ''}</Text>
                                        <Text style={styles.historyTime}>{time ?? ''}</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        }

                        if (item?.type === 'cashback') {
                            return (
                                <View key={key} style={styles.historyItem}>
                                    <View style={[styles.historyIcon, { backgroundColor: '#10B98115' }]}>
                                        <Ionicons name="cash-outline" size={20} color="#10B981" />
                                    </View>
                                    <View style={styles.historyInfo}>
                                        <Text style={styles.historyName}>{item?.shop_name ?? 'Cashback'}</Text>
                                        <Text style={[styles.cashbackText, { color: '#10B981' }]}>
                                            +{Number(item?.amount ?? 0).toFixed(2)} {currencySymbol}
                                        </Text>
                                    </View>
                                    <View style={styles.historyRight}>
                                        <Text style={styles.historyDate}>{date ? formatShortDate(date) : ''}</Text>
                                        <Text style={styles.historyTime}>{time ?? ''}</Text>
                                    </View>
                                </View>
                            );
                        }

                        if (item?.type === 'purchase') {
                            const items = Array.isArray(item?.meta?.items) ? item.meta.items : [];
                            const cashbackUsed = Number(item?.meta?.cashback_used_amount ?? item?.meta?.wallet_used_amount ?? 0);
                            const totalItems = items.reduce((s, it) => {
                                const qty = Number(it?.quantity ?? it?.qty ?? 1);
                                const unit = Number(it?.unit_price ?? it?.unitPrice ?? 0);
                                const disc = it?.unit_discount_price ?? it?.discount_price ?? it?.discountPrice;
                                const effective = disc != null ? Number(disc) : unit;
                                return s + qty * effective;
                            }, 0);
                            const method = item?.meta?.payment_method;
                            const external = method === 'none' ? 0 : Math.max(totalItems - cashbackUsed, 0);
                            return (
                                <View key={key} style={styles.historyItem}>
                                    <View style={[styles.historyIcon, { backgroundColor: '#6366F115' }]}>
                                        <Ionicons name="card-outline" size={20} color="#6366F1" />
                                    </View>
                                    <View style={styles.historyInfo}>
                                        <Text style={styles.historyName}>{item?.shop_name ?? 'Purchase'}</Text>
                                        <Text style={[styles.cashbackText, { color: '#6366F1' }]}>
                                            -{Number.isFinite(external) ? external.toFixed(2) : '0.00'} {currencySymbol}
                                        </Text>
                                    </View>
                                    <View style={styles.historyRight}>
                                        <Text style={styles.historyDate}>{date ? formatShortDate(date) : ''}</Text>
                                        <Text style={styles.historyTime}>{time ?? ''}</Text>
                                    </View>
                                </View>
                            );
                        }
                        return null;
                    })}

                    {!profileLoading && historyPreview.length === 0 && (
                        <Text style={styles.emptyHint}>No history yet.</Text>
                    )}

                    <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.seeMoreBtn}
                        onPress={() => navigation.navigate('HistoryScreen')}
                    >
                        <Text style={styles.seeMoreText}>See more</Text>
                    </TouchableOpacity>
                </View>


                {/* My Shops */}
                <View style={styles.myShopsSection}>
                    <View style={styles.historySectionHeader}>
                        <Ionicons name="storefront-outline" size={22} color="#2d253b" />
                        <Text style={styles.historySectionTitle}>My Shops</Text>
                    </View>
                    {myShopsPreview.map((shop) => (
                        <TouchableOpacity
                            key={shop.id}
                            style={styles.myShopItem}
                            activeOpacity={0.7}
                            onPress={() =>
                                navigation.navigate('MyShopEditScreen', {
                                    shop: {
                                        id: shop.id,
                                        name: shop.name,
                                        address: shop.address || '',
                                        phone: shop.phone || '',
                                        openTime: shop.open_time || null,
                                        closeTime: shop.close_time || null,
                                        hours: shop.open_time && shop.close_time ? `${shop.open_time} - ${shop.close_time}` : '',
                                        logo: shop.logo_url || null,
                                        coverImage: shop.cover_url || null,
                                        category: shop.category || null,
                                    },
                                })
                            }
                        >
                            <View style={styles.myShopIcon}>
                                <Ionicons name="storefront" size={22} color="#2d253b" />
                            </View>
                            <View style={styles.historyInfo}>
                                <Text style={styles.historyName}>{shop.name}</Text>
                                <Text style={styles.historyAddress}>{shop.address || ''}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#bbb" />
                        </TouchableOpacity>
                    ))}
                    {!profileLoading && myShopsPreview.length === 0 && (
                        <Text style={styles.emptyHint}>No shops yet.</Text>
                    )}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.seeMoreBtn}
                        onPress={() => navigation.navigate('MyShopsScreen')}
                    >
                        <Text style={styles.seeMoreText}>See all / Add a shop</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>

            {/* UUID at the bottom */}
            <View style={styles.footer}>
                <Text style={styles.uuidText}>{ownerUuid ?? '...'}</Text>
            </View>
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
        paddingBottom: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    headerTitle: {
        fontSize: 34,
        fontWeight: 'bold',
        color: '#2d253b',
    },
    settingsBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#e8ebf0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    walletCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
    },
    walletHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    walletLabel: {
        fontSize: 18,
        fontWeight: '700',
        color: '#2d253b',
    },
    walletBalance: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#2d253b',
    },
    loadingHint: {
        marginTop: 8,
        fontSize: 12,
        color: '#9aa3af',
        fontWeight: '600',
    },
    historySection: {
        marginTop: 20,
    },
    historySectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    historySectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#2d253b',
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    historyIcon: {
        width: 42,
        height: 42,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    historyInfo: {
        flex: 1,
    },
    historyName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#2d253b',
    },
    historyAddress: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    cashbackText: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 2,
    },
    historyRight: {
        alignItems: 'flex-end',
        marginLeft: 8,
    },
    historyDate: {
        fontSize: 12,
        color: '#b0b0b0',
        fontWeight: '500',
    },
    historyTime: {
        fontSize: 11,
        color: '#ccc',
        fontWeight: '500',
        marginTop: 2,
    },
    myShopsSection: {
        marginTop: 20,
    },
    myShopItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    myShopIcon: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: '#e8ebf0',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    seeMoreBtn: {
        alignItems: 'center',
        paddingVertical: 12,
        marginTop: 6,
    },
    seeMoreText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#2d253b',
        textDecorationLine: 'underline',
    },
    emptyHint: {
        marginTop: 4,
        marginBottom: 8,
        fontSize: 13,
        color: '#9aa3af',
        fontWeight: '600',
    },
    footer: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    uuidText: {
        fontSize: 12,
        color: '#b0b0b0',
    },
});
