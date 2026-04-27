import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, TextInput, Animated, Easing, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import FCShop from '../components/FCShop';
import FCProduct from '../components/FCProduct';
import { getFavoriteProducts, getFavoriteShops } from '../lib/favorites';

export default function FavoritesScreen() {
    const navigation = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchAnim = useRef(new Animated.Value(0)).current;
    const searchInputRef = useRef(null);

    const [favoriteProducts, setFavoriteProducts] = useState([]);
    const [favoriteShops, setFavoriteShops] = useState([]);

    const refreshFavorites = useCallback(async () => {
        try {
            const [p, s] = await Promise.all([getFavoriteProducts(), getFavoriteShops()]);
            setFavoriteProducts(p || []);
            setFavoriteShops(s || []);
        } catch (e) {
            console.error('[FavoritesScreen] refresh failed', e);
            setFavoriteProducts([]);
            setFavoriteShops([]);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            refreshFavorites();
        }, [refreshFavorites])
    );

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

    const dropdownHeight = searchAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 55],
    });
    const dropdownOpacity = searchAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
    });

    const q = searchQuery.trim().toLowerCase();
    const filteredProducts = favoriteProducts
        .filter((f) => {
            if (!q) return true;
            const p = f?.product || {};
            const hay = `${p?.name || ''} ${p?.store_infos || ''} ${p?.store_address || ''}`.toLowerCase();
            return hay.includes(q);
        });

    const filteredShops = favoriteShops
        .filter((f) => {
            if (!q) return true;
            const s = f?.shop || {};
            const hay = `${s?.title || s?.name || ''} ${s?.address || s?.adress || ''}`.toLowerCase();
            return hay.includes(q);
        });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Favorites</Text>
                <TouchableOpacity onPress={toggleSearch} activeOpacity={0.7} style={{
                    backgroundColor: '#eceff3ff',
                    borderRadius: 50,
                    padding: 10,

                    borderColor: '#2d253bff',
                    borderWidth: 1,
                }}>
                    <Ionicons name={isSearchOpen ? 'close' : 'search-outline'} size={24} color="#2d253bff" />
                </TouchableOpacity>
            </View>

            {/* Search dropdown */}
            <Animated.View style={{
                height: dropdownHeight,
                opacity: dropdownOpacity,
                overflow: 'hidden',
                backgroundColor: '#f2f4f7',
                paddingHorizontal: 16,
                justifyContent: 'center',
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
                        placeholder="Search favorites..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        style={{
                            flex: 1,
                            fontSize: 16,
                            color: '#2d253bff',
                            marginLeft: 8,
                            outlineStyle: 'none',
                        }}
                    />
                </View>
            </Animated.View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Favorite Shops */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="storefront-outline" size={22} color="#2d253b" />
                            <Text style={styles.sectionTitle}>Shops</Text>
                        </View>
                        <Text style={styles.sectionCount}>{filteredShops.length} shops</Text>
                    </View>

                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 3, paddingVertical: 5 }}
                    >
                        {filteredShops.map((f) => (
                            <FCShop key={f.id} initialFavorite={true} shop={f.shop} />
                        ))}
                    </ScrollView>
                </View>

                {/* Favorite Products */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="pricetag-outline" size={22} color="#2d253b" />
                            <Text style={styles.sectionTitle}>Products</Text>
                        </View>
                        <Text style={styles.sectionCount}>{filteredProducts.length} products</Text>
                    </View>

                    <View style={styles.productsGrid}>
                        <View style={styles.productColumn}>
                            {filteredProducts
                                .filter((_, idx) => idx % 2 === 0)
                                .map((f) => (
                                    <FCProduct
                                        key={f.id}
                                        initialFavorite={true}
                                        product={{
                                            id: f?.product?.id || f.id,
                                            name: f?.product?.name || 'Product',
                                            price: f?.product?.price || '',
                                            old_price: f?.product?.discountPrice || null,
                                            store_infos: f?.product?.store_infos || '',
                                            store_address: f?.product?.store_address || '',
                                            distance: f?.product?.distance || '',
                                            description: f?.product?.description || '',
                                            inStock: f?.product?.inStock !== false,
                                            img: f?.product?.imageUrl ? { uri: String(f.product.imageUrl) } : require('../../assets/sneakers.jpeg'),
                                            images: f?.product?.imageUrl ? [String(f.product.imageUrl)] : [],
                                        }}
                                    />
                                ))}
                        </View>
                        <View style={styles.productColumn}>
                            {filteredProducts
                                .filter((_, idx) => idx % 2 === 1)
                                .map((f) => (
                                    <FCProduct
                                        key={f.id}
                                        initialFavorite={true}
                                        product={{
                                            id: f?.product?.id || f.id,
                                            name: f?.product?.name || 'Product',
                                            price: f?.product?.price || '',
                                            old_price: f?.product?.discountPrice || null,
                                            store_infos: f?.product?.store_infos || '',
                                            store_address: f?.product?.store_address || '',
                                            distance: f?.product?.distance || '',
                                            description: f?.product?.description || '',
                                            inStock: f?.product?.inStock !== false,
                                            img: f?.product?.imageUrl ? { uri: String(f.product.imageUrl) } : require('../../assets/sneakers.jpeg'),
                                            images: f?.product?.imageUrl ? [String(f.product.imageUrl)] : [],
                                        }}
                                    />
                                ))}
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f2f4f7',
    },
    header: {
        paddingTop: 50,
        backgroundColor: '#f2f4f7',
        padding: 16,
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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 30,
    },
    section: {
        margin: 10,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2d253b',
    },
    sectionCount: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '500',
    },
    productsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 28,
        padding: 10,
    },
    productColumn: {
        flex: 1,
        gap: 28,
    },
});
