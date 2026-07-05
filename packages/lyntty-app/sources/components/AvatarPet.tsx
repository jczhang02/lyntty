import * as React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { resolvePetAvatarParts, type PetAvatarParts } from './AvatarPetParts';

type PetAccessory = PetAvatarParts['accessory'];
type PetEyes = PetAvatarParts['eyes'];
type PetSpot = PetAvatarParts['spot'];

interface AvatarPetProps {
    id: string;
    square?: boolean;
    size?: number;
    monochrome?: boolean;
}

const palettes = [
    { bg: '#FFE1EA', fill: '#FF82AA', ink: '#71354E', soft: '#FFF3F7' },
    { bg: '#D8EFFF', fill: '#66A9FF', ink: '#23466C', soft: '#F2FAFF' },
    { bg: '#E0F7D3', fill: '#7AD66F', ink: '#2B6236', soft: '#F7FFF2' },
    { bg: '#FFF1B8', fill: '#FFC95F', ink: '#725216', soft: '#FFF9D8' },
    { bg: '#E6DCFF', fill: '#A28CFF', ink: '#44376C', soft: '#FAF7FF' },
    { bg: '#FFE2C9', fill: '#FF9D6D', ink: '#693E28', soft: '#FFF6EF' },
    { bg: '#D7F7F1', fill: '#5BCDBE', ink: '#205E58', soft: '#F2FFFC' },
];

const monochromePalette = { bg: '#ECEFF3', fill: '#B6BDC8', ink: '#454C59', soft: '#F7F8FA' };

function Background(props: { square?: boolean; color: string }) {
    if (props.square) {
        return <Rect x={0} y={0} width={64} height={64} fill={props.color} />;
    }
    return <Circle cx={32} cy={32} r={32} fill={props.color} />;
}

function Eyes(props: { eyes: PetEyes; ink: string }) {
    if (props.eyes === 'sleep') {
        return (
            <>
                <Path d="M22 32 Q25 34 28 32" stroke={props.ink} strokeWidth={2.4} strokeLinecap="round" fill="none" />
                <Path d="M36 32 Q39 34 42 32" stroke={props.ink} strokeWidth={2.4} strokeLinecap="round" fill="none" />
            </>
        );
    }
    if (props.eyes === 'wink') {
        return (
            <>
                <Circle cx={25} cy={31} r={2.7} fill={props.ink} />
                <Path d="M36 31 Q39 33 42 31" stroke={props.ink} strokeWidth={2.4} strokeLinecap="round" fill="none" />
            </>
        );
    }
    return (
        <>
            <Circle cx={25} cy={31} r={2.7} fill={props.ink} />
            <Circle cx={39} cy={31} r={2.7} fill={props.ink} />
        </>
    );
}

function Accessory(props: { accessory: PetAccessory; ink: string; fill: string; soft: string }) {
    switch (props.accessory) {
        case 'bow':
            return (
                <Path
                    d="M24 15 L14 10 L14 21 L24 16 L34 21 L34 10 Z"
                    fill="#FF6FA3"
                    stroke={props.ink}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                />
            );
        case 'tag':
            return (
                <>
                    <Circle cx={43} cy={49} r={4.2} fill="#FFE276" stroke={props.ink} strokeWidth={1.4} />
                    <Path d="M41 49 L45 49" stroke={props.ink} strokeWidth={1.4} strokeLinecap="round" />
                </>
            );
        case 'terminal':
            return (
                <>
                    <Rect x={42} y={12} width={13} height={10} rx={3} fill={props.soft} stroke={props.ink} strokeWidth={1.2} />
                    <Path d="M45 17 L51 17" stroke={props.ink} strokeWidth={1.2} strokeLinecap="round" />
                </>
            );
        case 'spark':
            return (
                <>
                    <Path d="M50 13 L52 18 L57 20 L52 22 L50 27 L48 22 L43 20 L48 18 Z" fill={props.soft} stroke={props.ink} strokeWidth={1.2} strokeLinejoin="round" />
                </>
            );
        case 'none':
            return null;
    }
}

function Spot(props: { spot: PetSpot; ink: string; soft: string }) {
    switch (props.spot) {
        case 'left':
            return <Circle cx={23} cy={27} r={7} fill={props.soft} opacity={0.56} />;
        case 'right':
            return <Circle cx={41} cy={27} r={7} fill={props.soft} opacity={0.56} />;
        case 'forehead':
            return <Path d="M28 18 L36 18 L32 27 Z" fill={props.soft} opacity={0.6} />;
        case 'none':
            return null;
    }
}

