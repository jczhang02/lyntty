import * as React from 'react';
import { Image } from 'expo-image';
import { AvatarSkia } from './AvatarSkia';
import { AvatarBrutalist } from './AvatarBrutalist';
import { AvatarPet } from './AvatarPet';
import { useSetting } from '@/sync/storage';

interface AvatarProps {
    id: string;
    title?: boolean;
    square?: boolean;
    size?: number;
    monochrome?: boolean;
    /** Retained for old call sites; runtime identity is always normalized to pi. */
    flavor?: string | null;
    imageUrl?: string | null;
    thumbhash?: string | null;
}

export const Avatar = React.memo((props: AvatarProps) => {
    const { size = 48, imageUrl, thumbhash, flavor: _flavor, ...avatarProps } = props;
    const avatarStyle = useSetting('avatarStyle');

    if (imageUrl) {
        return (
            <Image
                source={{ uri: imageUrl, thumbhash: thumbhash || undefined }}
                placeholder={thumbhash ? { thumbhash } : undefined}
                contentFit="cover"
                style={{
                    width: size,
                    height: size,
                    borderRadius: avatarProps.square ? 0 : size / 2,
                }}
            />
        );
    }

    const AvatarComponent = avatarStyle === 'pixelated'
        ? AvatarSkia
        : avatarStyle === 'brutalist'
            ? AvatarBrutalist
            : AvatarPet;
    return <AvatarComponent {...avatarProps} size={size} />;
});
