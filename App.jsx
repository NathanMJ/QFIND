import React from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { SettingsProvider } from './src/context/SettingsContext';

export default function App() {
  return (
    <SettingsProvider>
      <AppNavigator />
    </SettingsProvider>
  );
}
