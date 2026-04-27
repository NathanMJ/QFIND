import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    Modal,
    ActivityIndicator,
    Alert,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSettings } from '../context/SettingsContext';
import { supabase } from '../lib/supabaseClient';
import { getOrCreateOwnerUuid } from '../lib/ownerUuid';

// ── Filters ─────────────────────────────────────────────────────────

const FILTERS = [
    { key: 'all', label: 'All', icon: 'list-outline' },
    { key: 'cashback', label: 'Cashbacks', icon: 'cash-outline' },
    { key: 'purchase', label: 'Purchases', icon: 'card-outline' },
    { key: 'adjustment', label: 'Adjustments', icon: 'swap-horizontal-outline' },
    { key: 'visit', label: 'Visits', icon: 'storefront-outline' },
];

// ── Helpers ─────────────────────────────────────────────────────────

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

function formatDayLabel(dateStr) {
    const today = new Date();
    const date = new Date(dateStr + 'T00:00:00');

    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';

    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function groupByDay(items) {
    const groups = {};
    items.forEach((item) => {
        if (!groups[item.date]) groups[item.date] = [];
        groups[item.date].push(item);
    });
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((date) => ({
        date,
        label: formatDayLabel(date),
        items: groups[date].sort((a, b) => b.time.localeCompare(a.time)),
    }));
}

function occurredAtToDateTime(occurredAt) {
    if (!occurredAt) return { date: null, time: null };
    const d = new Date(occurredAt);
    if (Number.isNaN(d.getTime())) return { date: null, time: null };
    const date = d.toISOString().slice(0, 10);
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
}

function formatMoney(value, currency) {
    if (value == null || value === '') return '';
    return `${Number(value).toFixed(2)} ${currency || ''}`.trim();
}

function safeNumber(x) {
    const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : typeof x === 'number' ? x : Number(x);
    return Number.isFinite(n) ? n : null;
}

// ── Visit Card ──────────────────────────────────────────────────────

function VisitCard({ item }) {
    const navigation = useNavigation();
    const catIcon = CATEGORY_ICONS[item.category] || 'storefront-outline';
    const catColor = CATEGORY_COLORS[item.category] || '#888';

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
                navigation.navigate('ShopScreen', {
                    shop: {
                        id: item.shopId,
                        name: item.shopName,
                        adress: item.address,
                        address: item.address,
                        category: item.category,
                    },
                })
            }
            style={styles.card}
        >
            <View style={[styles.cardIconContainer, { backgroundColor: catColor + '15', borderColor: catColor + '30' }]}>
                <Ionicons name={catIcon} size={22} color={catColor} />
            </View>
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.shopName}</Text>
                <View style={styles.cardAddressRow}>
                    <Ionicons name="location-outline" size={13} color="#aaa" />
                    <Text style={styles.cardSubtitle} numberOfLines={1}>{item.address}</Text>
                </View>
                <View style={styles.cardMetaRow}>
                    <View style={[styles.typeBadge, { backgroundColor: catColor + '15' }]}>
                        <Text style={[styles.typeBadgeText, { color: catColor }]}>{item.category}</Text>
                    </View>
                </View>
            </View>
            <View style={styles.cardRight}>
                <Text style={styles.cardTime}>{item.time}</Text>
                <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </View>
        </TouchableOpacity>
    );
}

// ── Cashback Card ───────────────────────────────────────────────────

function CashbackCard({ item }) {
    const { getCurrencySymbol } = useSettings();
    const currencySymbol = getCurrencySymbol();
    const displayCurrency = item.currency || currencySymbol;
    return (
        <View style={styles.card}>
            <View style={[styles.cardIconContainer, { backgroundColor: '#10B98115', borderColor: '#10B98130' }]}>
                <Ionicons name="cash-outline" size={22} color="#10B981" />
            </View>
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.shopName}</Text>
                <Text style={[styles.cashbackAmount, { color: '#10B981' }]}>+{item.amount.toFixed(2)} {displayCurrency}</Text>
            </View>
            <View style={styles.cardRight}>
                <Text style={styles.cardTime}>{item.time}</Text>
            </View>
        </View>
    );
}

