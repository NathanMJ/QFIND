import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    Image,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    StatusBar,
    Animated,
    Linking,
    Platform,
    Alert,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { firstProductImageSource, parseProductImageUrls } from '../lib/productImages';
import { supabase } from '../lib/supabaseClient';
import { getOrCreateOwnerUuid } from '../lib/ownerUuid';
import { uploadProductImage } from '../lib/storageUpload';
import { isProductFavorite, toggleProductFavorite } from '../lib/favorites';
import { useSettings } from '../context/SettingsContext';

const { width } = Dimensions.get('window');

const CURRENCY_OPTIONS = [
    { code: 'EUR', label: 'Euro (€)' },
    { code: 'USD', label: 'Dollar ($)' },
    { code: 'GBP', label: 'Livre (£)' },
    { code: 'ILS', label: 'Shekel (₪)' },
];

export default function ProductScreen({ route, navigation }) {
    const product = route?.params?.product ?? null;
    const { formatDistance } = useSettings();

    const isOwner = route?.params?.isOwner || false;
    const currentSection = route?.params?.currentSection || '';
    const availableSections = route?.params?.availableSections || [];
    const onProductUpdate = route?.params?.onProductUpdate;
    const shopId = route?.params?.shopId ?? null;
    const productRow = route?.params?.productRow ?? null;

    // ─── Display state ───
    const [displayProduct, setDisplayProduct] = useState(product);
    const productId = displayProduct?.id || displayProduct?.row?.id || route?.params?.productRow?.id || null;

    const [isFavorite, setIsFavorite] = useState(false);
    const [showFullDescription, setShowFullDescription] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    // Gallery sources (image_urls + legacy images). Dedupe & keep stable ordering.
    const imageUrls = parseProductImageUrls(displayProduct);
    const legacyUrisRaw = Array.isArray(displayProduct?.images) ? displayProduct.images : [];
    const legacyUris = legacyUrisRaw
        .map((x) => (typeof x === 'string' ? x : x?.uri))
        .filter(Boolean)
        .map(String);
    const galleryUrls = Array.from(new Set([...imageUrls, ...legacyUris].filter(Boolean)));

    const fallbackMain =
        legacyUris.length > 0
            ? { uri: legacyUris[0] }
            : displayProduct?.img ?? null;

    const gallerySources =
        galleryUrls.length > 0
            ? galleryUrls.map((u) => ({ uri: String(u) }))
            : [fallbackMain].filter(Boolean);

    const effectiveShopId =
        shopId ||
        productRow?.shop_id ||
        displayProduct?.shop_id ||
        displayProduct?.row?.shop_id ||
        null;

    const [shopData, setShopData] = useState(displayProduct?.shopData ?? null);
    const [moreProducts, setMoreProducts] = useState([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const fav = await isProductFavorite(productId);
                if (!cancelled) setIsFavorite(Boolean(fav));
            } catch {
                if (!cancelled) setIsFavorite(false);
            }
        })();
        return () => { cancelled = true; };
    }, [productId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!effectiveShopId) {
                setShopData((prev) => prev ?? null);
                setMoreProducts([]);
                return;
            }

            try {
                // Fetch shop info for "Go to the shop"
                if (!shopData || shopData?.id !== effectiveShopId) {
                    const { data: shopRow, error: shopErr } = await supabase
                        .from('shops')
                        .select('id,name,address,category,phone,open_time,close_time,logo_url,cover_url')
                        .eq('id', effectiveShopId)
                        .maybeSingle();
                    if (shopErr) throw shopErr;

                    if (!cancelled) {
                        setShopData(
                            shopRow
                                ? {
                                    id: shopRow.id,
                                    name: shopRow.name,
                                    title: shopRow.name,
                                    adress: shopRow.address || '',
                                    address: shopRow.address || '',
                                    category: shopRow.category || null,
                                    phone: shopRow.phone || '',
                                    openTime: shopRow.open_time || null,
                                    open_time: shopRow.open_time || null,
                                    closeTime: shopRow.close_time || null,
                                    close_time: shopRow.close_time || null,
                                    logoUrl: shopRow.logo_url || null,
                                    logo_url: shopRow.logo_url || null,
                                    coverUrl: shopRow.cover_url || null,
                                    cover_url: shopRow.cover_url || null,
                                }
                                : null
                        );
                    }
                }

                // Fetch 5 more products from the same shop (exclude current product)
                const { data: rows, error: prodErr } = await supabase
                    .from('products')
                    .select('id,name,price,discount_price,currency,image_urls,in_stock,created_at')
                    .eq('shop_id', effectiveShopId)
                    .neq('id', productId || '__none__')
                    .order('created_at', { ascending: false })
                    .limit(8);
                if (prodErr) throw prodErr;

                if (!cancelled) {
                    const mapped = (rows || []).map((row) => {
                        const urls = parseProductImageUrls(row);
                        const currency = row.currency || 'EUR';
                        const hasDiscount = row.discount_price != null;
                        const priceLabel = row.price != null ? `${Number(row.price)} ${currency}` : '';
                        const discountLabel =
                            row.discount_price != null ? `${Number(row.discount_price)} ${currency}` : null;
                        return {
                            id: row.id,
                            name: row.name,
                            price: hasDiscount ? priceLabel : priceLabel,
                            discountPrice: hasDiscount ? discountLabel : null,
                            img: firstProductImageSource(urls, null),
                            inStock: row.in_stock ?? true,
                            row,
                        };
                    });
                    setMoreProducts(mapped);
                }
            } catch (e) {
                console.error('[ProductScreen] more/shop fetch failed', e);
                if (!cancelled) setMoreProducts([]);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveShopId, productId]);

    if (!displayProduct) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
                <Ionicons name="pricetag-outline" size={64} color="#c7cbd3" />
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#2d253b', marginTop: 10 }}>
                    Product not found
                </Text>
                <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '600', textAlign: 'center', marginTop: 6 }}>
                    Please go back and select a product.
                </Text>
                <TouchableOpacity
                    style={{ marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#2d253b', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 }}
                    activeOpacity={0.85}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="arrow-back" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Go back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ─── Edit modal state ───
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPrice, setEditPrice] = useState('');
    const [editOldPrice, setEditOldPrice] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editImages, setEditImages] = useState([]);
    const [editSection, setEditSection] = useState('');
    const [editCurrency, setEditCurrency] = useState('EUR');
    const [editInStock, setEditInStock] = useState(true);
    const [newSectionName, setNewSectionName] = useState('');
    const [showNewSectionInput, setShowNewSectionInput] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);

    const openEditModal = () => {
        const priceNum = displayProduct.price ? displayProduct.price.replace(/[^0-9.]/g, '') : '';
        const discountPriceNum = displayProduct.discountPrice ? displayProduct.discountPrice.replace(/[^0-9.]/g, '') : '';

        setEditName(displayProduct.name || '');
        setEditPrice(priceNum);
        setEditOldPrice(discountPriceNum);
        setEditDescription(displayProduct.description || '');
        setEditSection(currentSection);
        setEditCurrency(productRow?.currency || displayProduct?.currency || 'EUR');
        setEditInStock(displayProduct?.inStock ?? displayProduct?.in_stock ?? true);
        setShowNewSectionInput(false);
        setNewSectionName('');

        const imgs = (displayProduct.images && displayProduct.images.length > 0)
            ? [...displayProduct.images]
            : [];
        setEditImages(imgs);

        setEditModalVisible(true);
    };

    const pickEditImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to your photo library.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
            setEditImages((prev) => [...prev, result.assets[0].uri]);
        }
    };

    const removeEditImage = (index) => {
        setEditImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSaveEdit = () => {
        if (!editName.trim()) {
            Alert.alert('Error', 'Product name is required.');
            return;
        }
        if (!editPrice.trim()) {
            Alert.alert('Error', 'Product price is required.');
            return;
        }
        if (editImages.length === 0) {
            Alert.alert('Error', 'Please add at least one product photo.');
            return;
        }

        let section = editSection;
        if (showNewSectionInput) {
            if (!newSectionName.trim()) {
                Alert.alert('Error', 'Please enter a section name.');
                return;
            }
            section = newSectionName.trim();
        }
        if (!section) {
            Alert.alert('Error', 'Please select a section.');
            return;
        }

        if (!isOwner) {
            Alert.alert('Error', 'You cannot edit this product.');
            return;
        }
        if (!displayProduct?.id) {
            Alert.alert('Error', 'Missing product id.');
            return;
        }
        if (!shopId && !productRow?.shop_id) {
            Alert.alert('Error', 'Missing shop id.');
            return;
        }

        (async () => {
            setSavingEdit(true);
            try {
                const effectiveShopId = shopId || productRow?.shop_id;
                const ownerUuid = await getOrCreateOwnerUuid();

                // Upload newly picked images (file://...) to Supabase Storage
                const publicUrls = [];
                for (let i = 0; i < editImages.length; i++) {
                    const img = editImages[i];
                    const uri = typeof img === 'string' ? img : img?.uri;
                    if (!uri) continue;

                    const isRemote = /^https?:\/\//i.test(uri);
                    if (isRemote) {
                        publicUrls.push(uri);
                        continue;
                    }

                    const url = await uploadProductImage({
                        ownerUuid,
                        shopId: effectiveShopId,
                        productId: displayProduct.id,
                        index: i,
                        localUri: uri,
                        contentType: img?.mimeType,
                    });
                    publicUrls.push(url);
                }

                if (publicUrls.length === 0) {
                    throw new Error('missing_images');
                }

                const priceNum = Number(editPrice.trim());
                const hasDiscount = editOldPrice.trim() !== '';
                const discountNum = hasDiscount ? Number(editOldPrice.trim()) : null;
                const { data: updatedRow, error: upErr } = await supabase.rpc('update_product', {
                    p_product_id: displayProduct.id,
                    p_shop_id: effectiveShopId,
                    p_name: editName.trim(),
                    p_description: editDescription.trim() || null,
                    p_price: Number.isFinite(priceNum) ? priceNum : null,
                    p_discount_price:
                        discountNum != null && Number.isFinite(discountNum) ? discountNum : null,
                    p_currency: editCurrency || 'EUR',
                    p_in_stock: Boolean(editInStock),
                    p_image_urls: publicUrls,
                    p_section_title: section,
                });
                if (upErr) throw upErr;
                if (!updatedRow?.id) throw new Error('update_failed');

                const currency = updatedRow.currency || editCurrency || productRow?.currency || 'EUR';

                // Update UI models (screen + MyShopEditScreen callback)
                const updatedData = {
                    name: updatedRow.name,
                    price: updatedRow.price != null ? `${Number(updatedRow.price)} ${currency}` : '',
                    discountPrice:
                        updatedRow.discount_price != null
                            ? `${Number(updatedRow.discount_price)} ${currency}`
                            : null,
                    description: editDescription.trim(),
                    images: publicUrls,
                    img: { uri: publicUrls[0] },
                    inStock: updatedRow.in_stock ?? Boolean(editInStock),
                };

                setDisplayProduct((prev) => ({
                    ...prev,
                    name: updatedData.name,
                    price: updatedData.price,
                    discountPrice: updatedData.discountPrice,
                    description: updatedData.description,
                    images: updatedData.images,
                    img: updatedData.img,
                    inStock: updatedData.inStock,
                    in_stock: updatedData.inStock,
                }));

                if (onProductUpdate) {
                    onProductUpdate(displayProduct.id, currentSection, section, updatedData);
                }

                setEditModalVisible(false);
                Alert.alert('Saved!', 'Product has been updated.');
            } catch (e) {
                console.error('[ProductScreen] save edit failed', e);
                Alert.alert('Error', 'Failed to update product. Please try again.');
            } finally {
                setSavingEdit(false);
            }
        })();
    };

    const toggleFavorite = () => {
        if (!isFavorite) {
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 12 }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }),
            ]).start();
        }

        (async () => {
            try {
                const imageUrl =
                    (Array.isArray(imageUrls) && imageUrls[0]) ||
                    (typeof mainImageSource === 'object' ? mainImageSource?.uri : null) ||
                    null;

                const productSnapshot = {
                    id: productId,
                    name: displayProduct?.name,
                    price: displayProduct?.price,
                    discountPrice: displayProduct?.discountPrice,
                    description: displayProduct?.description,
                    store_infos: displayProduct?.store_infos,
                    store_address: displayProduct?.store_address,
                    distance: displayProduct?.distance,
                    distanceM: displayProduct?.distanceM ?? null,
                    inStock: displayProduct?.inStock ?? displayProduct?.in_stock ?? true,
                    imageUrl,
                };

                const next = await toggleProductFavorite({
                    id: productId,
                    product: productSnapshot,
                });
                setIsFavorite(Boolean(next));
            } catch (e) {
                console.error('[ProductScreen] toggle favorite failed', e);
            }
        })();
    };

    const handleFindShop = () => {
        const query = displayProduct.store_address || displayProduct.store_infos || '';
        const url = Platform.select({
            ios: `maps:0,0?q=${query}`,
            android: `geo:0,0?q=${query}`,
            default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
        });
        Linking.openURL(url);
    };

    const handleGoToShop = () => {
        const s = shopData || displayProduct.shopData;
        if (s) {
            navigation.navigate('ShopScreen', { shop: s });
        }
    };

    const descriptionText = displayProduct.description || '';
    const descriptionPreview = descriptionText.length > 300 ? descriptionText.substring(0, 300) + '...' : descriptionText;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} bounces={false}>
                {/* Top bar */}
                <View style={styles.topBar}>
                    <TouchableOpacity style={styles.returnButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                        <Ionicons name="chevron-back" size={22} color="#1a1a1a" />
                        <Text style={styles.returnText}>Return</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleFavorite} activeOpacity={0.7} style={styles.favButton}>
                        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                            <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={28} color={isFavorite ? '#1ba5b8' : '#1a1a1a'} />
                        </Animated.View>
                    </TouchableOpacity>
                </View>

                {/* Product images (horizontal scroll if multiple) */}
                <View style={styles.imageContainer}>
                    {gallerySources.length <= 1 ? (
                        <Image source={gallerySources[0]} style={styles.productImage} resizeMode="contain" />
                    ) : (
                        <>
                            <ScrollView
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={(e) => {
                                    const x = e.nativeEvent.contentOffset.x || 0;
                                    const idx = Math.round(x / width);
                                    setActiveImageIndex(Math.max(0, Math.min(idx, gallerySources.length - 1)));
                                }}
                            >
                                {gallerySources.map((src, idx) => (
                                    <View key={String(src?.uri || idx)} style={{ width, height: width * 0.7, alignItems: 'center', justifyContent: 'center' }}>
                                        <Image source={src} style={styles.productImage} resizeMode="contain" />
                                    </View>
                                ))}
                            </ScrollView>
                            <View style={styles.paginationDots}>
                                {gallerySources.map((_, i) => (
                                    <View key={i} style={[styles.dot, i === activeImageIndex && styles.dotActive]} />
                                ))}
                            </View>
                        </>
                    )}
                </View>

                {/* Product Info */}
                <View style={styles.productInfoSection}>
                    <View style={styles.nameRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.productName}>{displayProduct.name}</Text>
                            {(displayProduct?.inStock ?? displayProduct?.in_stock ?? true)
                                ? <Text style={styles.inStockText}>in stock</Text>
                                : <Text style={[styles.inStockText, { color: '#e74c3c' }]}>out of stock</Text>}
                        </View>
                        <View style={styles.priceBlock}>
                            {displayProduct.discountPrice && <Text style={styles.oldPrice}>{displayProduct.price}</Text>}
                            <Text style={styles.currentPrice}>{displayProduct.discountPrice || displayProduct.price}</Text>
                        </View>
                    </View>
                </View>

                {/* Description */}
                <View style={styles.descriptionSection}>
                    <Text style={styles.descriptionTitle}>Description</Text>
                    <Text style={styles.descriptionText}>
                        {showFullDescription ? descriptionText : descriptionPreview}
                    </Text>
                    {descriptionText.length > 300 && (
                        <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)} activeOpacity={0.7}>
                            <Text style={styles.seeMoreText}>{showFullDescription ? 'See less' : 'See more'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Shop Information */}
                <View style={styles.shopInfoSection}>
                    <Text style={styles.shopInfoTitle}>Shop information</Text>
                    <View style={styles.shopInfoCard}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.shopName}>{displayProduct.store_infos || 'Shop'}</Text>
                            <Text style={styles.shopAddress}>{displayProduct.store_address || ''}</Text>
                        </View>
                        <TouchableOpacity onPress={handleFindShop} activeOpacity={0.7} style={styles.findUsBtn}>
                            <Ionicons name="location-sharp" size={24} color="#e74c3c" />
                            <Text style={styles.findUsText}>Find us !</Text>
                        </TouchableOpacity>
                        <View style={styles.distanceBlock}>
                            <Ionicons name="walk-outline" size={18} color="#666" />
                            <Text style={styles.distanceText}>
                                {displayProduct?.distanceM != null ? formatDistance(displayProduct.distanceM) : (displayProduct.distance || '--')}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* More of the shop */}
                {moreProducts.length > 0 && (
                    <View style={styles.moreSection}>
                        <View style={styles.moreHeader}>
                            <Text style={styles.moreTitle}>More of the shop</Text>
                            <TouchableOpacity onPress={handleGoToShop} activeOpacity={0.75} style={styles.shopLink}>
                                <Text style={styles.shopLinkText}>Go</Text>
                                <Ionicons name="chevron-forward" size={18} color="#1a1a1a" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.moreScroll}
                        >
                            {moreProducts.map((p) => (
                                <TouchableOpacity
                                    key={p.id}
                                    activeOpacity={0.85}
                                    onPress={() =>
                                        navigation.push('ProductScreen', {
                                            product: {
                                                ...p.row,
                                                id: p.id,
                                                name: p.name,
                                                price: p.price,
                                                discountPrice: p.discountPrice,
                                                img: p.img,
                                                store_infos: displayProduct.store_infos,
                                                store_address: displayProduct.store_address,
                                                distance: displayProduct.distance,
                                                inStock: p.inStock,
                                                in_stock: p.inStock,
                                                shopData: shopData || displayProduct.shopData || null,
                                            },
                                            shopId: effectiveShopId,
                                        })
                                    }
                                    style={styles.moreCard}
                                >
                                    <Image
                                        source={p.img || displayProduct?.img}
                                        style={styles.moreCardImage}
                                        resizeMode="cover"
                                    />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Go to the shop (end of scroll) */}
                {(shopData || displayProduct.shopData) && (
                    <View style={styles.goShopWrap}>
                        <TouchableOpacity style={styles.goShopBtn} activeOpacity={0.85} onPress={handleGoToShop}>
                            <Ionicons name="storefront-outline" size={20} color="#fff" />
                            <Text style={styles.goShopBtnText}>Go to the shop</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={{ height: isOwner ? 80 : 30 }} />
            </ScrollView>

            {/* FAB */}
            {isOwner && (
                <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openEditModal}>
                    <Ionicons name="pencil" size={24} color="#fff" />
                </TouchableOpacity>
            )}

            {/* ─── Edit Product Modal ─── */}
            <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.editModalOverlay}>
                    <View style={styles.editModalContainer}>
                        <View style={styles.editModalHeader}>
                            <Text style={styles.editModalTitle}>Edit product</Text>
                            <TouchableOpacity onPress={() => setEditModalVisible(false)} activeOpacity={0.7}>
                                <Ionicons name="close" size={26} color="#2d253b" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.editLabel}>Product name *</Text>
                            <TextInput style={styles.editInput} placeholder="Product name" placeholderTextColor="#aaa" value={editName} onChangeText={setEditName} />

                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                <Text style={[styles.editLabel, { marginTop: 0, marginBottom: 0 }]}>In stock</Text>
                                <Switch
                                    value={Boolean(editInStock)}
                                    onValueChange={(v) => setEditInStock(Boolean(v))}
                                    trackColor={{ false: '#d1d5db', true: '#2d253b' }}
                                    thumbColor={editInStock ? '#fff' : '#fff'}
                                />
                            </View>

                            <Text style={styles.editLabel}>Price *</Text>
                            <TextInput style={styles.editInput} placeholder="e.g. 1199" placeholderTextColor="#aaa" value={editPrice} onChangeText={setEditPrice} keyboardType="numeric" />

                            <Text style={styles.editLabel}>Currency</Text>
                            <View style={styles.currencyRow}>
                                {CURRENCY_OPTIONS.map((c) => {
                                    const selected = editCurrency === c.code;
                                    return (
                                        <TouchableOpacity
                                            key={c.code}
                                            activeOpacity={0.75}
                                            onPress={() => setEditCurrency(c.code)}
                                            style={[styles.currencyChip, selected && styles.currencyChipSelected]}
                                        >
                                            <Text style={[styles.currencyChipText, selected && styles.currencyChipTextSelected]}>
                                                {c.code}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={styles.editLabel}>Discount price</Text>
                            <TextInput style={styles.editInput} placeholder="Leave empty if no discount" placeholderTextColor="#aaa" value={editOldPrice} onChangeText={setEditOldPrice} keyboardType="numeric" />

                            <Text style={styles.editLabel}>Description</Text>
                            <TextInput
                                style={[styles.editInput, styles.editInputMultiline]}
                                placeholder="Product description"
                                placeholderTextColor="#aaa"
                                value={editDescription}
                                onChangeText={setEditDescription}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />

                            <Text style={styles.editLabel}>Photos ({editImages.length})</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.editImagesRow}>
                                {editImages.map((img, index) => (
                                    <View key={index} style={styles.editImageThumb}>
                                        <Image source={typeof img === 'string' ? { uri: img } : img} style={styles.editImageThumbImg} resizeMode="cover" />
                                        <TouchableOpacity style={styles.editImageRemoveBtn} onPress={() => removeEditImage(index)} activeOpacity={0.7}>
                                            <Ionicons name="close-circle" size={22} color="#e74c3c" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <TouchableOpacity style={styles.editImageAddBtn} onPress={pickEditImage} activeOpacity={0.7}>
                                    <Ionicons name="add" size={28} color="#999" />
                                    <Text style={styles.editImageAddText}>Add</Text>
                                </TouchableOpacity>
                            </ScrollView>

                            <Text style={styles.editLabel}>Section *</Text>
                            <View style={styles.editSectionGrid}>
                                {availableSections.map((sec) => (
                                    <TouchableOpacity
                                        key={sec}
                                        activeOpacity={0.7}
                                        onPress={() => { setEditSection(sec); setShowNewSectionInput(false); }}
                                        style={[styles.editSectionChip, editSection === sec && !showNewSectionInput && styles.editSectionChipActive]}
                                    >
                                        <Text style={[styles.editSectionChipText, editSection === sec && !showNewSectionInput && styles.editSectionChipTextActive]}>{sec}</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => { setShowNewSectionInput(true); setEditSection(''); }}
                                    style={[styles.editSectionChip, styles.editSectionChipNew, showNewSectionInput && styles.editSectionChipActive]}
                                >
                                    <Ionicons name="add" size={16} color={showNewSectionInput ? '#fff' : '#2d253b'} />
                                    <Text style={[styles.editSectionChipText, showNewSectionInput && styles.editSectionChipTextActive]}>New</Text>
                                </TouchableOpacity>
                            </View>
                            {showNewSectionInput && (
                                <TextInput
                                    style={[styles.editInput, { marginTop: 8 }]}
                                    placeholder="New section name"
                                    placeholderTextColor="#aaa"
                                    value={newSectionName}
                                    onChangeText={setNewSectionName}
                                    autoFocus
                                />
                            )}

                            <View style={{ height: 20 }} />
                        </ScrollView>

                        <TouchableOpacity
                            style={[styles.editSaveBtn, savingEdit && { opacity: 0.7 }]}
                            activeOpacity={0.8}
                            onPress={handleSaveEdit}
                            disabled={savingEdit}
                        >
                            <Ionicons name={savingEdit ? 'time-outline' : 'checkmark-circle'} size={22} color="#fff" />
                            <Text style={styles.editSaveBtnText}>{savingEdit ? 'Saving…' : 'Save changes'}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // Top bar
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 10, backgroundColor: '#fff' },
    returnButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    returnText: { fontSize: 17, fontWeight: 'bold', color: '#1a1a1a' },
    favButton: { padding: 6 },

    // Product Image
    imageContainer: { width: '100%', height: width * 0.7, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    productImage: { width: '80%', height: '100%' },
    paginationDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', position: 'absolute', bottom: 12, left: 0, right: 0, gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d0d0d0' },
    dotActive: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2d253b' },

    // Product Info
    productInfoSection: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, backgroundColor: '#fff' },
    nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    productName: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a' },
    inStockText: { fontSize: 12, color: '#888', marginTop: 2 },
    priceBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    oldPrice: { fontSize: 14, color: '#e74c3c', textDecorationLine: 'line-through' },
    currentPrice: { fontSize: 26, fontWeight: 'bold', color: '#1a1a1a' },

    // Colors
    // (removed: color/storage/screenSize selectors)

    // Description
    descriptionSection: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
    descriptionTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 10 },
    descriptionText: { fontSize: 14, color: '#444', lineHeight: 21 },
    seeMoreText: { fontSize: 14, fontWeight: '800', color: '#000', marginTop: 8 },

    // Shop info
    shopInfoSection: { backgroundColor: '#f0f0f0', paddingHorizontal: 20, paddingVertical: 16, marginTop: 8 },
    shopInfoTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 12 },
    shopInfoCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    shopName: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
    shopAddress: { fontSize: 13, color: '#3c8ce7', marginTop: 2 },
    findUsBtn: { alignItems: 'center', gap: 4 },
    findUsText: { fontSize: 12, fontWeight: '600', color: '#e74c3c' },
    distanceBlock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    distanceText: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },

    // More of the shop
    moreSection: { paddingTop: 16, paddingBottom: 10 },
    moreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
    moreTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
    shopLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    shopLinkText: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
    moreScroll: { paddingHorizontal: 16, gap: 12 },
    moreCard: { width: 130, height: 130, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f8f8f8' },
    moreCardImage: { width: '100%', height: '100%' },

    // Go to shop
    goShopWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
    goShopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#2d253b', borderRadius: 14, paddingVertical: 14 },
    goShopBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

    // FAB
    fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2d253b', justifyContent: 'center', alignItems: 'center', shadowColor: '#2d253b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 },

    // ─── Edit Modal ───
    editModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    editModalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
    editModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    editModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2d253b' },
    editLabel: { fontSize: 14, fontWeight: '600', color: '#2d253b', marginBottom: 6, marginTop: 12 },
    editInput: { backgroundColor: '#f2f4f7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#2d253b' },
    editInputMultiline: { minHeight: 90, paddingTop: 12 },

    // Edit images
    editImagesRow: { flexDirection: 'row', marginTop: 4 },
    editImageThumb: { width: 80, height: 80, borderRadius: 12, marginRight: 10, overflow: 'hidden', position: 'relative' },
    editImageThumbImg: { width: '100%', height: '100%' },
    editImageRemoveBtn: { position: 'absolute', top: 2, right: 2, backgroundColor: '#fff', borderRadius: 11 },
    editImageAddBtn: { width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
    editImageAddText: { fontSize: 11, color: '#999', fontWeight: '600', marginTop: 2 },

    // Edit sections
    editSectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    editSectionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f2f4f7', borderWidth: 1.5, borderColor: 'transparent' },
    editSectionChipActive: { backgroundColor: '#2d253b', borderColor: '#2d253b' },
    editSectionChipNew: { borderStyle: 'dashed', borderColor: '#ccc' },
    editSectionChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
    editSectionChipTextActive: { color: '#fff' },

    // Currency chips
    currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 6 },
    currencyChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f2f4f7', borderWidth: 1.5, borderColor: 'transparent' },
    currencyChipSelected: { backgroundColor: '#2d253b', borderColor: '#2d253b' },
    currencyChipText: { fontSize: 13, fontWeight: '800', color: '#2d253b' },
    currencyChipTextSelected: { color: '#fff' },

    // Save button
    editSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d253b', borderRadius: 14, paddingVertical: 14, marginTop: 12, gap: 8 },
    editSaveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
