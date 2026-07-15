import * as React from 'react';
import { Platform } from 'react-native';
import { Session } from '@/sync/storageTypes';

export interface SessionActionsNativeMenuProps {
    children: React.ReactNode;
    onAfterArchive?: () => void;
    onAfterDelete?: () => void;
    session: Session;
}

const SessionActionsNativeMenuImpl = Platform.select<React.ComponentType<SessionActionsNativeMenuProps>>({
    ios: require('./SessionActionsNativeMenu.ios').SessionActionsNativeMenu,
    android: require('./SessionActionsNativeMenu.android').SessionActionsNativeMenu,
    default: require('./SessionActionsNativeMenu.android').SessionActionsNativeMenu,
}) ?? require('./SessionActionsNativeMenu.android').SessionActionsNativeMenu;

export function SessionActionsNativeMenu(props: SessionActionsNativeMenuProps) {
    return <SessionActionsNativeMenuImpl {...props} />;
}
