import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useSetting } from '@/sync/storage';
import { trimIdent } from '@/utils/trimIdent';
import { ToolDiffView } from '../ToolDiffView';
import { ToolSectionView } from '../ToolSectionView';
import { ToolViewProps } from './_all';
import { extractPiEdits } from './piEditInput';

export const PiEditView = React.memo<ToolViewProps>(({ tool }) => {
    const showLineNumbersInToolViews = useSetting('showLineNumbersInToolViews');
    const edits = extractPiEdits(tool.input);

    if (edits.length === 0) return null;

    return (
        <ToolSectionView fullWidth>
            {edits.map((edit, index) => (
                <View key={index}>
                    <ToolDiffView
                        oldText={trimIdent(edit.oldText)}
                        newText={trimIdent(edit.newText)}
                        showLineNumbers={showLineNumbersInToolViews}
                        showPlusMinusSymbols={showLineNumbersInToolViews}
                    />
                    {index < edits.length - 1 && <View style={styles.separator} />}
                </View>
            ))}
        </ToolSectionView>
    );
});

const styles = StyleSheet.create(() => ({
    separator: {
        height: 8,
    },
}));
