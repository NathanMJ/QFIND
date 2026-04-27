import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Modal,
    Animated,
    Easing,
    Dimensions,
    StyleSheet,
    PanResponder,
    TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const CATEGORIES = [
    { id: '1', name: 'Restaurants', icon: 'restaurant-outline', color: '#FF6B6B' },
    { id: '2', name: 'Cafes', icon: 'cafe-outline', color: '#4ECDC4' },
    { id: '3', name: 'Shopping', icon: 'bag-outline', color: '#A78BFA' },
    { id: '4', name: 'Fun', icon: 'game-controller-outline', color: '#F59E0B' },
    { id: '5', name: 'Services', icon: 'construct-outline', color: '#3B82F6' },
    { id: '6', name: 'Health', icon: 'fitness-outline', color: '#EC4899' },
    { id: '7', name: 'Beauty', icon: 'sparkles-outline', color: '#F472B6' },
    { id: '8', name: 'Tech', icon: 'laptop-outline', color: '#6366F1' },
];

const DISTANCE_OPTIONS = [
    { label: '500 m', value: 500 },
    { label: '1 km', value: 1000 },
    { label: '2 km', value: 2000 },
    { label: '5 km', value: 5000 },
    { label: '10 km', value: 10000 },
    { label: '20 km', value: 20000 },
];

const SLIDER_MAX = 1000;
const THUMB_SIZE = 28;
const TRACK_HEIGHT = 6;
const PRICE_TICKS = [0, 50, 100, 200, 500, 1000];

