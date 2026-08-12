import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, Button, ListScreenSkeleton } from "../../components";
import { api } from "../../api/client";
import { useFocusEffect } from "@react-navigation/native";
import type { Fee, Payment } from "../../types/api";

export function FeeDetailsScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const [fees, setFees] = useState<Fee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const paymentsData = await api
        .get<{ payments: Payment[] }>("/me/payment-history")
        .catch(() => null);
      // Payment history returns payments with fees embedded
      if (paymentsData) {
        setPayments(paymentsData.payments ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  if (loading) return <ListScreenSkeleton rows={5} titleWidth={215} />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Dues & Payments</Text>

        {/* Payment History */}
        {payments.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Payment History</Text>
            {payments.map((payment) => (
              <TouchableOpacity
                key={payment.id}
                onPress={() => navigation.navigate("Receipt", { paymentId: payment.id })}
              >
                <Card
                  title={payment.fee?.name ?? "Payment"}
                  subtitle={new Date(payment.createdAt).toLocaleDateString()}
                >
                  <View style={styles.paymentRow}>
                    <Text style={styles.amount}>
                      ₦{(payment.amountKobo / 100).toLocaleString()}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            payment.status === "successful"
                              ? colors.successBg
                              : payment.status === "pending"
                                ? colors.warningBg
                                : colors.errorBg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color:
                              payment.status === "successful"
                                ? colors.success
                                : payment.status === "pending"
                                  ? colors.warning
                                  : colors.error,
                          },
                        ]}
                      >
                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  {payment.receipt && (
                    <TouchableOpacity
                      style={styles.receiptLink}
                      onPress={() => navigation.navigate("Receipt", { paymentId: payment.id })}
                    >
                      <View style={styles.receiptRow}>
                        <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                        <Text style={styles.receiptText}>View Receipt</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </Card>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <Card title="No payments yet">
            <Text style={styles.emptyText}>
              You haven't made any payments yet. When you join an association, your dues will appear here.
            </Text>
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
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md, marginTop: spacing.lg },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amount: { ...typography.h3, color: colors.textPrimary },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  statusText: { ...typography.captionBold },
  receiptLink: { marginTop: spacing.sm },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  receiptText: { ...typography.captionBold, color: colors.primary },
  emptyText: { ...typography.body, color: colors.textSecondary },
});
