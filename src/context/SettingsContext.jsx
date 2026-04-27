import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Available languages
export const LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇬🇧', available: true },
    { code: 'fr', label: 'Français', flag: '🇫🇷', available: false },
    { code: 'he', label: 'עברית', flag: '🇮🇱', available: false },
    { code: 'ru', label: 'Русский', flag: '🇷🇺', available: false },
];

// Distance units
export const DISTANCE_UNITS = [
    { code: 'km', label: 'Kilometers (km)', short: 'km' },
    { code: 'mi', label: 'Miles (mi)', short: 'mi' },
];

// Currencies
export const CURRENCIES = [
    { code: 'ILS', label: 'Israeli Shekel', symbol: '₪', flag: '🇮🇱' },
    { code: 'EUR', label: 'Euro', symbol: '€', flag: '🇪🇺' },
    { code: 'USD', label: 'US Dollar', symbol: '$', flag: '🇺🇸' },
    { code: 'GBP', label: 'British Pound', symbol: '£', flag: '🇬🇧' },
];

const SettingsContext = createContext();

const STORAGE_KEYS = {
    language: 'qfind.settings.language',
    distanceUnit: 'qfind.settings.distanceUnit',
    currency: 'qfind.settings.currency',
};

function safeJsonParse(s) {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function formatDistance(meters, unit) {
    const m = typeof meters === 'string' && meters.trim() !== '' ? Number(meters) : meters;
    if (!Number.isFinite(m) || m == null) return '--';

    if (unit === 'mi') {
        const miles = m / 1609.344;
        // Always show in miles (no meters) to avoid mixed units.
        const rounded =
            miles < 0.1 ? Math.round(miles * 1000) / 1000 :
                miles < 1 ? Math.round(miles * 100) / 100 :
                    miles < 10 ? Math.round(miles * 10) / 10 :
                        Math.round(miles);
        return `${rounded} mi`;
    }

    // Default: kilometers. Always show in km (no meters) to avoid mixed units.
    const km = m / 1000;
    const rounded =
        km < 0.1 ? Math.round(km * 1000) / 1000 :
            km < 1 ? Math.round(km * 100) / 100 :
                km < 10 ? Math.round(km * 10) / 10 :
                    Math.round(km);
    return `${rounded} km`;
}

function parseDistanceLabelToMeters(label) {
    if (label == null) return null;
    const s = String(label).trim().toLowerCase();
    if (!s || s === '--' || s === '-- m') return null;

    // Accept formats like: "150 m", "1.2 km", "0.7mi", "2 miles"
    const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?|m|meters?|metres?)\b/);
    if (!m) return null;
    const raw = Number(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(raw)) return null;
    const unit = m[2];

    if (unit === 'm' || unit.startsWith('meter') || unit.startsWith('metre')) return raw;
    if (unit === 'km' || unit.startsWith('kilo')) return raw * 1000;
    if (unit === 'mi' || unit.startsWith('mile')) return raw * 1609.344;
    return null;
}

export function SettingsProvider({ children }) {
    const [language, setLanguage] = useState('en');
    const [distanceUnit, setDistanceUnit] = useState('km');
    const [currency, setCurrency] = useState('ILS');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const raw = await AsyncStorage.multiGet([
                    STORAGE_KEYS.language,
                    STORAGE_KEYS.distanceUnit,
                    STORAGE_KEYS.currency,
                ]);
                if (cancelled) return;
                const map = new Map(raw);
                const lang = map.get(STORAGE_KEYS.language);
                const dist = map.get(STORAGE_KEYS.distanceUnit);
                const cur = map.get(STORAGE_KEYS.currency);

                if (lang && LANGUAGES.some((l) => l.code === lang)) setLanguage(lang);
                if (dist && DISTANCE_UNITS.some((d) => d.code === dist)) setDistanceUnit(dist);
                if (cur && CURRENCIES.some((c) => c.code === cur)) setCurrency(cur);
            } catch {
                // ignore storage failures
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        AsyncStorage.setItem(STORAGE_KEYS.language, language).catch(() => null);
    }, [language]);

    useEffect(() => {
        AsyncStorage.setItem(STORAGE_KEYS.distanceUnit, distanceUnit).catch(() => null);
    }, [distanceUnit]);

    useEffect(() => {
        AsyncStorage.setItem(STORAGE_KEYS.currency, currency).catch(() => null);
    }, [currency]);

    const getCurrencySymbol = () => {
        return CURRENCIES.find(c => c.code === currency)?.symbol || '₪';
    };

    const getDistanceShort = () => {
        return DISTANCE_UNITS.find(d => d.code === distanceUnit)?.short || 'km';
    };

    const formatDistanceWithUnit = useMemo(() => {
        return (meters) => formatDistance(meters, distanceUnit);
    }, [distanceUnit]);

    return (
        <SettingsContext.Provider
            value={{
                language,
                setLanguage,
                distanceUnit,
                setDistanceUnit,
                currency,
                setCurrency,
                getCurrencySymbol,
                getDistanceShort,
                formatDistance: formatDistanceWithUnit,
                parseDistanceLabelToMeters,
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