// Custom dual-thumb price range slider with editable inputs
// Exposes getValues() via ref — parent reads values on Apply
const PriceRangeSlider = forwardRef(function PriceRangeSlider({ initialMin, initialMax }, ref) {
    const trackWidth = useRef(0);
    const minPos = useRef(new Animated.Value(0)).current;
    const maxPos = useRef(new Animated.Value(0)).current;
    const currentMin = useRef(initialMin || 0);
    const currentMax = useRef(initialMax != null ? Math.min(initialMax, SLIDER_MAX) : SLIDER_MAX);
    const startMinOffset = useRef(0);
    const startMaxOffset = useRef(0);

    const [minInputText, setMinInputText] = useState(
        initialMin != null ? String(initialMin) : '0'
    );
    const [maxInputText, setMaxInputText] = useState(
        initialMax != null ? String(initialMax) : ''
    );
    const [isNoLimit, setIsNoLimit] = useState(initialMax == null);

    // Keep state setter refs so PanResponder closures can access them
    const setMinInputTextRef = useRef(setMinInputText);
    setMinInputTextRef.current = setMinInputText;
    const setMaxInputTextRef = useRef(setMaxInputText);
    setMaxInputTextRef.current = setMaxInputText;
    const setIsNoLimitRef = useRef(setIsNoLimit);
    setIsNoLimitRef.current = setIsNoLimit;

    // Expose getValues to parent via ref
    useImperativeHandle(ref, () => ({
        getValues: () => {
            const min = currentMin.current;
            const max = currentMax.current >= SLIDER_MAX ? null : currentMax.current;
            return { min, max };
        },
    }));

    const valueToPosition = useCallback((val) => {
        if (trackWidth.current === 0) return 0;
        const clamped = Math.max(0, Math.min(SLIDER_MAX, val));
        return (clamped / SLIDER_MAX) * trackWidth.current;
    }, []);

    const positionToValue = useCallback((pos) => {
        if (trackWidth.current === 0) return 0;
        const raw = (pos / trackWidth.current) * SLIDER_MAX;
        return Math.round(Math.max(0, Math.min(SLIDER_MAX, raw)));
    }, []);

    const updatePositions = useCallback(() => {
        minPos.setValue(valueToPosition(currentMin.current));
        maxPos.setValue(valueToPosition(currentMax.current));
    }, [valueToPosition, minPos, maxPos]);

    const minPan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startMinOffset.current = valueToPosition(currentMin.current);
            },
            onPanResponderMove: (_, gs) => {
                let newPos = Math.max(0, startMinOffset.current + gs.dx);
                const maxAllowed = valueToPosition(currentMax.current);
                newPos = Math.min(newPos, maxAllowed);
                minPos.setValue(newPos);
                // Update input text in real-time
                const liveVal = positionToValue(newPos);
                currentMin.current = liveVal;
                setMinInputTextRef.current(String(liveVal));
            },
            onPanResponderRelease: (_, gs) => {
                let newPos = Math.max(0, startMinOffset.current + gs.dx);
                const maxAllowed = valueToPosition(currentMax.current);
                newPos = Math.min(newPos, maxAllowed);
                const val = positionToValue(newPos);
                const finalVal = Math.min(val, currentMax.current);
                currentMin.current = finalVal;
                Animated.spring(minPos, {
                    toValue: valueToPosition(finalVal),
                    useNativeDriver: false,
                    friction: 7,
                    tension: 100,
                }).start();
                setMinInputTextRef.current(String(finalVal));
            },
        })
    ).current;

    const maxPan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startMaxOffset.current = valueToPosition(currentMax.current);
            },
            onPanResponderMove: (_, gs) => {
                let newPos = Math.min(trackWidth.current, startMaxOffset.current + gs.dx);
                const minAllowed = valueToPosition(currentMin.current);
                newPos = Math.max(newPos, minAllowed);
                maxPos.setValue(newPos);
                // Update input text in real-time
                const liveVal = positionToValue(newPos);
                currentMax.current = liveVal;
                const noLimit = liveVal >= SLIDER_MAX;
                setIsNoLimitRef.current(noLimit);
                setMaxInputTextRef.current(noLimit ? '' : String(liveVal));
            },
            onPanResponderRelease: (_, gs) => {
                let newPos = Math.min(trackWidth.current, startMaxOffset.current + gs.dx);
                const minAllowed = valueToPosition(currentMin.current);
                newPos = Math.max(newPos, minAllowed);
                const val = positionToValue(newPos);
                const finalVal = Math.max(val, currentMin.current);
                currentMax.current = finalVal;
                Animated.spring(maxPos, {
                    toValue: valueToPosition(finalVal),
                    useNativeDriver: false,
                    friction: 7,
                    tension: 100,
                }).start();
                const noLimit = finalVal >= SLIDER_MAX;
                setIsNoLimitRef.current(noLimit);
                setMaxInputTextRef.current(noLimit ? '' : String(finalVal));
            },
        })
    ).current;

    const onLayout = useCallback((e) => {
        const w = e.nativeEvent.layout.width;
        trackWidth.current = w;
        updatePositions();
    }, [updatePositions]);

    const handleMinChange = (text) => {
        setMinInputText(text);
        const parsed = parseInt(text, 10);
        if (!isNaN(parsed) && parsed >= 0) {
            const clamped = Math.min(parsed, currentMax.current);
            currentMin.current = clamped;
            updatePositions();
        } else if (text === '') {
            currentMin.current = 0;
            updatePositions();
        }
    };

    const handleMinBlur = () => {
        // Clean up the value on blur
        const parsed = parseInt(minInputText, 10);
        if (isNaN(parsed) || parsed < 0) {
            currentMin.current = 0;
            setMinInputText('0');
        } else {
            const clamped = Math.min(parsed, currentMax.current);
            currentMin.current = clamped;
            setMinInputText(String(clamped));
        }
        updatePositions();
    };

    const handleMaxChange = (text) => {
        setMaxInputText(text);
        if (text.trim() === '') {
            setIsNoLimit(true);
            currentMax.current = SLIDER_MAX;
            updatePositions();
            return;
        }
        setIsNoLimit(false);
        const parsed = parseInt(text, 10);
        if (!isNaN(parsed) && parsed >= 0) {
            const clamped = Math.max(parsed, currentMin.current);
            currentMax.current = Math.min(clamped, SLIDER_MAX);
            setIsNoLimit(currentMax.current >= SLIDER_MAX);
            updatePositions();
        }
    };

    const handleMaxBlur = () => {
        if (maxInputText.trim() === '') {
            currentMax.current = SLIDER_MAX;
            setIsNoLimit(true);
            updatePositions();
            return;
        }
        const parsed = parseInt(maxInputText, 10);
        if (isNaN(parsed) || parsed < 0) {
            currentMax.current = SLIDER_MAX;
            setMaxInputText('');
            setIsNoLimit(true);
        } else {
            const clamped = Math.max(parsed, currentMin.current);
            currentMax.current = Math.min(clamped, SLIDER_MAX);
            setMaxInputText(String(currentMax.current));
            setIsNoLimit(currentMax.current >= SLIDER_MAX);
        }
        updatePositions();
    };

    const fillLeft = minPos;
    const fillWidth = Animated.subtract(maxPos, minPos);

    return (
        <View style={rangeStyles.container}>
            {/* Input boxes */}
            <View style={rangeStyles.inputsRow}>
                {/* Min input */}
                <View style={rangeStyles.inputBox}>
                    <Text style={rangeStyles.inputLabel}>Min</Text>
                    <View style={rangeStyles.inputWrapper}>
                        <Text style={rangeStyles.currencySymbol}>₪</Text>
                        <TextInput
                            style={rangeStyles.input}
                            value={minInputText}
                            onChangeText={handleMinChange}
                            onEndEditing={handleMinBlur}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#bbb"
                            selectTextOnFocus
                        />
                    </View>
                </View>

                {/* Separator */}
                <View style={rangeStyles.inputSeparator}>
                    <View style={rangeStyles.separatorLine} />
                </View>

                {/* Max input */}
                <View style={rangeStyles.inputBox}>
                    <Text style={rangeStyles.inputLabel}>Max</Text>
                    <View style={[rangeStyles.inputWrapper, isNoLimit && rangeStyles.inputWrapperNoLimit]}>
                        <Text style={rangeStyles.currencySymbol}>₪</Text>
                        <TextInput
                            style={rangeStyles.input}
                            value={isNoLimit ? '' : maxInputText}
                            onChangeText={handleMaxChange}
                            onEndEditing={handleMaxBlur}
                            keyboardType="numeric"
                            placeholder="No limit"
                            placeholderTextColor="#10B981"
                            selectTextOnFocus
                        />
                    </View>
                </View>
            </View>

            {/* Slider track */}
            <View style={rangeStyles.trackOuter} onLayout={onLayout}>
                <View style={rangeStyles.trackBg} />

                {/* Active fill */}
                <Animated.View
                    style={[
                        rangeStyles.trackFill,
                        { left: fillLeft, width: fillWidth },
                    ]}
                />

                {/* Tick marks */}
                {PRICE_TICKS.map((tick) => {
                    const pct = (tick / SLIDER_MAX) * 100;
                    return (
                        <View
                            key={tick}
                            style={[
                                rangeStyles.tickMark,
                                { left: `${pct}%` },
                            ]}
                        />
                    );
                })}

                {/* Min thumb */}
                <Animated.View
                    style={[
                        rangeStyles.thumb,
                        rangeStyles.thumbMin,
                        { transform: [{ translateX: Animated.subtract(minPos, THUMB_SIZE / 2) }] },
                    ]}
                    {...minPan.panHandlers}
                >
                    <View style={rangeStyles.thumbInner} />
                </Animated.View>

                {/* Max thumb */}
                <Animated.View
                    style={[
                        rangeStyles.thumb,
                        rangeStyles.thumbMax,
                        { transform: [{ translateX: Animated.subtract(maxPos, THUMB_SIZE / 2) }] },
                    ]}
                    {...maxPan.panHandlers}
                >
                    <View style={rangeStyles.thumbInner}>
                        {isNoLimit && (
                            <Ionicons name="infinite-outline" size={10} color="#fff" />
                        )}
                    </View>
                </Animated.View>
            </View>

            {/* Tick labels */}
            <View style={rangeStyles.tickLabelsRow}>
                {PRICE_TICKS.map((tick) => (
                    <Text key={tick} style={rangeStyles.tickLabel}>
                        {tick === SLIDER_MAX ? '∞' : `₪${tick}`}
                    </Text>
                ))}
            </View>

            {/* No limit hint */}
            {isNoLimit && (
                <View style={rangeStyles.noLimitBadge}>
                    <Ionicons name="infinite-outline" size={16} color="#10B981" />
                    <Text style={rangeStyles.noLimitText}>No maximum limit</Text>
                </View>
            )}
        </View>
    );
});

