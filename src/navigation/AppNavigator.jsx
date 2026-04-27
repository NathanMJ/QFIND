import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import BrowseScreen from '../screens/BrowseScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ShopScreen from '../screens/ShopScreen';
import ProductScreen from '../screens/ProductScreen';
import ShopsListScreen from '../screens/ShopsListScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MyShopsScreen from '../screens/MyShopsScreen';
import MyShopEditScreen from '../screens/MyShopEditScreen';
import ShopSectionScreen from '../screens/ShopSectionScreen';
import ConfirmShopLocationScreen from '../screens/ConfirmShopLocationScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
    return (
        <Tab.Navigator
            initialRouteName="Browse"
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName;
                    if (route.name === 'Browse') {
                        iconName = focused ? 'compass' : 'compass-outline';
                    } else if (route.name === 'Favorites') {
                        iconName = focused ? 'heart' : 'heart-outline';
                    } else if (route.name === 'Profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    }
                    return <Ionicons name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: '#2d253bff',
                tabBarInactiveTintColor: '#64748B',
                tabBarStyle: {
                    backgroundColor: '#eceff3ff',
                    borderTopWidth: 0,
                    height: 70,
                    paddingBottom: 8,
                    paddingTop: 5,
                    elevation: 0,
                    shadowOpacity: 0,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                },
            })}
        >
            <Tab.Screen name="Browse" component={BrowseScreen} />
            <Tab.Screen name="Favorites" component={FavoritesScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="MainTabs" component={TabNavigator} />
                <Stack.Screen
                    name="ShopScreen"
                    component={ShopScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="ShopSectionScreen"
                    component={ShopSectionScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="ProductScreen"
                    component={ProductScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="ShopsListScreen"
                    component={ShopsListScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="HistoryScreen"
                    component={HistoryScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="SettingsScreen"
                    component={SettingsScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="MyShopsScreen"
                    component={MyShopsScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="MyShopEditScreen"
                    component={MyShopEditScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="ConfirmShopLocationScreen"
                    component={ConfirmShopLocationScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
