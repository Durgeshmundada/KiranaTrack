import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { t } from '@/i18n';
import { runBillParsingPipeline } from '@/services/billPipeline';
import { ApiError } from '@/services/apiClient';
import { generateClientRequestId } from '@/services/backendData';
import { useAppStore } from '@/store/appStore';
import type { Bill } from '@/types/models';
import { radii, typography } from '@/theme/tokens';
import { formatINRFromPaise, rupeeToPaise } from '@/utils/currency';
import { toIsoFromDateInput } from '@/utils/dateInput';
import { resolveUserErrorMessage } from '@/utils/errors';

const todayIso = () => new Date().toISOString();
const lineItemTotal = (lineItems: Bill['lineItems']): number =>
  lineItems.reduce((sum, item) => sum + item.amountPaise, 0);

const paiseToInputRupees = (value: number): string => {
  const rupees = value / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
};

export default function ScanBillScreen() {
  const addBill = useAppStore((state) => state.addBill);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [ocrText, setOcrText] = useState('');

  const [billNumber, setBillNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [date, setDate] = useState(todayIso().slice(0, 10));
  const [totalRupee, setTotalRupee] = useState('');
  const [imageHash, setImageHash] = useState('');
  const [billRequestId, setBillRequestId] = useState<string | null>(null);
  const [parsedLineItems, setParsedLineItems] = useState<Bill['lineItems']>([]);

  const hasEditableDraft = Boolean(imageUri && vendorName && totalRupee);

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.55,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled) {
      return;
    }
    setImageUri(result.assets[0]?.uri ?? null);
    setParsedLineItems([]);
    setBillRequestId(generateClientRequestId('bill'));
  };

  const captureFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission required', 'Enable camera access to scan bills.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.55,
    });
    if (result.canceled) {
      return;
    }
    setImageUri(result.assets[0]?.uri ?? null);
    setParsedLineItems([]);
    setBillRequestId(generateClientRequestId('bill'));
  };

  const parseSelectedBill = async () => {
    if (!imageUri) {
      return;
    }

    setIsParsing(true);
    try {
      const parsed = await runBillParsingPipeline(imageUri);
      setOcrText(parsed.ocrText);
      setImageHash(parsed.imageHash);
      setBillNumber(parsed.draft.billNumber ?? `AUTO-${Date.now().toString().slice(-5)}`);
      setVendorName(parsed.draft.vendorName ?? '');
      setDate((parsed.draft.date ?? todayIso()).slice(0, 10));
      const mappedLineItems: Bill['lineItems'] = parsed.draft.lineItems.map((item, index) => ({
        id: `parsed-li-${Date.now()}-${index + 1}`,
        name: item.name,
        qty: item.qty,
        ratePaise: item.ratePaise,
        amountPaise: item.amountPaise,
      }));
      setParsedLineItems(mappedLineItems);

      const parsedTotalPaise = parsed.draft.totalAmountPaise ?? lineItemTotal(mappedLineItems);
      setTotalRupee(parsedTotalPaise > 0 ? paiseToInputRupees(parsedTotalPaise) : '');

      if (parsed.source === 'manual') {
        Alert.alert(
          'Auto-parse unavailable',
          'Parser is slow or unavailable right now. You can still fill fields manually and save.',
        );
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        Alert.alert('Session expired', 'Please sign in again, then retry OCR parsing.');
      } else if (error instanceof Error && error.message.toLowerCase().includes('abort')) {
        Alert.alert(
          'Parser timeout',
          'OCR took too long on this image. You can enter details manually and save now.',
        );
      } else {
        Alert.alert('Parse failed', 'Could not read this bill. Please edit manually and save.');
      }
    } finally {
      setIsParsing(false);
    }
  };

  const saveBill = async () => {
    if (!imageUri) {
      Alert.alert('Select image', 'Capture or upload a bill image first.');
      return;
    }

    if (!vendorName.trim()) {
      Alert.alert('Vendor required', 'Please provide vendor name.');
      return;
    }

    const totalAmount = Number(totalRupee);
    if (Number.isNaN(totalAmount) || totalAmount <= 0) {
      Alert.alert('Total amount required', 'Enter a valid total amount.');
      return;
    }

    const normalizedIsoDate = toIsoFromDateInput(date);
    if (!normalizedIsoDate) {
      Alert.alert('Invalid date', 'Enter bill date in YYYY-MM-DD format.');
      return;
    }

    try {
      const totalAmountPaise = rupeeToPaise(totalAmount);
      const parsedTotalPaise = lineItemTotal(parsedLineItems);
      const hasReliableParsedItems =
        parsedLineItems.length > 0 && Math.abs(parsedTotalPaise - totalAmountPaise) <= 100;
      const lineItemsToSave: Bill['lineItems'] = hasReliableParsedItems
        ? parsedLineItems
        : [
            {
              id: `li-${Date.now()}`,
              name: 'Bill Total',
              qty: 1,
              ratePaise: totalAmountPaise,
              amountPaise: totalAmountPaise,
            },
          ];

      const bill = await addBill({
        billNumber: billNumber.trim() || `AUTO-${Date.now().toString().slice(-5)}`,
        vendorName: vendorName.trim(),
        date: normalizedIsoDate,
        totalAmountPaise,
        imageUrl: imageUri,
        imageHash: imageHash || 'pending',
        clientRequestId: billRequestId ?? generateClientRequestId('bill'),
        lineItems: lineItemsToSave,
      });

      router.replace(`/bill/${bill.id}`);
    } catch (error) {
      Alert.alert(
        'Save failed',
        resolveUserErrorMessage(error, 'Could not save bill to backend. Please try again.'),
      );
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={t('scanNewBill')} subtitle={t('offlineReady')} />

      <GlassCard intense style={styles.captureCard}>
        <View style={styles.captureActions}>
          <View style={styles.halfBtn}>
            <GradientButton
              label="Camera"
              onPress={captureFromCamera}
              icon={<Feather name="camera" size={16} color="#0B1120" />}
            />
          </View>
          <View style={styles.halfBtn}>
            <GradientButton
              label="Gallery"
              onPress={pickFromGallery}
              variant="accent"
              icon={<Feather name="image" size={16} color="#0B1120" />}
            />
          </View>
        </View>

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Feather name="file-text" size={30} color="#A8B6CC" />
            <AppText variant="caption">Capture an invoice to begin OCR parsing.</AppText>
          </View>
        )}

        <GradientButton
          label={isParsing ? t('parseInProgress') : 'Run OCR + Parse'}
          onPress={parseSelectedBill}
          disabled={!imageUri || isParsing}
        />
      </GlassCard>

      {isParsing ? (
        <GlassCard style={styles.loaderCard}>
          <SkeletonLoader height={20} width={220} />
          <SkeletonLoader height={44} />
          <SkeletonLoader height={44} />
          <SkeletonLoader height={44} />
        </GlassCard>
      ) : null}

      {imageUri ? (
        <GlassCard style={styles.formCard}>
          <AppText variant="subtitle">{t('confirmBill')}</AppText>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rawHintRow}>
            {ocrText ? (
              <AppText variant="caption" style={styles.rawText}>
                {ocrText}
              </AppText>
            ) : (
              <AppText variant="caption">No OCR text available. Manual confirm mode.</AppText>
            )}
          </ScrollView>

          <View style={styles.field}>
            <AppText variant="caption">{t('billNumber')}</AppText>
            <TextInput
              value={billNumber}
              onChangeText={setBillNumber}
              style={styles.input}
              placeholder="INV-0001"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.field}>
            <AppText variant="caption">{t('vendor')}</AppText>
            <TextInput
              value={vendorName}
              onChangeText={setVendorName}
              style={styles.input}
              placeholder="Vendor name"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.half]}>
              <AppText variant="caption">{t('date')}</AppText>
              <TextInput
                value={date}
                onChangeText={setDate}
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={[styles.field, styles.half]}>
              <AppText variant="caption">{t('total')}</AppText>
              <TextInput
                value={totalRupee}
                onChangeText={setTotalRupee}
                style={styles.input}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <AppText variant="caption" style={styles.previewAmount}>
            {`Preview: ${formatINRFromPaise(rupeeToPaise(Number(totalRupee) || 0))}`}
          </AppText>
          {parsedLineItems.length > 0 ? (
            <AppText variant="caption" style={styles.parsedMeta}>
              {`${parsedLineItems.length} line items parsed`}
            </AppText>
          ) : null}

          <GradientButton label={t('save')} onPress={saveBill} disabled={!hasEditableDraft} />
        </GlassCard>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  captureCard: {
    gap: 12,
  },
  captureActions: {
    flexDirection: 'row',
    gap: 10,
  },
  halfBtn: {
    flex: 1,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  placeholder: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.05)',
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loaderCard: {
    gap: 12,
  },
  formCard: {
    gap: 10,
  },
  rawHintRow: {
    paddingVertical: 6,
  },
  rawText: {
    color: '#A8B6CC',
    fontFamily: typography.bodyBold,
  },
  field: {
    gap: 4,
  },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(15,23,42,0.35)',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    fontFamily: typography.body,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  previewAmount: {
    color: '#FDE68A',
  },
  parsedMeta: {
    color: '#86EFAC',
  },
});