export default function FCFilterBar({ filters, onFiltersChange }) {
    const [activeModal, setActiveModal] = useState(null);
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;
    const priceSliderRef = useRef(null);
    const [draft, setDraft] = useState(filters);

    const openModal = (modalName) => {
        // Snapshot current applied filters as a draft when opening.
        // If the user closes without Apply, we discard draft changes.
        setDraft(filters);
        setActiveModal(modalName);
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
            }),
            Animated.timing(backdropAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const closeModal = () => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: SCREEN_HEIGHT,
                duration: 250,
                useNativeDriver: true,
                easing: Easing.in(Easing.cubic),
            }),
            Animated.timing(backdropAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => setActiveModal(null));
    };

    const applyAndCloseModal = () => {
        let next = { ...draft };
        // Read price values only when Apply is clicked (slider is stateful).
        if (activeModal === 'price' && priceSliderRef.current) {
            const { min, max } = priceSliderRef.current.getValues();
            next = {
                ...next,
                priceMin: min > 0 ? min : null,
                priceMax: max,
            };
        }
        onFiltersChange(next);
        closeModal();
    };

    const updateFilter = (key, value) => {
        setDraft((prev) => ({ ...prev, [key]: value }));
    };

    const toggleCategory = (cat) => {
        const current = draft.categories || [];
        const exists = current.find((c) => c.id === cat.id);
        if (exists) {
            updateFilter('categories', current.filter((c) => c.id !== cat.id));
        } else {
            updateFilter('categories', [...current, cat]);
        }
    };

    const clearAllFilters = () => {
        onFiltersChange({
            categories: [],
            distance: null,
            priceMin: null,
            priceMax: null,
            promoOnly: false,
        });
    };

    // Count active filters
    const activeCount = [
        (filters.categories || []).length > 0,
        filters.distance != null,
        filters.priceMin != null || filters.priceMax != null,
        filters.promoOnly === true,
    ].filter(Boolean).length;

    // Build active chips for display
    const activeChips = [];

    if (filters.categories?.length > 0) {
        filters.categories.forEach((cat) => {
            activeChips.push({
                key: `cat-${cat.id}`,
                modalKey: 'categories',
                label: cat.name,
                icon: cat.icon,
                color: cat.color,
                onRemove: () => {
                    const nextCats = (filters.categories || []).filter((c) => c.id !== cat.id);
                    onFiltersChange({ ...filters, categories: nextCats });
                },
            });
        });
    }
    if (filters.distance != null) {
        const distLabel = DISTANCE_OPTIONS.find(d => d.value === filters.distance)?.label || `${filters.distance}m`;
        activeChips.push({
            key: 'distance',
            modalKey: 'distance',
            label: `≤ ${distLabel}`,
            icon: 'navigate-outline',
            color: '#3B82F6',
            onRemove: () => onFiltersChange({ ...filters, distance: null }),
        });
    }
    if (filters.priceMin != null || filters.priceMax != null) {
        const min = filters.priceMin || 0;
        const max = filters.priceMax;
        let label;
        if (max == null) {
            label = min > 0 ? `₪${min}+` : 'Any price';
        } else if (min === max) {
            label = `₪${min}`;
        } else {
            label = `₪${min} - ₪${max}`;
        }
        activeChips.push({
            key: 'price',
            modalKey: 'price',
            label: label,
            icon: 'cash-outline',
            color: '#10B981',
            onRemove: () => { onFiltersChange({ ...filters, priceMin: null, priceMax: null }); },
        });
    }
    if (filters.promoOnly) {
        activeChips.push({
            key: 'promo',
            modalKey: 'promo',
            label: 'Promos',
            icon: 'pricetag-outline',
            color: '#EF4444',
            onRemove: () => onFiltersChange({ ...filters, promoOnly: false }),
        });
    }

    const filterButtons = [
        { key: 'categories', label: 'Categories', icon: 'grid-outline', active: (filters.categories || []).length > 0 },
        { key: 'distance', label: 'Distance', icon: 'navigate-outline', active: filters.distance != null },
        { key: 'price', label: 'Price', icon: 'cash-outline', active: filters.priceMin != null || filters.priceMax != null },
        { key: 'promo', label: 'Promos', icon: 'pricetag-outline', active: filters.promoOnly === true },
    ];

    // Keep draft in sync if parent filters change while modal is closed.
    useEffect(() => {
        if (activeModal == null) setDraft(filters);
    }, [activeModal, filters]);

    return (
        <>
            {/* Filter Bar */}
            <View style={styles.filterBar}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterBarContent}
                >

                    {filterButtons.map((btn) => (
                        <TouchableOpacity
                            key={btn.key}
                            style={[styles.filterPill, btn.active && styles.filterPillActive]}
                            onPress={() => openModal(btn.key)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={btn.icon}
                                size={16}
                                color={btn.active ? '#fff' : '#555'}
                            />
                            <Text style={[styles.filterPillText, btn.active && styles.filterPillTextActive]}>
                                {btn.label}
                            </Text>
                            <Ionicons
                                name="chevron-down"
                                size={14}
                                color={btn.active ? '#fff' : '#999'}
                            />
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Active Chips */}
            {activeChips.length > 0 && (
                <View style={styles.chipsContainer}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipsContent}
                    >
                        {activeChips.map((chip) => (
                            <View key={chip.key} style={[styles.chip, { backgroundColor: chip.color + '18', borderColor: chip.color + '50' }]}>
                                <TouchableOpacity
                                    style={styles.chipTouchable}
                                    onPress={() => openModal(chip.modalKey)}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name={chip.icon} size={14} color={chip.color} />
                                    <Text style={[styles.chipText, { color: chip.color }]}>{chip.label}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={chip.onRemove}
                                    activeOpacity={0.6}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Ionicons name="close-circle" size={16} color={chip.color} />
                                </TouchableOpacity>
                            </View>
                        ))}
                        <TouchableOpacity
                            onPress={clearAllFilters}
                            activeOpacity={0.7}
                            style={styles.clearAllBtn}
                        >
                            <Text style={styles.clearAllText}>Clear all</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            {/* Filter Modal */}
            <Modal visible={activeModal !== null} transparent animationType="none">
                <View style={styles.modalWrapper}>
                    {/* Backdrop */}
                    <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
                        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
                    </Animated.View>

                    {/* Sheet */}
                    <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                        {/* Handle */}
                        <View style={styles.sheetHandle}>
                            <View style={styles.sheetHandleBar} />
                        </View>

                        {/* Header */}
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>
                                {activeModal === 'categories' && 'Categories'}
                                {activeModal === 'distance' && 'Distance'}
                                {activeModal === 'price' && 'Price Range'}
                                {activeModal === 'promo' && 'Promotions'}
                            </Text>
                            <TouchableOpacity onPress={closeModal} activeOpacity={0.7}>
                                <Ionicons name="close-circle" size={28} color="#ccc" />
                            </TouchableOpacity>
                        </View>

                        {/* CATEGORIES */}
                        {activeModal === 'categories' && (
                            <View style={styles.sheetBody}>
                                <View style={styles.categoriesGrid}>
                                    {CATEGORIES.map((cat) => {
                                        const isSelected = (draft.categories || []).find(c => c.id === cat.id);
                                        return (
                                            <TouchableOpacity
                                                key={cat.id}
                                                style={[
                                                    styles.categoryOption,
                                                    isSelected && { backgroundColor: cat.color + '20', borderColor: cat.color },
                                                ]}
                                                onPress={() => toggleCategory(cat)}
                                                activeOpacity={0.7}
                                            >
                                                <View style={[
                                                    styles.categoryOptionIcon,
                                                    { backgroundColor: cat.color + '18' },
                                                    isSelected && { backgroundColor: cat.color + '30' },
                                                ]}>
                                                    <Ionicons name={cat.icon} size={22} color={cat.color} />
                                                </View>
                                                <Text style={[
                                                    styles.categoryOptionText,
                                                    isSelected && { color: cat.color, fontWeight: '700' },
                                                ]}>{cat.name}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* DISTANCE */}
                        {activeModal === 'distance' && (
                            <View style={styles.sheetBody}>
                                {DISTANCE_OPTIONS.map((opt) => {
                                    const isSelected = draft.distance === opt.value;
                                    return (
                                        <TouchableOpacity
                                            key={opt.value}
                                            style={[styles.listOption, isSelected && styles.listOptionActive]}
                                            onPress={() => updateFilter('distance', isSelected ? null : opt.value)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name="navigate-outline"
                                                size={20}
                                                color={isSelected ? '#3B82F6' : '#999'}
                                            />
                                            <Text style={[styles.listOptionText, isSelected && styles.listOptionTextActive]}>
                                                {opt.label}
                                            </Text>
                                            {isSelected && (
                                                <Ionicons name="checkmark-circle" size={22} color="#3B82F6" />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

                        {/* PRICE */}
                        {activeModal === 'price' && (
                            <View style={styles.sheetBody}>
                                <Text style={styles.priceLabel}>
                                    Drag the handles or type exact values
                                </Text>
                                <PriceRangeSlider
                                    ref={priceSliderRef}
                                    initialMin={draft.priceMin != null ? draft.priceMin : 0}
                                    initialMax={draft.priceMax}
                                />
                            </View>
                        )}

                        {/* PROMO */}
                        {activeModal === 'promo' && (
                            <View style={styles.sheetBody}>
                                <TouchableOpacity
                                    style={[styles.promoToggle, draft.promoOnly && styles.promoToggleActive]}
                                    onPress={() => updateFilter('promoOnly', !draft.promoOnly)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.promoToggleLeft}>
                                        <View style={[styles.promoIcon, draft.promoOnly && styles.promoIconActive]}>
                                            <Ionicons
                                                name="pricetag"
                                                size={24}
                                                color={draft.promoOnly ? '#fff' : '#EF4444'}
                                            />
                                        </View>
                                        <View>
                                            <Text style={styles.promoTitle}>Promotions only</Text>
                                            <Text style={styles.promoSubtitle}>Show items with active discounts</Text>
                                        </View>
                                    </View>
                                    <View style={[styles.toggle, draft.promoOnly && styles.toggleActive]}>
                                        <Animated.View style={[
                                            styles.toggleDot,
                                            draft.promoOnly && styles.toggleDotActive,
                                        ]} />
                                    </View>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Apply button */}
                        <TouchableOpacity
                            style={styles.applyBtn}
                            onPress={applyAndCloseModal}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.applyBtnText}>Apply</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    // Filter Bar
    filterBar: {
        backgroundColor: '#f2f4f7',
        paddingVertical: 8,
        zIndex: 9,
    },
    filterBarContent: {
        paddingHorizontal: 12,
        gap: 8,
        alignItems: 'center',
    },
    filterIconBtn: {
        width: 40,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#e8ebf0',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    filterIconBtnActive: {
        backgroundColor: '#2d253b',
    },
    filterCountBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#EF4444',
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    filterCountText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#fff',
    },
    filterPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#e8ebf0',
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#dde0e5',
    },
    filterPillActive: {
        backgroundColor: '#2d253b',
        borderColor: '#2d253b',
    },
    filterPillText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#555',
    },
    filterPillTextActive: {
        color: '#fff',
    },

    // Chips
    chipsContainer: {
        backgroundColor: '#f2f4f7',
        paddingHorizontal: 12,
        paddingBottom: 8,
    },
    chipsContent: {
        gap: 6,
        alignItems: 'center',
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 16,
        borderWidth: 1,
        gap: 5,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    chipTouchable: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    clearAllBtn: {
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    clearAllText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#EF4444',
        textDecorationLine: 'underline',
    },

    // Modal
    modalWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 30,
        maxHeight: SCREEN_HEIGHT * 0.7,
    },
    sheetHandle: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    sheetHandleBar: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#ddd',
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    sheetTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1a1a1a',
    },
    sheetBody: {
        paddingHorizontal: 20,
    },

    // Categories in modal
    categoriesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    categoryOption: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
        borderWidth: 1.5,
        borderColor: 'transparent',
        width: '47%',
    },
    categoryOptionIcon: {
        width: 38,
        height: 38,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    categoryOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    checkCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Distance list
    listOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 6,
        backgroundColor: '#f8f8f8',
    },
    listOptionActive: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#3B82F6',
    },
    listOptionText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    listOptionTextActive: {
        color: '#3B82F6',
    },

    // Price
    priceLabel: {
        fontSize: 14,
        color: '#888',
        marginBottom: 8,
    },

    // Promo toggle
    promoToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 16,
        backgroundColor: '#f8f8f8',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    promoToggleActive: {
        backgroundColor: '#FEF2F2',
        borderColor: '#EF4444',
    },
    promoToggleLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    promoIcon: {
        width: 46,
        height: 46,
        borderRadius: 14,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    promoIconActive: {
        backgroundColor: '#EF4444',
    },
    promoTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    promoSubtitle: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
    },
    toggle: {
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#ddd',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    toggleActive: {
        backgroundColor: '#EF4444',
    },
    toggleDot: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#fff',
    },
    toggleDotActive: {
        alignSelf: 'flex-end',
    },

    // Show mode
    showOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 8,
        backgroundColor: '#f8f8f8',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    showOptionActive: {
        backgroundColor: '#F3F0FF',
        borderColor: '#8B5CF6',
    },
    showOptionIcon: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: '#eee',
        justifyContent: 'center',
        alignItems: 'center',
    },
    showOptionIconActive: {
        backgroundColor: '#8B5CF6',
    },
    showOptionText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    showOptionTextActive: {
        color: '#8B5CF6',
        fontWeight: '700',
    },

    // Apply
    applyBtn: {
        backgroundColor: '#2d253b',
        marginHorizontal: 20,
        marginTop: 20,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
    },
    applyBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

const rangeStyles = StyleSheet.create({
    container: {
        paddingVertical: 8,
    },
    // Input boxes row
    inputsRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 22,
        gap: 0,
    },
    inputBox: {
        flex: 1,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#999',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
    },
    inputWrapperNoLimit: {
        borderColor: '#10B98150',
        backgroundColor: '#ECFDF5',
    },
    currencySymbol: {
        fontSize: 18,
        fontWeight: '700',
        color: '#10B981',
        marginRight: 4,
    },
    input: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: '#1a1a1a',
        padding: 0,
        minWidth: 40,
    },
    inputSeparator: {
        width: 28,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 20,
    },
    separatorLine: {
        width: 14,
        height: 2,
        backgroundColor: '#ccc',
        borderRadius: 1,
    },
    // Track
    trackOuter: {
        height: THUMB_SIZE + 20,
        justifyContent: 'center',
        marginHorizontal: THUMB_SIZE / 2,
    },
    trackBg: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: TRACK_HEIGHT,
        backgroundColor: '#E5E7EB',
        borderRadius: TRACK_HEIGHT / 2,
    },
    trackFill: {
        position: 'absolute',
        height: TRACK_HEIGHT,
        backgroundColor: '#10B981',
        borderRadius: TRACK_HEIGHT / 2,
    },
    tickMark: {
        position: 'absolute',
        width: 2,
        height: 14,
        backgroundColor: '#D1D5DB',
        borderRadius: 1,
        marginLeft: -1,
        top: (THUMB_SIZE + 20 - 14) / 2,
    },
    thumb: {
        position: 'absolute',
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
        borderWidth: 2.5,
        borderColor: '#10B981',
    },
    thumbMin: {
        zIndex: 10,
    },
    thumbMax: {
        zIndex: 11,
    },
    thumbInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#10B981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Tick labels
    tickLabelsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
        marginHorizontal: THUMB_SIZE / 2,
    },
    tickLabel: {
        fontSize: 10,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    // No limit badge
    noLimitBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 6,
        marginTop: 12,
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#10B98130',
    },
    noLimitText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#10B981',
    },
});
