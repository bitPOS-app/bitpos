import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useColors } from '@/hooks/useColors';

export default function TabLayout() {
  const colors = useColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
          ...(Platform.OS === 'web' ? { height: 84 } : {}),
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Write',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="nfc" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wipe"
        options={{
          title: 'Wipe',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="nfc-off" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
