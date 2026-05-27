import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { EmptyState } from '@/components/common/EmptyState';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { SubscriptionNotice } from '@/components/subscription/SubscriptionNotice';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { t } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { radii, typography } from '@/theme/tokens';
import { formatDisplayDate } from '@/utils/date';
import { resolveUserErrorMessage } from '@/utils/errors';

const statusLabelMap: Record<'pending' | 'ordered' | 'restocked', string> = {
  pending: t('pending'),
  ordered: t('ordered'),
  restocked: t('restocked'),
};

const statusColorMap: Record<'pending' | 'ordered' | 'restocked', string> = {
  pending: 'rgba(220,38,38,0.26)',
  ordered: 'rgba(59,130,246,0.26)',
  restocked: 'rgba(22,163,74,0.26)',
};

export default function NotepadScreen() {
  const [input, setInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  const items = useAppStore((state) => state.outOfStockItems);
  const addOutOfStockItem = useAppStore((state) => state.addOutOfStockItem);
  const cycleOutOfStock = useAppStore((state) => state.cycleOutOfStock);
  const deleteOutOfStockItem = useAppStore((state) => state.deleteOutOfStockItem);
  const clearOutOfStock = useAppStore((state) => state.clearOutOfStock);

  const submit = async () => {
    if (!input.trim()) {
      return;
    }
    try {
      await addOutOfStockItem(input);
      setInput('');
      setShowInput(false);
    } catch (error) {
      Alert.alert(
        'Save failed',
        resolveUserErrorMessage(error, 'Could not add item. Please try again.'),
      );
    }
  };

  const confirmClear = () => {
    if (items.length === 0) {
      return;
    }
    Alert.alert('Clear All', `Delete all ${items.length} items?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearOutOfStock();
          } catch (error) {
            Alert.alert(
              'Delete failed',
              resolveUserErrorMessage(error, 'Could not clear items. Please try again.'),
            );
          }
        },
      },
    ]);
  };

  return (
    <ScreenContainer contentStyle={styles.content}>
      <ScreenHeader
        title={t('outOfStockItems')}
        subtitle={`${items.length} items`}
        rightNode={
          <Pressable style={styles.clearBtn} onPress={confirmClear}>
            <Feather name="trash-2" size={14} color="#FCA5A5" />
            <AppText variant="caption" style={styles.clearCopy}>
              {t('clearAll')}
            </AppText>
          </Pressable>
        }
      />

      <SubscriptionNotice />

      {showInput ? (
        <GlassCard style={styles.inputCard}>
          <TextInput
            value={input}
            onChangeText={setInput}
            style={styles.input}
            placeholder="Type item name"
            placeholderTextColor="#94A3B8"
            autoFocus
            onSubmitEditing={submit}
          />
          <Pressable style={styles.inlineAdd} onPress={submit}>
            <Feather name="check" size={16} color="#0B1120" />
          </Pressable>
        </GlassCard>
      ) : (
        <Pressable style={styles.addBtn} onPress={() => setShowInput(true)}>
          <Feather name="plus" size={16} color="#0B1120" />
          <AppText variant="label" style={styles.addCopy}>
            {t('addItem')}
          </AppText>
        </Pressable>
      )}

      {items.length === 0 ? (
        <EmptyState icon="check-circle" title={t('outOfStockItems')} subtitle={t('emptyNotepad')} />
      ) : (
        items.map((item, index) => (
          <Animated.View key={item.id} entering={FadeInDown.delay(index * 60).springify()}>
            <GlassCard style={styles.itemCard}>
              <View style={styles.itemHead}>
                <View style={styles.itemCopy}>
                  <AppText variant="subtitle">{item.itemName}</AppText>
                  <AppText variant="caption">{formatDisplayDate(item.createdAt)}</AppText>
                </View>
                <Pressable
                  onPress={async () => {
                    try {
                      await cycleOutOfStock(item.id);
                    } catch (error) {
                      Alert.alert(
                        'Update failed',
                        resolveUserErrorMessage(error, 'Could not update status. Please try again.'),
                      );
                    }
                  }}
                  style={[styles.statusBtn, { backgroundColor: statusColorMap[item.status] }]}>
                  <AppText variant="caption" style={styles.statusCopy}>
                    {statusLabelMap[item.status]}
                  </AppText>
                </Pressable>
              </View>

              <Pressable
                style={styles.deleteBtn}
                onPress={async () => {
                  try {
                    await deleteOutOfStockItem(item.id);
                  } catch (error) {
                    Alert.alert(
                      'Delete failed',
                      resolveUserErrorMessage(error, 'Could not delete item. Please try again.'),
                    );
                  }
                }}>
                <Feather name="trash" size={14} color="#FCA5A5" />
                <AppText variant="caption" style={styles.deleteCopy}>
                  Delete
                </AppText>
              </Pressable>
            </GlassCard>
          </Animated.View>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  clearBtn: {
    minHeight: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.4)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.14)',
  },
  clearCopy: {
    color: '#FCA5A5',
  },
  addBtn: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: '#FDBA74',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addCopy: {
    color: '#0B1120',
    fontFamily: typography.bodyBold,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(15,23,42,0.35)',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    fontFamily: typography.body,
  },
  inlineAdd: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FDBA74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCard: {
    gap: 10,
  },
  itemHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemCopy: {
    gap: 2,
    flex: 1,
  },
  statusBtn: {
    minHeight: 30,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  statusCopy: {
    color: '#F8FAFC',
  },
  deleteBtn: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.35)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteCopy: {
    color: '#FCA5A5',
  },
});
