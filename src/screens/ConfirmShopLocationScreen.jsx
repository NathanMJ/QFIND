import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient';
import { getOrCreateOwnerUuid } from '../lib/ownerUuid';

const DEFAULT_COORDS = { latitude: 31.6688, longitude: 34.5718 };

function buildExternalMapsUrl({ latitude, longitude, label }) {
  const q = encodeURIComponent(label ? `${label} (${latitude},${longitude})` : `${latitude},${longitude}`);
  if (Platform.OS === 'ios') return `maps:0,0?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export default function ConfirmShopLocationScreen({ route, navigation }) {
  const draft = route?.params?.draftShop ?? {};

  const shopName = String(draft?.name ?? '').trim();
  const shopAddress = String(draft?.address ?? '').trim();
  const betaAccessCode = String(draft?.betaAccessCode ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState(DEFAULT_COORDS);

  const region = useMemo(() => ({
    latitude: coords.latitude,
    longitude: coords.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  }), [coords.latitude, coords.longitude]);

  const markerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1) Try geocode address if present
        if (shopAddress) {
          const results = await Location.geocodeAsync(shopAddress);
          if (!cancelled && results?.[0]) {
            setCoords({ latitude: results[0].latitude, longitude: results[0].longitude });
            return;
          }
        }

        // 2) Fallback to current GPS
        const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
        if (!enabled) throw new Error('location_services_disabled');

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('location_permission_denied');

        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled && pos?.coords) {
          setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          return;
        }
      } catch (e) {
        // keep DEFAULT_COORDS
        console.warn('[ConfirmShopLocationScreen] resolve coords failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopAddress]);

  const openExternalMaps = async () => {
    const url = buildExternalMapsUrl({ ...coords, label: shopName || shopAddress || 'Shop' });
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Unable to open Maps.');
    }
  };

  const confirmAndCreate = async () => {
    if (!shopName) {
      Alert.alert('Error', 'Please enter a shop name.');
      return;
    }
    if (!betaAccessCode) {
      Alert.alert('Error', 'Missing beta access code. Go back and verify your code again.');
      return;
    }
    setSaving(true);
    try {
      const ownerUuid = await getOrCreateOwnerUuid();
      const category =
        Array.isArray(draft?.categories) && draft.categories.length > 0
          ? String(draft.categories[0])
          : (draft?.category ? String(draft.category) : null);

      const { data, error } = await supabase.rpc('create_shop', {
        p_owner: ownerUuid,
        p_name: shopName,
        p_lat: coords.latitude,
        p_lng: coords.longitude,
        p_beta_code: betaAccessCode,
        p_address: shopAddress || null,
        p_category: category,
        p_phone: draft?.phone ? String(draft.phone) : null,
        p_open_time: draft?.openTime ? String(draft.openTime) : null,
        p_close_time: draft?.closeTime ? String(draft.closeTime) : null,
        p_logo_url: null,
        p_cover_url: null,
      });
      if (error) throw error;

      // return to MyShopsScreen; it will refetch on focus
      navigation.goBack();
      if (data?.id) {
        // optional success hint
        // (no toast lib; keep quiet)
      }
    } catch (e) {
      console.error('[ConfirmShopLocationScreen] create_shop failed', e);
      const msg = [e?.message, e?.details, e?.hint].filter(Boolean).join(' ');
      const codeExhausted =
        msg.includes('invalid_or_exhausted_beta_code') ||
        msg.includes('P0001');
      Alert.alert(
        'Error',
        codeExhausted
          ? 'This access code is invalid or has no uses left. Ask the QFind team for a new code.'
          : 'Failed to create the shop. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#2d253b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm location</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.shopName} numberOfLines={1}>{shopName || 'New shop'}</Text>
        {shopAddress ? <Text style={styles.shopAddress} numberOfLines={2}>{shopAddress}</Text> : null}
      </View>

      <View style={styles.mapWrap}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2d253b" />
            <Text style={styles.loadingText}>Loading map…</Text>
          </View>
        ) : (
          <MapView style={StyleSheet.absoluteFill} initialRegion={region}>
            <Marker
              ref={markerRef}
              coordinate={coords}
              draggable
              onDragEnd={(e) => {
                const c = e?.nativeEvent?.coordinate;
                if (c?.latitude != null && c?.longitude != null) setCoords(c);
              }}
              title={shopName || 'Shop'}
              description="Drag to adjust"
            />
          </MapView>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8} onPress={openExternalMaps}>
          <Ionicons name="map-outline" size={18} color="#2d253b" />
          <Text style={styles.secondaryBtnText}>Open in Maps</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          activeOpacity={0.85}
          onPress={confirmAndCreate}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
          )}
          <Text style={styles.primaryBtnText}>Confirm & Create</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f7' },
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#2d253b' },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#e8ebf0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBox: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  shopName: { fontSize: 20, fontWeight: '800', color: '#2d253b' },
  shopAddress: { marginTop: 4, color: '#6b7280', fontSize: 13, fontWeight: '600' },
  mapWrap: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#e8ebf0',
  },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: '#2d253b', fontWeight: '700' },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 10,
  },
  secondaryBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8ebf0',
    borderRadius: 14,
    paddingVertical: 14,
  },
  secondaryBtnText: { color: '#2d253b', fontWeight: '800' },
  primaryBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2d253b',
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
});

