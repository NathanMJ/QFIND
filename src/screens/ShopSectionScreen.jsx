import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    Image,
    StyleSheet,
    ActivityIndicator,
    StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient';
import { firstProductImageSource, parseProductImageUrls } from '../lib/productImages';

const FALLBACK_IMG = require('../../assets/sneakers.jpeg');

function formatMoney(value, currency) {
    if (value == null || value === '') return '';
    const c = currency || 'EUR';
    return `${Number(value)} ${c}`;
}

function buildProductForDetail(row, shopMeta) {
    const currency = row.currency || 'EUR';
    const hasDiscount = row.discount_price != null;
    const priceStr = formatMoney(row.price, currency);
    const discountStr = hasDiscount ? formatMoney(row.discount_price, currency) : null;
    const urls = parseProductImageUrls(row);
    return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        price: hasDiscount ? priceStr : priceStr,
        discountPrice: hasDiscount ? discountStr : null,
        image_urls: urls,
        img: firstProductImageSource(urls, FALLBACK_IMG),
        store_infos: shopMeta.name,
        store_address: shopMeta.address || '',
        distance: shopMeta.distance || '-- m',
        inStock: row.in_stock !== false,
    };
}

export default function ShopSectionScreen({ route, navigation }) {
    const { shopId, shopMeta, mode, sectionId, title } = route.params || {};
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!shopId) {
            setRows([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            let q = supabase
                .from('products')
                .select('id,name,description,price,discount_price,currency,in_stock,image_urls,created_at')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false });

            if (mode === 'discounts') {
                q = q.not('discount_price', 'is', null);
            } else if (mode === 'section' && sectionId) {
                q = q.eq('section_id', sectionId);
            }

            const { data, error } = await q;
            if (error) throw error;
            setRows(data || []);
        } catch (e) {
            console.error('[ShopSectionScreen]', e);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [shopId, mode, sectionId]);

    useEffect(() => {
        load();
    }, [load]);

    const renderItem = ({ item }) => {
        const p = buildProductForDetail(item, shopMeta || {});
        const showStrike = p.discountPrice != null;
        return (
            <TouchableOpacity
                style={styles.row}
                activeOpacity={0.85}
                onPress={() =>
                    navigation.navigate('ProductScreen', {
                        product: p,
                    })
                }
            >
                <Image source={p.img} style={styles.thumb} resizeMode="cover" />
                <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                        {p.name}
                    </Text>
                    <View style={styles.priceRow}>
                        {showStrike && <Text style={styles.oldP}>{p.price}</Text>}
                        <Text style={styles.curP}>{p.discountPrice || p.price}</Text>
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {title || 'Products'}
                </Text>
                <View style={{ width: 40 }} />
            </View>
            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#1ba5b8" />
                </View>
            ) : (
                <FlatList
                    data={rows}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={rows.length === 0 ? styles.emptyWrap : styles.listPad}
                    ListEmptyComponent={<Text style={styles.empty}>No products in this list.</Text>}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f2f4f7' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 52,
        paddingBottom: 12,
        paddingHorizontal: 12,
        backgroundColor: '#fff',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e5e5e5',
    },
    back: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listPad: { paddingVertical: 12, paddingHorizontal: 16 },
    emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    empty: { textAlign: 'center', color: '#888', fontSize: 15 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 10,
        marginBottom: 10,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
    },
    thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#f0f0f0' },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    oldP: { fontSize: 13, color: '#e74c3c', textDecorationLine: 'line-through' },
    curP: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
});