function Cat(props: { fill: string; ink: string; soft: string; parts: PetAvatarParts }) {
    return (
        <>
            <Circle cx={32} cy={32} r={22} fill={props.fill} stroke={props.ink} strokeWidth={2.2} />
            <Path d="M17 25 L22 11 L30 24" fill={props.fill} stroke={props.ink} strokeWidth={2.1} strokeLinejoin="round" />
            <Path d="M34 24 L42 11 L47 25" fill={props.fill} stroke={props.ink} strokeWidth={2.1} strokeLinejoin="round" />
            <Spot spot={props.parts.spot} ink={props.ink} soft={props.soft} />
            <Eyes eyes={props.parts.eyes} ink={props.ink} />
            <Path d="M32 36 L32 38" stroke={props.ink} strokeWidth={2} strokeLinecap="round" />
            <Path d="M32 38 Q29 42 26 38" stroke={props.ink} strokeWidth={2} strokeLinecap="round" fill="none" />
            <Path d="M32 38 Q35 42 38 38" stroke={props.ink} strokeWidth={2} strokeLinecap="round" fill="none" />
        </>
    );
}

function Pig(props: { fill: string; ink: string; soft: string; parts: PetAvatarParts }) {
    return (
        <>
            <Ellipse cx={18} cy={24} rx={7} ry={9} fill={props.fill} stroke={props.ink} strokeWidth={2} rotation={-25} origin="18,24" />
            <Ellipse cx={46} cy={24} rx={7} ry={9} fill={props.fill} stroke={props.ink} strokeWidth={2} rotation={25} origin="46,24" />
            <Circle cx={32} cy={36} r={20} fill={props.fill} stroke={props.ink} strokeWidth={2.2} />
            <Spot spot={props.parts.spot} ink={props.ink} soft={props.soft} />
            <Eyes eyes={props.parts.eyes} ink={props.ink} />
            <Ellipse cx={32} cy={39} rx={8} ry={5.8} fill="#FFD2DF" stroke={props.ink} strokeWidth={1.8} />
            <Circle cx={29} cy={39} r={1.2} fill={props.ink} />
            <Circle cx={35} cy={39} r={1.2} fill={props.ink} />
        </>
    );
}

function Dog(props: { fill: string; ink: string; soft: string; parts: PetAvatarParts }) {
    return (
        <>
            <Path d="M17 22 C9 24 8 39 15 44 C22 41 24 30 22 22 Z" fill={props.fill} stroke={props.ink} strokeWidth={2} />
            <Path d="M47 22 C55 24 56 39 49 44 C42 41 40 30 42 22 Z" fill={props.fill} stroke={props.ink} strokeWidth={2} />
            <Circle cx={32} cy={35} r={20} fill={props.fill} stroke={props.ink} strokeWidth={2.2} />
            <Spot spot={props.parts.spot} ink={props.ink} soft={props.soft} />
            <Eyes eyes={props.parts.eyes} ink={props.ink} />
            <Ellipse cx={32} cy={39} rx={6} ry={5} fill={props.soft} opacity={0.9} />
            <Circle cx={32} cy={37} r={2.1} fill={props.ink} />
            <Path d="M32 40 Q29 44 26 40" stroke={props.ink} strokeWidth={1.8} strokeLinecap="round" fill="none" />
            <Path d="M32 40 Q35 44 38 40" stroke={props.ink} strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </>
    );
}

export const AvatarPet = React.memo((props: AvatarPetProps) => {
    const { id, square, size = 48, monochrome } = props;
    const parts = React.useMemo(() => resolvePetAvatarParts(id), [id]);
    const palette = monochrome ? monochromePalette : palettes[parts.paletteIndex];

    return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
            <Background square={square} color={palette.bg} />
            {parts.species === 'cat' ? <Cat fill={palette.fill} ink={palette.ink} soft={palette.soft} parts={parts} /> : null}
            {parts.species === 'pig' ? <Pig fill={palette.fill} ink={palette.ink} soft={palette.soft} parts={parts} /> : null}
            {parts.species === 'dog' ? <Dog fill={palette.fill} ink={palette.ink} soft={palette.soft} parts={parts} /> : null}
            <Accessory accessory={parts.accessory} ink={palette.ink} fill={palette.fill} soft={palette.soft} />
        </Svg>
    );
});
