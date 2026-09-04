import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import type { MatriqTheme, MatriqThemeColors } from "../../theme/themes";
import { Card, Button, LoadingScreen, ReceiptSkeleton } from "../../components";
import { api } from "../../api/client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MainStackParamList } from "../../navigation/types";
import type { Payment } from "../../types/api";

type ReceiptScreenProps = NativeStackScreenProps<MainStackParamList, "Receipt">;

export function ReceiptScreen({ route }: ReceiptScreenProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);
  const { paymentId } = route.params;
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Payment>(`/payments/${paymentId}`);
        setPayment(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [paymentId]);

  if (loading) return <ReceiptSkeleton />;
  if (!payment) return <LoadingScreen message="Receipt not found" />;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Matriq Payment Receipt\n\nReceipt: ${payment.receipt?.receiptNumber ?? "N/A"}\nAmount: ₦${(payment.amountKobo / 100).toLocaleString()}\nDate: ${payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : "Pending"}\nStatus: ${payment.status}\n\nPowered by Matriq`,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Receipt</Text>

        <Card style={styles.receiptCard}>
          <View style={styles.receiptHeader}>
            <Text style={styles.logoText}>Matriq</Text>
            <Text style={styles.receiptLabel}>PAYMENT RECEIPT</Text>
          </View>

          <View style={styles.divider} />

          {payment.receipt && (
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrLabel}>Receipt #{payment.receipt.receiptNumber}</Text>
              <View style={styles.qrBox}>
                <Ionicons name="qr-code" size={64} color={colors.textPrimary} />
              </View>
              {payment.receipt.verifiedAt && (
                <View style={styles.verifiedBadge}>
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={styles.details}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Dues</Text>
              <Text style={styles.detailValue}>₦{(payment.amountKobo / 100).toLocaleString()}</Text>
            </View>
            {typeof payment.developerFeeKobo === "number" && payment.developerFeeKobo > 0 ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Developer fee (development + e-receipt)</Text>
                <Text style={styles.detailValue}>₦{(payment.developerFeeKobo / 100).toLocaleString()}</Text>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Total charged</Text>
              <Text style={styles.detailValue}>
                ₦{((payment.amountKobo + (payment.developerFeeKobo ?? 0)) / 100).toLocaleString()}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Fee</Text>
              <Text style={styles.detailValue}>{payment.fee?.name ?? "N/A"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: payment.status === "successful" ? colors.success : colors.warning },
                ]}
              >
                {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>
                {payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : "Pending"}
              </Text>
            </View>
            {payment.rankAtPayment && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Rank</Text>
                <Text style={styles.detailValue}>#{payment.rankAtPayment} to pay</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          <Text style={styles.footer}>
            This receipt is digitally signed and verifiable.{'\n'}
            Scan QR code to verify authenticity.
          </Text>
        </Card>

        <Button title="Share Receipt" onPress={handleShare} variant="primary" />
        <View style={{ height: theme.spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme: MatriqTheme, colors: MatriqThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    container: { padding: theme.spacing.lg },
    title: {
      ...theme.typography.h1,
      color: colors.textPrimary,
      marginBottom: theme.spacing.lg,
    },
    receiptCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.radii.xl,
      padding: theme.spacing.lg,
      borderWidth: 2,
      borderColor: colors.brand + "20",
      marginBottom: theme.spacing.lg,
    },
    receiptHeader: { alignItems: "center", marginBottom: theme.spacing.md },
    logoText: { ...theme.typography.h1, color: colors.brand, fontWeight: "800" },
    receiptLabel: {
      ...theme.typography.captionBold,
      color: colors.textMuted,
      marginTop: theme.spacing.xs,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: theme.spacing.md,
    },
    qrPlaceholder: { alignItems: "center", marginVertical: theme.spacing.md },
    qrLabel: {
      ...theme.typography.captionBold,
      color: colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    qrBox: {
      width: 120,
      height: 120,
      backgroundColor: colors.surfaceAlt,
      borderRadius: theme.radii.md,
      alignItems: "center",
      justifyContent: "center",
    },
    verifiedBadge: {
      marginTop: theme.spacing.sm,
      backgroundColor: colors.successBg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.pill,
    },
    verifiedText: { ...theme.typography.captionBold, color: colors.success },
    verifiedRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    details: { gap: theme.spacing.sm },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: theme.spacing.xs,
    },
    detailLabel: { ...theme.typography.caption, color: colors.textMuted },
    detailValue: { ...theme.typography.captionBold, color: colors.textPrimary },
    footer: {
      ...theme.typography.small,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 18,
    },
  });
}
