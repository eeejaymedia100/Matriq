import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, Button } from "../../components";
import { api } from "../../api/client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MainStackParamList } from "../../navigation/types";
import type { Payment } from "../../types/api";

type PayFeeScreenProps = NativeStackScreenProps<MainStackParamList, "PayFee">;

export function PayFeeScreen({ route, navigation }: PayFeeScreenProps) {
  const { feeId, feeAmountKobo } = route.params;
  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");

  // Platform developer fee (₦150) — covers development cost + e-receipt.
  // Always shown to the student so there's no surprise at the gateway.
  const developerFeeKobo = payment?.developerFeeKobo ?? 15000;
  const feeKobo = payment?.feeAmountKobo ?? feeAmountKobo ?? 0;
  const totalKobo = payment?.totalAmountKobo ?? feeKobo + developerFeeKobo;

  const formatNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;

  const handleInitiate = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.post<Payment>("/payments/initiate", { feeId });
      setPayment(result);
      if (result.checkoutUrl) {
        // Open payment gateway
        Linking.openURL(result.checkoutUrl).catch(() => {
          Alert.alert("Notice", "Please complete your payment in the browser.");
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment initiation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Pay Dues</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!payment ? (
          <Card title="Confirm Payment">
            <Text style={styles.info}>
              You are about to initiate a payment. You will be redirected to our secure payment
              gateway (Paystack) to complete this transaction.
            </Text>

            {/* Fee breakdown — dues + ₦150 developer fee (development & e-receipt) */}
            {feeKobo > 0 && (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Amount Breakdown</Text>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Association dues</Text>
                  <Text style={styles.breakdownValue}>{formatNaira(feeKobo)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Developer fee (app development + e-receipt)</Text>
                  <Text style={styles.breakdownValue}>{formatNaira(developerFeeKobo)}</Text>
                </View>
                <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                  <Text style={styles.breakdownTotalLabel}>Total</Text>
                  <Text style={styles.breakdownTotalValue}>{formatNaira(totalKobo)}</Text>
                </View>
                <Text style={styles.feeNote}>
                  The ₦150 developer fee covers the cost of developing and maintaining this
                  platform and issuing your instant e-receipt.
                </Text>
              </View>
            )}

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Payment Methods Available:</Text>
              <View style={styles.infoItemRow}>
                <Ionicons name="card-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.infoItem}>Debit/Credit Card</Text>
              </View>
              <View style={styles.infoItemRow}>
                <Ionicons name="business-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.infoItem}>Bank Transfer</Text>
              </View>
              <View style={styles.infoItemRow}>
                <Ionicons name="phone-portrait-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.infoItem}>USSD</Text>
              </View>
            </View>
            <Button
              title={`Pay ${formatNaira(totalKobo)}`}
              onPress={handleInitiate}
              loading={loading}
              size="lg"
            />
          </Card>
        ) : (
          <Card title="Payment Initiated">
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.successText}>Payment reference created</Text>
            </View>
            <View style={styles.refBox}>
              <Text style={styles.refLabel}>Reference:</Text>
              <Text style={styles.refValue}>{payment.internalReference}</Text>
            </View>
            {payment.totalAmountKobo ? (
              <Text style={styles.statusText}>
                Total charged: {formatNaira(payment.totalAmountKobo)} (incl. {formatNaira(payment.developerFeeKobo ?? 0)} developer fee)
              </Text>
            ) : (
              <Text style={styles.statusText}>
                Status: {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
              </Text>
            )}
            <Button
              title="View Receipt"
              onPress={() => navigation.navigate("Receipt", { paymentId: payment.id })}
              variant="outline"
            />
          </Card>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.lg },
  errorBox: { backgroundColor: colors.errorBg, borderRadius: 8, padding: spacing.md, marginBottom: spacing.md },
  errorText: { ...typography.caption, color: colors.error },
  info: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  infoBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoTitle: { ...typography.captionBold, color: colors.textPrimary, marginBottom: spacing.xs },
  infoItem: { ...typography.caption, color: colors.textSecondary },
  infoItemRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 2 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 3 },
  breakdownLabel: { ...typography.caption, color: colors.textSecondary, flex: 1, paddingRight: 8 },
  breakdownValue: { ...typography.captionBold, color: colors.textPrimary },
  breakdownTotal: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 6 },
  breakdownTotalLabel: { ...typography.captionBold, color: colors.textPrimary },
  breakdownTotalValue: { ...typography.captionBold, color: colors.textPrimary },
  feeNote: { ...typography.caption, color: colors.textMuted, marginTop: 8, lineHeight: 18 },
  successText: { ...typography.h3, color: colors.success },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.md,
  },
  refBox: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  refLabel: { ...typography.captionBold, color: colors.textSecondary },
  refValue: { ...typography.captionBold, color: colors.textPrimary },
  statusText: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
});
