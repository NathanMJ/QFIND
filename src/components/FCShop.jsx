import { Ionicons } from '@expo/vector-icons';
import React, { useState, useRef } from 'react'
import { View, Text, Image, TouchableOpacity, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isShopFavorite, toggleShopFavorite } from '../lib/favorites';
import { useSettings } from '../context/SettingsContext';

export default function FCShop({ initialFavorite = false, shop }) {

    const navigation = useNavigation();
    const { formatDistance, parseDistanceLabelToMeters } = useSettings();

    const shopData = shop || {
        id: '1',
        title: 'Apple Store',
        adress: 'Shay St. 17',
        rating: 4.8,
        reviews: 234,
        distanceM: 1200,
        distance: '1.2 km',
        isFavorite: initialFavorite
    };

    const [isFavorite, setIsFavorite] = useState(shopData.isFavorite)
    const scaleAnim = useRef(new Animated.Value(1)).current

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const fav = await isShopFavorite(shopData?.id);
                if (!cancelled) setIsFavorite(Boolean(fav));
            } catch {
                // keep initial
            }
        })();
        return () => { cancelled = true; };
    }, [shopData?.id]);

    const toggleShopToFavorite = () => {
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
            ]).start()
        }
        ; (async () => {
            try {
                const snapshot = {
                    id: shopData?.id,
                    title: shopData?.title || shopData?.name || '',
                    adress: shopData?.adress || shopData?.address || '',
                    address: shopData?.address || shopData?.adress || '',
                    distance: shopData?.distance || '',
                    distanceM: shopData?.distanceM ?? null,
                    rating: shopData?.rating,
                    phone: shopData?.phone || '',
                    logoUrl: shopData?.logoUrl || shopData?.logo_url || null,
                    coverUrl: shopData?.coverUrl || shopData?.cover_url || null,
                    latitude: shopData?.latitude,
                    longitude: shopData?.longitude,
                };
                const next = await toggleShopFavorite({ id: shopData?.id, shop: snapshot });
                setIsFavorite(Boolean(next));
            } catch (e) {
                console.error('[FCShop] toggle favorite failed', e);
            }
        })();
    }

    const handleShopPress = () => {
        navigation.navigate('ShopScreen', { shop: shopData });
    };

    const coverUrl =
        shopData?.coverUrl ||
        shopData?.cover_url ||
        shopData?.coverImage ||
        shopData?.cover_image ||
        null;
    const logoUrl =
        shopData?.logoUrl ||
        shopData?.logo_url ||
        shopData?.logoImage ||
        shopData?.logo_image ||
        null;

    const coverSource =
        coverUrl != null && String(coverUrl).trim() !== ''
            ? { uri: String(coverUrl).trim() }
            : null;

    return (

        <TouchableOpacity
            key={shopData.id}
            onPress={handleShopPress}
            activeOpacity={0.85}
            style={{
                margin: 5, width: 160, height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffffff', shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5
            }}>
            <View className="top" style={{ width: '100%', flex: 2, position: 'relative' }}>
                {coverSource ? (
                    <Image
                        source={coverSource}
                        resizeMode="cover"
                        style={{ width: '100%', height: '100%' }}
                    />
                ) : (
                    <View style={{ width: '100%', height: '100%', backgroundColor: '#e8ebf0' }} />
                )}
                <TouchableOpacity onPress={toggleShopToFavorite} activeOpacity={0.7} style={{
                    position: 'absolute', top: 5, right: 5, zIndex: 1, backgroundColor: '#ffffff88', padding: 4, borderRadius: 50, justifyContent: 'center', alignItems: 'center',
                }}>
                    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                        <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={isFavorite ? '#1ba5b8' : '#09262a'} />
                    </Animated.View>
                </TouchableOpacity>
            </View>

            <View className="bottom" style={{ padding: 5, justifyContent: 'space-between', flex: 1, position: 'relative' }}>
                <View className="top">
                    <Text style={{ fontWeight: '600', fontSize: 16, color: '#000709' }}>{shopData.title}</Text>
                    <Text style={{ color: 'gray', fontSize: 12 }}>{shopData.adress}</Text>
                </View>
                <View className="bottom" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="star" size={24} color="#000709" />
                        <Text style={{ fontWeight: 'bold' }}>{shopData.rating}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="walk" size={24} color="#000709" />
                        <Text style={{ fontWeight: 'bold' }}>
                            {shopData?.distanceM != null
                                ? formatDistance(shopData.distanceM)
                                : parseDistanceLabelToMeters(shopData?.distance) != null
                                    ? formatDistance(parseDistanceLabelToMeters(shopData.distance))
                                    : shopData.distance}
                        </Text>
                    </View>

                </View>
            </View>
        </TouchableOpacity>
    )
}
