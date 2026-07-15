import * as React from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';

type Props = Omit<ScrollViewProps, 'horizontal'>;

export function HorizontalScrollView(props: Props) {
    const {
        showsHorizontalScrollIndicator = true,
        nestedScrollEnabled = true,
        ...rest
    } = props;
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
            nestedScrollEnabled={nestedScrollEnabled}
            {...rest}
        />
    );
}
