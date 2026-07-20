import React from 'react';
import { Stack } from 'expo-router';

export default function PreviewSetupLayout() {
    return (
        <Stack initialRouteName="setup/server" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="setup/server" />
        </Stack>
    );
}
