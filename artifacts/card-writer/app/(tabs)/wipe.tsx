/**
 * Wipe screen - factory-reset a provisioned Bolt Card.
 *
 * Flow:
 *  1. User pastes the wipe JSON string copied from bitPOS
 *  2. App parses k0–k4, shows "Tap card to wipe" confirmation
 *  3. User taps "Wipe Card Now" → holds card to phone
 *  4. Success or error with retry
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import { parseWipeJson, wipeCard } from '@/utils/ntag424';

type Phase = 'input' | 'confirm' | 'wiping' | 'success' | 'error';

interface Step {
  label: string;
  done: boolean;
  active: boolean;
}

// ── NFC pulse animation (re-used from write screen, copied for isolation) ──────

function NfcPulse({ active, color }: { active: boolean; color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    if (!active) {
      loopRef.current?.stop();
      scale.setValue(1);
      opacity.setValue(0.55);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.55, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loopRef.current = loop;
    loop.start();
    return () => loop.stop();
  }, [active]);

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, { borderColor: color, transform: [{ scale }], opacity }]} />
      <View style={[styles.pulseCore, { backgroundColor: color + '1A', borderColor: color }]}>
        <MaterialCommunityIcons name="nfc" size={52} color={color} />
      </View>
    </View>
  );
}

// ── Step list ──────────────────────────────────────────────────────────────────

function StepList({ steps }: { steps: Step[] }) {
  const colors = useColors();
  return (
    <View style={styles.stepList}>
      {steps.map((s, i) => (
        <View key={i} style={styles.stepRow}>
          <View style={[styles.stepDot, {
            backgroundColor: s.done ? colors.primary : 'transparent',
            borderColor: s.done ? colors.primary : s.active ? colors.primary : colors.border,
          }]}>
            {s.done
              ? <MaterialCommunityIcons name="check" size={13} color={colors.background} />
              : s.active
              ? <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
              : null}
          </View>
          <Text style={[styles.stepText, {
            color: s.done ? colors.foreground : s.active ? colors.primary : colors.mutedForeground,
            fontFamily: s.active ? 'Inter_600SemiBold' : 'Inter_400Regular',
          }]}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function WipeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('input');
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');
  const [parseError, setParseError] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);

  const keysRef = useRef<ReturnType<typeof parseWipeJson> | null>(null);

  // ── Validate + confirm ─────────────────────────────────────────────────────

  function handleConfirm() {
    setParseError('');
    try {
      keysRef.current = parseWipeJson(jsonText.trim());
      setPhase('confirm');
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }

  // ── NFC wipe ───────────────────────────────────────────────────────────────

  async function startWipe() {
    if (!keysRef.current) return;
    setPhase('wiping');
    const list: Step[] = [];
    setSteps([]);
    setError('');

    const onStep = (label: string, done = false) => {
      if (done) {
        if (list.length > 0) list[list.length - 1] = { ...list[list.length - 1], done: true, active: false };
      } else {
        if (list.length > 0) list[list.length - 1] = { ...list[list.length - 1], done: true, active: false };
        list.push({ label, done: false, active: true });
      }
      setSteps([...list]);
    };

    try {
      await NfcManager.start();
      await NfcManager.requestTechnology(NfcTech.IsoDep);
      await wipeCard(keysRef.current, onStep);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('success');
    } catch (e: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 110 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Page header */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>Wipe Card</Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Reset a Bolt Card to factory defaults
          </Text>
        </View>

        {/* ── INPUT ── */}
        {phase === 'input' && (
          <View style={styles.block}>
            {/* Warning banner */}
            <View style={[styles.warnBox, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive + '44' }]}>
              <MaterialCommunityIcons name="alert" size={18} color={colors.destructive} style={{ marginRight: 8 }} />
              <Text style={[styles.warnText, { color: colors.destructive }]}>
                This permanently erases all keys and disables the card's Lightning function.
              </Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              WIPE JSON
            </Text>
            <TextInput
              style={[styles.jsonInput, {
                color: colors.foreground,
                backgroundColor: colors.card,
                borderColor: parseError ? colors.destructive : colors.border,
              }]}
              placeholder={'{"protocol_name":"wipe_bolt_card_response","k0":"…","k1":"…",…}'}
              placeholderTextColor={colors.mutedForeground}
              value={jsonText}
              onChangeText={t => { setJsonText(t); setParseError(''); }}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            {parseError !== '' && (
              <Text style={[styles.inlineErr, { color: colors.destructive }]}>{parseError}</Text>
            )}
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              In the bitPOS web app, open a card → tap "Wipe Card" → copy the wipe JSON shown there.
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: jsonText.trim() ? colors.destructive : colors.muted }]}
              onPress={handleConfirm}
              disabled={!jsonText.trim()}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={18}
                color={jsonText.trim() ? '#fff' : colors.mutedForeground}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.btnLabel, { color: jsonText.trim() ? '#fff' : colors.mutedForeground }]}>
                Continue to Wipe
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── CONFIRM ── */}
        {phase === 'confirm' && (
          <View style={styles.centerBlock}>
            <View style={[styles.resultIcon, { backgroundColor: colors.destructive + '15' }]}>
              <MaterialCommunityIcons name="nfc-off" size={52} color={colors.destructive} />
            </View>
            <Text style={[styles.bigLabel, { color: colors.foreground }]}>Ready to Wipe</Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Tap "Wipe Card Now", then hold the Bolt Card flat against the back of your phone.
            </Text>

            <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.confirmText, { color: colors.mutedForeground }]}>
                All 5 AES keys will be reset to factory zero values. The card will no longer function as a Bolt Card until reprogrammed.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.destructive, marginTop: 24 }]}
              onPress={startWipe}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="nfc" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={[styles.btnLabel, { color: '#fff' }]}>Wipe Card Now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPhase('input')} style={styles.ghostBtn}>
              <Text style={[styles.ghostLabel, { color: colors.mutedForeground }]}>Go back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── WIPING ── */}
        {phase === 'wiping' && (
          <View style={styles.centerBlock}>
            <NfcPulse active color={colors.destructive} />
            <Text style={[styles.bigLabel, { color: colors.foreground }]}>Hold Card Still…</Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Keep the card touching the phone until all steps complete.
            </Text>
            {steps.length > 0 && <StepList steps={steps} />}
          </View>
        )}

        {/* ── SUCCESS ── */}
        {phase === 'success' && (
          <View style={styles.centerBlock}>
            <View style={[styles.resultIcon, { backgroundColor: colors.primary + '1A' }]}>
              <MaterialCommunityIcons name="check-circle" size={64} color={colors.primary} />
            </View>
            <Text style={[styles.bigLabel, { color: colors.foreground }]}>Card Wiped</Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              The card has been reset to factory defaults. Use the provision URL from bitPOS to reprogram it.
            </Text>
            {steps.length > 0 && <StepList steps={steps} />}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.secondary, marginTop: 28 }]}
              onPress={() => { setPhase('input'); setJsonText(''); setSteps([]); keysRef.current = null; }}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnLabel, { color: colors.secondaryForeground }]}>Wipe Another Card</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <View style={styles.centerBlock}>
            <View style={[styles.resultIcon, { backgroundColor: colors.destructive + '1A' }]}>
              <MaterialCommunityIcons name="alert-circle" size={64} color={colors.destructive} />
            </View>
            <Text style={[styles.bigLabel, { color: colors.foreground }]}>Wipe Failed</Text>
            <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.destructive + '66' }]}>
              <Text style={[styles.errorMsg, { color: colors.destructive }]}>{error}</Text>
            </View>
            {steps.length > 0 && <StepList steps={steps} />}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.destructive, marginTop: 28 }]}
              onPress={() => setPhase('confirm')}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnLabel, { color: '#fff' }]}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPhase('input'); setSteps([]); keysRef.current = null; }} style={styles.ghostBtn}>
              <Text style={[styles.ghostLabel, { color: colors.mutedForeground }]}>Start over</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, flexGrow: 1 },
  pageHeader: { marginBottom: 28 },
  pageTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  pageSub: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  block: { width: '100%' },
  centerBlock: { width: '100%', alignItems: 'center' },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 20,
  },
  warnText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, flex: 1 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 8 },
  jsonInput: {
    borderWidth: 1, borderRadius: 12, padding: 14,
    fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20,
    minHeight: 120, textAlignVertical: 'top', marginBottom: 6,
  },
  inlineErr: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  hintText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 20 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 15, paddingHorizontal: 24, width: '100%',
  },
  btnLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  ghostBtn: { marginTop: 14, padding: 8 },
  ghostLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  pulseWrap: {
    width: 140, height: 140, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, marginTop: 8,
  },
  pulseRing: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2,
  },
  pulseCore: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  bigLabel: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 10, textAlign: 'center' },
  infoText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, paddingHorizontal: 4 },
  confirmCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 10, borderWidth: 1, padding: 14, gap: 10, width: '100%', marginTop: 16,
  },
  confirmText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, flex: 1 },
  resultIcon: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20, marginTop: 8,
  },
  errorBox: { borderRadius: 10, borderWidth: 1, padding: 14, width: '100%', marginTop: 12 },
  errorMsg: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  stepList: { width: '100%', marginTop: 20, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { fontSize: 14, flex: 1 },
});