function PaymentDetails({ meta, currency, onPress }) {
    const { getCurrencySymbol } = useSettings();
    const currencySymbol = getCurrencySymbol();
    const displayCurrency = currency || currencySymbol;

    if (!meta || typeof meta !== 'object') return null;

    const method = meta.payment_method;
    const last4 = meta.last4;
    const walletUsed = meta.cashback_used_amount != null ? Number(meta.cashback_used_amount) : meta.wallet_used_amount != null ? Number(meta.wallet_used_amount) : null;

    const hasAny =
        (method && String(method).length > 0) ||
        (last4 && String(last4).length > 0) ||
        Number.isFinite(walletUsed);

    if (!hasAny) return null;

    const methodLabel =
        method && last4 ? `${method} ···${last4}` : method ? String(method) : last4 ? `···${last4}` : 'Payment';

    const lines = [];
    if (Number.isFinite(walletUsed) && walletUsed !== 0) lines.push(`Used cashback/wallet: ${walletUsed.toFixed(2)} ${displayCurrency}`);

    return (
        <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.detailBox}>
            <View style={styles.detailRow}>
                <Ionicons name="receipt-outline" size={16} color="#64748b" />
                <Text style={styles.detailTitle} numberOfLines={1}>{methodLabel}</Text>
                <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
            </View>
            {lines.map((t) => (
                <Text key={t} style={styles.detailLine}>{t}</Text>
            ))}
            <Text style={styles.detailHint}>Tap to view details</Text>
        </TouchableOpacity>
    );
}

function PurchaseCard({ item }) {
    const { getCurrencySymbol } = useSettings();
    const currencySymbol = getCurrencySymbol();
    const displayCurrency = item.currency || currencySymbol;
    const abs = Math.abs(item.amount || 0);
    const cashbackUsed = safeNumber(item?.meta?.cashback_used_amount ?? item?.meta?.wallet_used_amount) || 0;
    const items = Array.isArray(item?.meta?.items) ? item.meta.items : [];
    const totalItems = items.length
        ? items.reduce((s, it) => {
            const qty = safeNumber(it?.quantity ?? it?.qty) || 1;
            const unit = safeNumber(it?.unit_price ?? it?.unitPrice) || 0;
            const disc = safeNumber(it?.unit_discount_price ?? it?.discount_price ?? it?.discountPrice);
            const effective = disc != null ? disc : unit;
            return s + qty * effective;
        }, 0)
        : null;

    const derivedExternal = totalItems != null && (item?.meta?.payment_method || item?.meta?.payment_method === 'none')
        ? item.meta.payment_method === 'none'
            ? 0
            : Math.max(totalItems - cashbackUsed, 0)
        : null;

    const displayAmount = derivedExternal != null ? derivedExternal : abs;
    return (
        <>
            <View style={styles.card}>
                <View style={[styles.cardIconContainer, { backgroundColor: '#6366F115', borderColor: '#6366F130' }]}>
                    <Ionicons name="card-outline" size={22} color="#6366F1" />
                </View>
                <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.shopName}</Text>
                    <Text style={[styles.cashbackAmount, { color: '#6366F1' }]}>-{displayAmount.toFixed(2)} {displayCurrency}</Text>
                </View>
                <View style={styles.cardRight}>
                    <Text style={styles.cardTime}>{item.time}</Text>
                </View>
            </View>
            <PaymentDetails meta={item.meta} currency={item.currency} onPress={item.onOpenDetails} />
        </>
    );
}

