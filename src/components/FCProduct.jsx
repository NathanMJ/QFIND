import { Ionicons } from '@expo/vector-icons'
import React, { useState, useRef, useEffect } from 'react'
import { View, Text, Image, TouchableOpacity, Animated } from 'react-native'
import { useNavigation } from '@react-navigation/native';
import { isProductFavorite, toggleProductFavorite } from '../lib/favorites';
import { useSettings } from '../context/SettingsContext';

const PRODUCTS = [
    {
        name: 'Iphone 17 Pro Max',
        rating: 4.8,
        price: '899 $',
        old_price: '1329 $',
        store_infos: 'Apple Store',
        store_address: 'Shay St 39, Tel Aviv-Yafo',
        img: require('../../assets/iphone.jpeg'),
        distance: '255 m',
        inStock: true,
        screenSize: "6,9'",
        description: `Design & Display
• 6.9-inch Super Retina XDR display with ProMotion 2.0 technology (ultra-smooth refresh rate from 1 to 120Hz).
• Under the screen: Full Face ID integration under the panel, reducing the Dynamic Island to a simple circular notch (or an even more discreet "pill").
• Chassis: New Grade 5 polished Titanium alloy, lighter and scratch-resistant.

New: Capacitive buttons with haptic feedback (no more physical moving buttons).

Performance (The powerhouse)
• A19 Pro chip: 2nm process for record energy efficiency and doubled computing power for AI.
• Memory: 12 GB of RAM minimum to support the new Apple Intelligence 2.0 features locally (no cloud).`,
    },
    {
        name: 'Nike Air Max 90',
        rating: 4.6,
        price: '129 $',
        old_price: '179 $',
        store_infos: 'Foot Locker',
        store_address: 'Shay Agnon St, Ashkelon',
        img: require('../../assets/sneakers.jpeg'),
        distance: '1.2 km',
        inStock: true,
        screenSize: null,
        description: `Design & Comfort
• Breathable mesh upper with synthetic leather overlays for a retro-modern look.
• Visible Air unit in the heel for exceptional cushioning.
• Waffle-pattern rubber outsole for optimal grip.

Available in multiple seasonal colorways.`,
    },
]

export default function FCProduct({ initialFavorite = false, index = 0, product: productProp, onMeasured }) {

    const navigation = useNavigation();
    const { formatDistance, parseDistanceLabelToMeters } = useSettings();
    const product = productProp || PRODUCTS[index % PRODUCTS.length]
    const productId = product?.id || product?.row?.id || null

    const [favoriteLogo, setFavoriteLogo] = useState(initialFavorite)
    const [imgAspectRatio, setImgAspectRatio] = useState(0.7)
    const scaleAnim = useRef(new Animated.Value(1)).current

    // Resolve the real aspect ratio of the product image
    useEffect(() => {
        if (!product.img) return;
        // Local image (require())
        if (typeof product.img === 'number') {
            const asset = Image.resolveAssetSource(product.img);
            if (asset && asset.width && asset.height) {
                setImgAspectRatio(asset.width / asset.height);
            }
        }
        // Remote image (URI string or { uri: ... })
        else {
            const uri = typeof product.img === 'string' ? product.img : product.img.uri;
            if (uri) {
                Image.getSize(uri, (w, h) => {
                    if (w && h) setImgAspectRatio(w / h);
                });
            }
        }
    }, [product.img]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const fav = await isProductFavorite(productId);
                if (!cancelled) setFavoriteLogo(Boolean(fav));
            } catch {
                // keep initial
            }
        })();
        return () => { cancelled = true; };
    }, [productId]);

    const toggleProductToFavorite = () => {
        if (!favoriteLogo) {
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 1.35, useNativeDriver: true, speed: 50, bounciness: 12, }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10, }),
            ]).start()
        }
        else {
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 0.65, useNativeDriver: true, speed: 1200, bounciness: 50, }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 200, bounciness: 0, }),
            ]).start()
        }

        ; (async () => {
            try {
                const imageUrl =
                    typeof product?.img === 'string'
                        ? product.img
                        : product?.img?.uri || null;

                const snapshot = {
                    id: productId,
                    name: product?.name,
                    price: product?.price,
                    discountPrice: product?.old_price || product?.discountPrice || null,
                    description: product?.description || '',
                    store_infos: product?.store_infos || '',
                    store_address: product?.store_address || '',
                    distance: product?.distance || '',
                    distanceM: product?.distanceM ?? null,
                    inStock: product?.inStock !== false,
                    imageUrl,
                };

                const next = await toggleProductFavorite({ id: productId, product: snapshot });
                setFavoriteLogo(Boolean(next));
            } catch (e) {
                console.error('[FCProduct] toggle favorite failed', e);
            }
        })();
    }

    const handleProductPress = () => {
        navigation.navigate('ProductScreen', { product });
    };

    return (
        <View
            onLayout={(e) => {
                try {
                    const h = e?.nativeEvent?.layout?.height;
                    if (typeof onMeasured === 'function') onMeasured(productId, h);
                } catch {
                    // ignore measurement errors
                }
            }}
            style={{ position: 'relative', width: '100%', marginBottom: 20 }}
        >
            {/* Main Product Card */}
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleProductPress}
                style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 12,
                    backgroundColor: 'white',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                }}>

                <Image
                    source={product.img}
                    style={{
                        width: '100%',
                        height: undefined,
                        aspectRatio: imgAspectRatio,
                    }}
                    resizeMode="contain"
                />

                {/* Product info */}
                <View style={{ padding: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#09262a', flex: 1 }}>
                            {product.name}
                        </Text>
                        <View style={{ alignItems: 'flex-end' }}>
                            {product.old_price ? (
                                <Text style={{ color: 'red', fontSize: 12, textDecorationLine: 'line-through' }}>
                                    {product.old_price}
                                </Text>
                            ) : null}
                            <Text style={{ fontWeight: 'bold', color: '#09262a', fontSize: 18 }}>
                                {product.price}
                            </Text>
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="location-sharp" size={14} color="#666" />
                    <Text style={{ color: '#666', fontSize: 14 }}>
                        {product?.distanceM != null
                            ? formatDistance(product.distanceM)
                            : parseDistanceLabelToMeters(product?.distance) != null
                                ? formatDistance(parseDistanceLabelToMeters(product.distance))
                                : product.distance}
                    </Text>
                    </View>
                </View>

            </TouchableOpacity>

            {/* Favorite button */}
            <TouchableOpacity onPress={toggleProductToFavorite} activeOpacity={1} style={{
                position: 'absolute', top: 10, right: 10, zIndex: 10,
                padding: 5, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 20
            }}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <Ionicons name={`${favoriteLogo ? 'heart' : 'heart-outline'}`} size={24} color={`${favoriteLogo ? '#1ba5b8ff' : '#09262a'}`} />
                </Animated.View>
            </TouchableOpacity>
        </View >
    )
}