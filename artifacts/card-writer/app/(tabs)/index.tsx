/**
 * Write screen - provision a blank NTAG 424 DNA Bolt Card.
 *
 * Flow:
 *  1. User pastes or scans the provision URL from bitPOS
 *  2. App fetches the provision endpoint to retrieve k0–k4 + lnurlw_base
 *  3. User taps "Write Card Now" → holds card to phone
 *  4. Success or error with retry
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
import { parseProvisionResponse, writeCard } from '@/utils/ntag424';

type Phase = 'input' | 'fetching' | 'ready' | 'writing' | 'success' | 'error';

interface Step {
  label: string;
  done: boolean;
  active: boolean;
}

// ── NFC pulse animation ────────────────────────────────────────────────────────

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

export default function WriteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('input');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraPerms, requestCameraPerms] = useCameraPermissions();

  const provisionRef = useRef<{
    keys: ReturnType<typeof parseProvisionResponse>;
    lnurlwBase: string;
  } | null>(null);

  // ── Fetch provision data ───────────────────────────────────────────────────

  async function fetchProvision() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setPhase('fetching');
    setError('');
    try {
      const resp = await fetch(trimmed);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((body['error'] as string) ?? `Server error ${resp.status}`);
      }
      const json = await resp.json() as Record<string, string>;
      if (json['protocol_name'] !== 'new_bolt_card_response') {
        throw new Error('Unexpected server response. Is this a bitPOS provision URL?');
      }
      provisionRef.current = {
        keys: parseProvisionResponse(json),
        lnurlwBase: json['lnurlw_base'] ?? '',
      };
      setPhase('ready');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  // ── NFC write ─────────────────────────────────────────────────────────────

  async function startWrite() {
    if (!provisionRef.current) return;
    const { keys, lnurlwBase } = provisionRef.current;
    setPhase('writing');
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
      await writeCard(keys, lnurlwBase, onStep);
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

  // ── Camera ────────────────────────────────────────────────────────────────

  async function openCamera() {
    if (!cameraPerms?.granted) {
      const r = await requestCameraPerms();
      if (!r.granted) return;
    }
    setShowCamera(true);
  }

  // ── Camera view ────────────────────────────────────────────────────────────

  if (showCamera) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => { setShowCamera(false); setUrl(data); }}
        />
        <View style={[styles.camBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => setShowCamera(false)} style={styles.camClose}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.camHint}>Scan provision QR code</Text>
        </View>
        <View style={styles.camFrame} />
      </View>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────

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
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>Write Card</Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Program a blank NTAG 424 DNA Bolt Card
          </Text>
        </View>

        {/* ── INPUT ── */}
        {(phase === 'input' || phase === 'fetching') && (
          <View style={styles.block}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PROVISION URL</Text>
            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground, flex: 1 }]}
                placeholder="https://…/api/provision/…"
                placeholderTextColor={colors.mutedForeground}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                editable={phase !== 'fetching'}
                multiline={false}
              />
              <TouchableOpacity onPress={openCamera} style={styles.qrBtn}>
                <MaterialCommunityIcons name="qrcode-scan" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              In the bitPOS web app, open a card and tap "Write Card" to get this URL
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: url.trim() && phase !== 'fetching' ? colors.primary : colors.muted }]}
              onPress={fetchProvision}
              disabled={!url.trim() || phase === 'fetching'}
              activeOpacity={0.8}
            >
              {phase === 'fetching'
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <>
                    <MaterialCommunityIcons name="download" size={18} color={url.trim() ? colors.primaryForeground : colors.mutedForeground} style={{ marginRight: 8 }} />
                    <Text style={[styles.btnLabel, { color: url.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                      Fetch Keys
                    </Text>
                  </>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── READY ── */}
        {phase === 'ready' && (
          <View style={styles.centerBlock}>
            <NfcPulse active color={colors.primary} />
            <Text style={[styles.bigLabel, { color: colors.foreground }]}>Ready to Write</Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Tap the button below, then hold the Bolt Card flat against the back of your phone near the NFC antenna.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 28 }]}
              onPress={startWrite}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="nfc" size={20} color={colors.primaryForeground} style={{ marginRight: 8 }} />
              <Text style={[styles.btnLabel, { color: colors.primaryForeground }]}>Write Card Now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPhase('input'); provisionRef.current = null; }} style={styles.ghostBtn}>
              <Text style={[styles.ghostLabel, { color: colors.mutedForeground }]}>Use different URL</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── WRITING ── */}
        {phase === 'writing' && (
          <View style={styles.centerBlock}>
            <NfcPulse active color={colors.primary} />
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
            <Text style={[styles.bigLabel, { color: colors.foreground }]}>Card Programmed!</Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              The Bolt Card is live. Tap it on any Lightning payment terminal to pay.
            </Text>
            {steps.length > 0 && <StepList steps={steps} />}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.secondary, marginTop: 28 }]}
              onPress={() => { setPhase('input'); setUrl(''); setSteps([]); provisionRef.current = null; }}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnLabel, { color: colors.secondaryForeground }]}>Write Another Card</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <View style={styles.centerBlock}>
            <View style={[styles.resultIcon, { backgroundColor: colors.destructive + '1A' }]}>
              <MaterialCommunityIcons name="alert-circle" size={64} color={colors.destructive} />
            </View>
            <Text style={[styles.bigLabel, { color: colors.foreground }]}>Failed</Text>
            <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.destructive + '66' }]}>
              <Text style={[styles.errorMsg, { color: colors.destructive }]}>{error}</Text>
            </View>
            {steps.length > 0 && <StepList steps={steps} />}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 28 }]}
              onPress={() => setPhase(provisionRef.current ? 'ready' : 'input')}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnLabel, { color: colors.primaryForeground }]}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPhase('input'); setSteps([]); provisionRef.current = null; }} style={styles.ghostBtn}>
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
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2, marginBottom: 8,
  },
  input: { fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 13 },
  qrBtn: { padding: 8 },
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
  camBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12,
  },
  camClose: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  camHint: { color: '#fff', fontSize: 16, fontFamily: 'Inter_500Medium', flex: 1 },
  camFrame: {
    position: 'absolute', top: '30%', left: '15%', right: '15%',
    aspectRatio: 1, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 12,
  },
});