function AdjustmentCard({ item }) {
    const { getCurrencySymbol } = useSettings();
    const currencySymbol = getCurrencySymbol();
    const displayCurrency = item.currency || currencySymbol;
    const isPositive = (item.amount || 0) >= 0;
    const color = isPositive ? '#1ba5b8' : '#ef4444';
    const prefix = isPositive ? '+' : '-';
    const abs = Math.abs(item.amount || 0);
    return (
        <View style={styles.card}>
            <View style={[styles.cardIconContainer, { backgroundColor: color + '15', borderColor: color + '30' }]}>
                <Ionicons name="swap-horizontal-outline" size={22} color={color} />
            </View>
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.shopName || 'Adjustment'}</Text>
                <Text style={[styles.cashbackAmount, { color }]}>{prefix}{abs.toFixed(2)} {displayCurrency}</Text>
            </View>
            <View style={styles.cardRight}>
                <Text style={styles.cardTime}>{item.time}</Text>
            </View>
        </View>
    );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default function HistoryScreen() {
    const navigation = useNavigation();
    const [activeFilter, setActiveFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [historyRows, setHistoryRows] = useState([]);
    const [ownerUuid, setOwnerUuid] = useState(null);

    const [receiptVisible, setReceiptVisible] = useState(false);
    const [receiptLoading, setReceiptLoading] = useState(false);
    const [receiptError, setReceiptError] = useState(null);
    const [selectedPurchase, setSelectedPurchase] = useState(null);
    const [receipt, setReceipt] = useState(null);
    const [receiptProductsById, setReceiptProductsById] = useState({});

    const closeReceipt = useCallback(() => {
        setReceiptVisible(false);
        setReceiptLoading(false);
        setReceiptError(null);
        setSelectedPurchase(null);
        setReceipt(null);
        setReceiptProductsById({});
    }, []);

    const openReceipt = useCallback(
        async (purchaseItem) => {
            if (!purchaseItem?.transactionId) {
                Alert.alert('Details unavailable', 'Missing transaction id for this purchase.');
                return;
            }

            try {
                const owner = ownerUuid || (await getOrCreateOwnerUuid());
                setOwnerUuid(owner);
                setSelectedPurchase(purchaseItem);
                setReceiptVisible(true);
                setReceiptLoading(true);
                setReceiptError(null);
                setReceipt(null);

                // Prefer clean receipt (computed totals from meta.items). Fallback to legacy snapshot.
                const { data: vClean, error: vCleanErr } = await supabase.rpc('get_wallet_transaction_receipt_clean', {
                    p_owner: owner,
                    p_transaction_id: purchaseItem.transactionId,
                });
                if (!vCleanErr && vClean) {
                    setReceipt(vClean);
                    const items = Array.isArray(vClean?.items) ? vClean.items : [];
                    const ids = Array.from(
                        new Set(
                            items
                                .map((it) => it?.product_id || it?.productId || null)
                                .filter(Boolean)
                        )
                    );
                    if (ids.length > 0) {
                        const { data: prods, error: pErr } = await supabase
                            .from('products')
                            .select('id,name,image_urls,currency')
                            .in('id', ids);
                        if (!pErr && Array.isArray(prods)) {
                            const map = {};
                            for (const p of prods) map[p.id] = p;
                            setReceiptProductsById(map);
                        }
                    }
                } else {
                    const { data: v1, error: v1Err } = await supabase.rpc('get_wallet_transaction_receipt', {
                        p_owner: owner,
                        p_transaction_id: purchaseItem.transactionId,
                    });
                    if (v1Err) throw v1Err;
                    setReceipt(v1 || null);
                }
            } catch (e) {
                console.error('[HistoryScreen] openReceipt failed', e);
                setReceiptError('Failed to load purchase details.');
            } finally {
                setReceiptLoading(false);
            }
        },
        [ownerUuid]
    );

    const openProductFromReceipt = useCallback(
        async (productId) => {
            if (!productId) return;
            try {
                const { data: row, error } = await supabase
                    .from('products')
                    .select('id,name,description,price,discount_price,currency,image_urls,in_stock,shop_id')
                    .eq('id', productId)
                    .maybeSingle();
                if (error) throw error;

                if (!row?.id) {
                    Alert.alert('Product not available', 'This product no longer exists.');
                    return;
                }

                const currency = row.currency || selectedPurchase?.currency || 'EUR';
                const priceLabel = row.price != null ? `${Number(row.price)} ${currency}` : '';
                const discountLabel =
                    row.discount_price != null ? `${Number(row.discount_price)} ${currency}` : null;

                const payload = {
                    ...row,
                    id: row.id,
                    name: row.name,
                    description: row.description || '',
                    price: priceLabel,
                    discountPrice: discountLabel,
                    store_infos: selectedPurchase?.shopName || '',
                    store_address: selectedPurchase?.address || '',
                    distance: '-- m',
                    inStock: row.in_stock !== false,
                };

                closeReceipt();
                navigation.push('ProductScreen', {
                    product: payload,
                    shopId: row.shop_id || selectedPurchase?.shopId || null,
                    productRow: row,
                });
            } catch (e) {
                console.error('[HistoryScreen] openProductFromReceipt failed', e);
                Alert.alert('Error', 'Failed to open product.');
            }
        },
        [closeReceipt, navigation, selectedPurchase]
    );

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const ownerUuid = await getOrCreateOwnerUuid();
            setOwnerUuid(ownerUuid);
            const { data, error } = await supabase.rpc('get_owner_profile', {
                p_owner: ownerUuid,
                p_history_limit: 250,
            });
            if (error) throw error;

            const rows = Array.isArray(data?.history) ? data.history : [];
            const mapped = rows
                .map((r, idx) => {
                    const { date, time } = occurredAtToDateTime(r?.occurred_at);
                    return {
                        id: r?.occurred_at ? `${r.type}-${r.occurred_at}-${idx}` : `${r?.type ?? 'row'}-${idx}`,
                        type: r?.type ?? 'unknown',
                        date: date ?? '1970-01-01',
                        time: time ?? '--:--',
                        shopId: r?.shop_id ?? null,
                        shopName: r?.shop_name ?? '',
                        address: r?.shop_address ?? '',
                        category: r?.shop_category ?? null,
                        amount: r?.amount != null ? Number(r.amount) : 0,
                        currency: r?.currency ?? null,
                        meta: r?.meta ?? null,
                        transactionId: r?.transaction_id ?? null,
                    };
                })
                .filter((x) => x.type === 'visit' || x.type === 'cashback' || x.type === 'purchase' || x.type === 'adjustment');

            const withHandlers = mapped.map((item) => {
                if (item.type !== 'purchase') return item;
                return {
                    ...item,
                    onOpenDetails: () => openReceipt(item),
                };
            });

            setHistoryRows(withHandlers);
        } catch (e) {
            console.error('[HistoryScreen] fetch history failed', e);
            setHistoryRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchHistory();
        }, [fetchHistory])
    );

    const filteredData = useMemo(() => {
        if (activeFilter === 'all') return historyRows;
        return historyRows.filter((item) => item.type === activeFilter);
    }, [activeFilter, historyRows]);

    const grouped = useMemo(() => groupByDay(filteredData), [filteredData]);

    const totalCashback = historyRows
        .filter((i) => i.type === 'cashback')
        .reduce((sum, i) => sum + (i.amount || 0), 0);

    const receiptTx = receipt?.transaction ?? null;
    const receiptItems = Array.isArray(receipt?.items) ? receipt.items : [];
    const receiptTotals = receipt?.computed_totals ?? null;

    const totalExternalFromPayments = useMemo(() => {
        if (receiptTotals?.total_external != null) return Number(receiptTotals.total_external);
        return null;
    }, [receiptTotals]);

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
                <Text style={styles.headerTitle}>History</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Filter chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.filterRow}
            >
                {FILTERS.map((f) => {
                    const isActive = activeFilter === f.key;
                    return (
                        <TouchableOpacity
                            key={f.key}
                            activeOpacity={0.7}
                            onPress={() => setActiveFilter(f.key)}
                            style={[styles.filterChip, isActive && styles.filterChipActive]}
                        >
                            <Ionicons
                                name={f.icon}
                                size={16}
                                color={isActive ? '#fff' : '#2d253b'}
                            />
                            <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Summary bar */}
            <View style={styles.summaryBar}>
                <View style={styles.summaryItem}>
                    <Ionicons name="storefront-outline" size={18} color="#2d253b" />
                    <Text style={styles.summaryValue}>{historyRows.filter((i) => i.type === 'visit').length}</Text>
                    <Text style={styles.summaryLabel}>visits</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                    <Ionicons name="cash-outline" size={18} color="#10B981" />
                    <Text style={[styles.summaryValue, { color: '#10B981' }]}>{totalCashback.toFixed(2)}</Text>
                    <Text style={styles.summaryLabel}>cashback</Text>
                </View>
            </View>

            {/* Grouped list */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading && (
                    <View style={styles.loadingBox}>
                        <Text style={styles.loadingText}>Loading history…</Text>
                    </View>
                )}

                {!loading && grouped.length === 0 && (
                    <View style={styles.loadingBox}>
                        <Text style={styles.loadingText}>No history yet.</Text>
                    </View>
                )}

                {grouped.map((group) => (
                    <View key={group.date} style={styles.dayGroup}>
                        {/* Day separator */}
                        <View style={styles.daySeparator}>
                            <View style={styles.daySeparatorLine} />
                            <View style={styles.dayLabelContainer}>
                                <Ionicons name="calendar" size={14} color="#2d253b" />
                                <Text style={styles.dayLabel}>{group.label}</Text>
                                <View style={styles.dayCountBadge}>
                                    <Text style={styles.dayCountText}>{group.items.length}</Text>
                                </View>
                            </View>
                            <View style={styles.daySeparatorLine} />
                        </View>

                        {/* Cards */}
                        {group.items.map((item) => (
                            <View key={item.id}>
                                {item.type === 'visit' && (
                                    <>
                                        <VisitCard item={item} />
                                    </>
                                )}
                                {item.type === 'cashback' && (
                                    <>
                                        <CashbackCard item={item} />
                                    </>
                                )}
                                {item.type === 'purchase' && (
                                    <PurchaseCard item={item} />
                                )}
                                {item.type === 'adjustment' && (
                                    <AdjustmentCard item={item} />
                                )}
                            </View>
                        ))}
                    </View>
                ))}
                <View style={{ height: 30 }} />
            </ScrollView>

            <Modal
                visible={receiptVisible}
                transparent
                animationType="slide"
                onRequestClose={closeReceipt}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeReceipt} />
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle} numberOfLines={1}>
                                {selectedPurchase?.shopName || 'Purchase details'}
                            </Text>
                            <TouchableOpacity activeOpacity={0.75} onPress={closeReceipt}>
                                <Ionicons name="close" size={22} color="#2d253b" />
                            </TouchableOpacity>
                        </View>

                        {receiptLoading ? (
                            <View style={{ paddingVertical: 20, alignItems: 'center', gap: 10 }}>
                                <ActivityIndicator size="small" color="#2d253b" />
                                <Text style={styles.modalTextMuted}>Loading…</Text>
                            </View>
                        ) : receiptError ? (
                            <View style={{ paddingVertical: 10 }}>
                                <Text style={styles.modalTextStrong}>{receiptError}</Text>
                            </View>
                        ) : !receiptTx ? (
                            <View style={{ paddingVertical: 10 }}>
                                <Text style={styles.modalTextStrong}>Details unavailable</Text>
                                <Text style={styles.modalTextMuted}>This purchase has no receipt snapshot.</Text>
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View style={styles.modalSection}>
                                    <Text style={styles.modalSectionTitle}>Payment</Text>
                                    <Text style={styles.modalText}>
                                        Total: {formatMoney(
                                            totalExternalFromPayments != null
                                                ? totalExternalFromPayments
                                                : receiptTx?.meta?.external_paid_amount != null
                                                    ? receiptTx.meta.external_paid_amount
                                                    : Math.abs(Number(receiptTx.amount || 0)),
                                            receiptTx.currency
                                        )}
                                    </Text>
                                    {receiptTx?.meta?.payment_method ? (
                                        <Text style={styles.modalText}>
                                            Method: {String(receiptTx.meta.payment_method)}
                                            {receiptTx?.meta?.last4 ? ` ···${receiptTx.meta.last4}` : ''}
                                        </Text>
                                    ) : null}
                                    {receiptTx?.meta?.cashback_used_amount != null && Number(receiptTx.meta.cashback_used_amount) !== 0 ? (
                                        <Text style={styles.modalText}>
                                            Used cashback/wallet: {formatMoney(receiptTx.meta.cashback_used_amount, receiptTx.currency)}
                                        </Text>
                                    ) : receiptTx?.meta?.wallet_used_amount != null && Number(receiptTx.meta.wallet_used_amount) !== 0 ? (
                                        <Text style={styles.modalText}>
                                            Used cashback/wallet: {formatMoney(receiptTx.meta.wallet_used_amount, receiptTx.currency)}
                                        </Text>
                                    ) : null}
                                </View>

                                <View style={styles.modalSection}>
                                    <Text style={styles.modalSectionTitle}>Items</Text>
                                    {receiptItems.length === 0 ? (
                                        <Text style={styles.modalTextMuted}>No item snapshot available.</Text>
                                    ) : (
                                        receiptItems.map((it, idx) => {
                                            const pid = it?.product_id || it?.productId || it?.item_id || null;
                                            const product = pid ? receiptProductsById?.[pid] : null;
                                            const name = product?.name || it?.name || 'Item';
                                            const qty = safeNumber(it?.quantity ?? it?.qty) || 1;
                                            const currency =
                                                it?.currency || product?.currency || receiptTx.currency || selectedPurchase?.currency || 'EUR';
                                            const unit = safeNumber(it?.unit_price ?? it?.unitPrice ?? it?.unit_price);
                                            const discount = safeNumber(it?.unit_discount_price ?? it?.unitDiscountPrice ?? it?.discount_price ?? it?.discountPrice);
                                            const effectiveUnit = discount != null ? discount : unit;
                                            const showOld = unit != null && effectiveUnit != null && discount != null && effectiveUnit < unit;
                                            const imgUrls = product?.image_urls;
                                            const thumb =
                                                Array.isArray(imgUrls) && imgUrls.length > 0
                                                    ? imgUrls[0]
                                                    : imgUrls && typeof imgUrls === 'object' && Array.isArray(imgUrls?.urls) && imgUrls.urls.length > 0
                                                        ? imgUrls.urls[0]
                                                        : null;

                                            return (
                                                <TouchableOpacity
                                                    key={`${pid || idx}`}
                                                    activeOpacity={0.85}
                                                    onPress={() => openProductFromReceipt(pid)}
                                                    style={styles.itemRow}
                                                >
                                                    {thumb ? (
                                                        <Image source={{ uri: thumb }} style={styles.itemThumb} />
                                                    ) : (
                                                        <View style={styles.itemThumbPlaceholder}>
                                                            <Ionicons name="image-outline" size={18} color="#94a3b8" />
                                                        </View>
                                                    )}
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
                                                        <Text style={styles.itemMeta} numberOfLines={1}>
                                                            {qty > 1 ? `x${qty}` : 'x1'}
                                                        </Text>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        {showOld ? (
                                                            <Text style={styles.itemOldPrice}>{formatMoney((unit ?? 0) * qty, currency)}</Text>
                                                        ) : null}
                                                        <Text style={styles.itemPrice}>
                                                            {effectiveUnit != null ? formatMoney(effectiveUnit * qty, currency) : ''}
                                                        </Text>
                                                        {showOld ? <Text style={styles.itemDiscountBadge}>DISCOUNT</Text> : null}
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })
                                    )}
                                </View>
                                <View style={{ height: 24 }} />
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ── Styles ───────────────────────────────────────────────────────────

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

    // Filters
    filterScroll: {
        flexGrow: 0,
        flexShrink: 1,
    },
    filterRow: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        gap: 8,
        alignItems: 'center',
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 16,
        backgroundColor: '#e8ebf0',
    },
    filterChipActive: {
        backgroundColor: '#2d253b',
    },
    filterChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2d253b',
    },
    filterChipTextActive: {
        color: '#fff',
    },

    // Summary
    summaryBar: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
        gap: 20,
    },
    summaryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    summaryValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2d253b',
    },
    summaryLabel: {
        fontSize: 14,
        color: '#999',
        fontWeight: '500',
    },
    summaryDivider: {
        width: 1,
        height: 24,
        backgroundColor: '#ddd',
    },

    // Scroll
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
    },
    loadingBox: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 14,
        color: '#9aa3af',
        fontWeight: '600',
    },

    // Day Group
    dayGroup: {
        marginBottom: 8,
    },
    daySeparator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 14,
        gap: 12,
    },
    daySeparatorLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#dde0e5',
    },
    dayLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e8ebf0',
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        gap: 6,
    },
    dayLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#2d253b',
    },
    dayCountBadge: {
        backgroundColor: '#2d253b',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    dayCountText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#fff',
    },

    // Main Card
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 14,
        marginBottom: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    cardIconContainer: {
        width: 46,
        height: 46,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 1,
    },
    cardInfo: {
        flex: 1,
        gap: 3,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    cardAddressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    cardSubtitle: {
        fontSize: 12,
        color: '#aaa',
        flex: 1,
    },
    cardMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    typeBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    cashbackAmount: {
        fontSize: 15,
        fontWeight: '700',
        marginTop: 2,
    },
    cardRight: {
        alignItems: 'flex-end',
        gap: 6,
        marginLeft: 8,
    },
    cardTime: {
        fontSize: 13,
        fontWeight: '600',
        color: '#b0b0b0',
    },

    detailBox: {
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 10,
        marginLeft: 24,
        marginTop: 0,
        borderWidth: 1,
        borderColor: '#eef0f3',
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    detailTitle: {
        flex: 1,
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
    },
    detailLine: {
        marginTop: 4,
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
    },
    detailHint: {
        marginTop: 6,
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '700',
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        flex: 1,
    },
    modalCard: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 16,
        maxHeight: '82%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#2d253b',
    },
    modalSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#eef0f3',
    },
    modalSectionTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    modalText: {
        fontSize: 14,
        color: '#334155',
        fontWeight: '600',
        marginTop: 2,
    },
    modalTextStrong: {
        fontSize: 15,
        color: '#0f172a',
        fontWeight: '800',
        marginTop: 2,
    },
    modalTextMuted: {
        fontSize: 13,
        color: '#94a3b8',
        fontWeight: '600',
        marginTop: 2,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#eef0f3',
        marginTop: 8,
    },
    itemThumb: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#eef2f7',
    },
    itemThumbPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#eef2f7',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    itemName: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0f172a',
    },
    itemMeta: {
        marginTop: 2,
        fontSize: 12,
        fontWeight: '600',
        color: '#94a3b8',
    },
    itemPrice: {
        fontSize: 14,
        fontWeight: '900',
        color: '#0f172a',
    },
    itemOldPrice: {
        fontSize: 12,
        fontWeight: '700',
        color: '#ef4444',
        textDecorationLine: 'line-through',
    },
    itemDiscountBadge: {
        marginTop: 4,
        fontSize: 10,
        fontWeight: '900',
        color: '#ef4444',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
});
