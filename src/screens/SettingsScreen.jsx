import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
    useSettings,
    LANGUAGES,
    DISTANCE_UNITS,
} from '../context/SettingsContext';

function OptionCard({ title, icon, iconColor, children }) {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={[styles.cardIconBox, { backgroundColor: iconColor + '15' }]}>
                    <Ionicons name={icon} size={20} color={iconColor} />
                </View>
                <Text style={styles.cardTitle}>{title}</Text>
            </View>
            <View style={styles.cardBody}>
                {children}
            </View>
        </View>
    );
}

function SelectableOption({ label, sublabel, selected, onPress, disabled, badge }) {
    return (
        <TouchableOpacity
            style={[
                styles.option,
                selected && styles.optionSelected,
                disabled && styles.optionDisabled,
            ]}
            onPress={onPress}
            activeOpacity={0.7}
            disabled={disabled}
        >
            <View style={styles.optionContent}>
                <Text style={[
                    styles.optionLabel,
                    selected && styles.optionLabelSelected,
                    disabled && styles.optionLabelDisabled,
                ]}>
                    {label}
                </Text>
                {sublabel && (
                    <Text style={[
                        styles.optionSublabel,
                        disabled && styles.optionLabelDisabled,
                    ]}>
                        {sublabel}
                    </Text>
                )}
            </View>
            <View style={styles.optionRight}>
                {badge && (
                    <View style={styles.comingSoonBadge}>
                        <Text style={styles.comingSoonText}>{badge}</Text>
                    </View>
                )}
                {selected && (
                    <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                )}
            </View>
        </TouchableOpacity>
    );
}

export default function SettingsScreen() {
    const navigation = useNavigation();
    const {
        language,
        setLanguage,
        distanceUnit,
        setDistanceUnit,
    } = useSettings();

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
                <Text style={styles.headerTitle}>Settings</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Language */}
                <OptionCard title="Language" icon="language-outline" iconColor="#6366F1">
                    {LANGUAGES.map((lang) => (
                        <SelectableOption
                            key={lang.code}
                            label={`${lang.flag}  ${lang.label}`}
                            selected={language === lang.code}
                            onPress={() => setLanguage(lang.code)}
                            disabled={!lang.available}
                            badge={!lang.available ? 'Coming soon' : null}
                        />
                    ))}
                </OptionCard>

                {/* Distance Unit */}
                <OptionCard title="Distance Unit" icon="speedometer-outline" iconColor="#3B82F6">
                    {DISTANCE_UNITS.map((unit) => (
                        <SelectableOption
                            key={unit.code}
                            label={unit.label}
                            selected={distanceUnit === unit.code}
                            onPress={() => setDistanceUnit(unit.code)}
                        />
                    ))}
                </OptionCard>

                <View style={{ height: 40 }} />
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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        gap: 16,
    },

    // Card
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 10,
    },
    cardIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#2d253b',
    },
    cardBody: {
        paddingHorizontal: 12,
        paddingBottom: 12,
        gap: 6,
    },

    // Option
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: '#f8f9fa',
    },
    optionSelected: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1.5,
        borderColor: '#10B98130',
    },
    optionDisabled: {
        opacity: 0.55,
    },
    optionContent: {
        flex: 1,
        gap: 2,
    },
    optionLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333',
    },
    optionLabelSelected: {
        color: '#059669',
    },
    optionLabelDisabled: {
        color: '#999',
    },
    optionSublabel: {
        fontSize: 13,
        color: '#888',
        fontWeight: '500',
    },
    optionRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    comingSoonBadge: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    comingSoonText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#9CA3AF',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});
