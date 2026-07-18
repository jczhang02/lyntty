import { Platform } from 'react-native';

/**
 * Typography system for Lyntty.
 *
 * Direction: editorial warmth without proprietary fonts.
 * - Session English prose / display serif: Source Serif 4
 * - UI sans: Source Sans 3
 * - Session Chinese prose serif: LXGW Neo ZhiSong
 * - Monospace: IBM Plex Mono, retained for code/tool output density
 */

export const FontFamilies = {
  default: {
    regular: 'SourceSans3-Regular',
    italic: 'SourceSans3-Regular',
    semiBold: 'SourceSans3-SemiBold',
  },
  serif: {
    regular: 'SourceSerif4-Regular',
    italic: 'SourceSerif4-Regular',
    semiBold: 'SourceSerif4-SemiBold',
  },
  cjk: {
    regular: 'LXGWNeoZhiSong-Regular',
    semiBold: 'LXGWNeoZhiSong-Regular',
  },
  mono: {
    regular: 'IBMPlexMono-Regular',
    italic: 'IBMPlexMono-Italic',
    semiBold: 'IBMPlexMono-SemiBold',
  },
  logo: {
    bold: 'BricolageGrotesque-Bold',
  },
  legacy: {
    spaceMono: 'SpaceMono',
    systemMono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ibmPlexSansRegular: 'IBMPlexSans-Regular',
    ibmPlexSansSemiBold: 'IBMPlexSans-SemiBold',
  }
};

export type TextWeight = 'regular' | 'italic' | 'semiBold';

export const getDefaultFont = (weight: TextWeight = 'regular') => {
  return FontFamilies.default[weight];
};

export const getSerifFont = (weight: TextWeight = 'regular') => {
  return FontFamilies.serif[weight];
};

export const getCjkFont = (weight: 'regular' | 'semiBold' = 'regular') => {
  return FontFamilies.cjk[weight];
};

export const getMonoFont = (weight: TextWeight = 'regular') => {
  return FontFamilies.mono[weight];
};

export const getLogoFont = () => {
  return FontFamilies.logo.bold;
};

export const FontWeights = {
  regular: '400',
  semiBold: '600',
  bold: '700',
} as const;

export const Typography = {
  default: (weight: TextWeight = 'regular') => ({
    fontFamily: getDefaultFont(weight),
  }),
  ui: (weight: TextWeight = 'regular') => ({
    fontFamily: getDefaultFont(weight),
  }),
  serif: (weight: TextWeight = 'regular') => ({
    fontFamily: getSerifFont(weight),
  }),
  cjk: (weight: 'regular' | 'semiBold' = 'regular') => ({
    fontFamily: getCjkFont(weight),
  }),
  mono: (weight: TextWeight = 'regular') => ({
    fontFamily: getMonoFont(weight),
  }),
  logo: () => ({
    fontFamily: getLogoFont(),
  }),
  header: () => ({
    fontFamily: getSerifFont('semiBold'),
  }),
  body: () => ({
    fontFamily: getSerifFont('regular'),
  }),
  legacy: {
    spaceMono: () => ({
      fontFamily: FontFamilies.legacy.spaceMono,
    }),
    systemMono: () => ({
      fontFamily: FontFamilies.legacy.systemMono,
    }),
    ibmPlexSans: () => ({
      fontFamily: FontFamilies.legacy.ibmPlexSansRegular,
    }),
  }
};
