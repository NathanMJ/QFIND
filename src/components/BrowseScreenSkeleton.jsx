import React, { useEffect, useRef } from 'react';
import { View, ScrollView, Animated, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const SHOP_CARD_W = 160;
const SHOP_CARD_H = 200;
const COL_GAP = 20;
const H_PAD = 10;

export default function BrowseScreenSkeleton() {
    const pulse = useRef(new Animated.Value(0.42)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 0.9,
                    duration: 700,
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0.42,
                    duration: 700,
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulse]);

    const Bone = ({ style }) => (
        <Animated.View style={[styles.bone, style, { opacity: pulse }]} />
    );

    const colW = (width - H_PAD * 2 - COL_GAP) / 2;

    return (
        <View style={styles.root}>
            <View style={styles.section}>
                <Bone style={styles.titleBar} />
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.shopsRow}
                >
                    {[0, 1, 2, 3, 4].map((i) => (
                        <Bone key={i} style={{ width: SHOP_CARD_W, height: SHOP_CARD_H, borderRadius: 12 }} />
                    ))}
                </ScrollView>
            </View>

            <View style={styles.section}>
                <Bone style={[styles.titleBar, { width: 200 }]} />
                <View style={styles.masonry}>
                    <View style={{ width: colW }}>
                        <Bone style={{ height: 200, borderRadius: 12, marginBottom: 16 }} />
                        <Bone style={{ height: 260, borderRadius: 12, marginBottom: 16 }} />
                        <Bone style={{ height: 180, borderRadius: 12 }} />
                    </View>
                    <View style={{ width: colW }}>
                        <Bone style={{ height: 240, borderRadius: 12, marginBottom: 16 }} />
                        <Bone style={{ height: 190, borderRadius: 12, marginBottom: 16 }} />
                        <Bone style={{ height: 220, borderRadius: 12 }} />
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        paddingTop: 8,
        paddingBottom: 32,
    },
    bone: {
        backgroundColor: '#d8dce3',
    },
    section: {
        marginHorizontal: H_PAD,
        marginBottom: 8,
    },
    titleBar: {
        height: 26,
        width: 180,
        borderRadius: 6,
        marginBottom: 12,
    },
    shopsRow: {
        gap: 8,
        paddingRight: 8,
    },
    masonry: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: COL_GAP,
    },
});
