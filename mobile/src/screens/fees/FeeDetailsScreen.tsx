import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { api } from "../../api/client";
import { formatApiError } from "../../utils/errors";
import type { Fee, Payment } from "../../types/api";

interface Props {
  navigation: { navigate: (s: string, p?: object) => void };
}

/**
 * Dues & Payments — lives in Settings only, never on Home (spec §10).
 * Conditional by design: when the student's association has registered for
 * dues collection we show the real flow (fees + history); when it hasn't, a
 * well-styled, on-brand "Coming Soon" state — never a bare placeholder.
 */
export function FeeDetailsScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const [fees, setFees] = useState<Fee[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [noMembership, setNoMembership] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; action: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const memberships = await api.get<{
        memberships: Array<{ association: { id: string; name: string } }>;
      }>("/me/memberships");
      const assoc = memberships.memberships[0]?.association;

      if (!assoc) {
        setNoMembership(true);
        setFees([]);
        setPayments([]);
        setLoading(false);
        return;
      }

      const [feesData, history] = await Promise.all([
        api
          .get<{ fees: Fee[] }>(`/associations/${assoc.id}/fees`)
          .catch(() => ({ fees: [] as Fee[] })),
        api
          .get<{ payments: Payment[] }>("/me/payment-history")
          .catch(() => ({ payments: [] as Payment[] })),
      ]);
      setFees(feesData.fees ?? []);
      setPayments(history.payments ?? []);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <ThemedScreen>
        <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }} edges={["bottom", "left", "right"]}>
          <ActivityIndicator color={colors.brand} />
        </SafeAreaView>
      </ThemedScreen>
    );
  }

  const comingSoon =
    noMembership || (fees !== null && fees.length === 0 && payments.length === 0);

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Dues &amp; Payments</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Only ever here in Settings — never on Home.
          </Text>

          {error ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 16,
                backgroundColor: colors.errorBg,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.error + "44",
              }}
            >
              <Icon name="alert" size={16} color={colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.captionBold, { color: colors.error }]}>{error.title}</Text>
                <Text style={[theme.typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 17 }]}>
                  {error.message} {error.action}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Coming Soon — on-brand, not a bare placeholder */}
          {comingSoon ? (
            <View
              style={{
                marginTop: 24,
                padding: 28,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: theme.mode === "pop" ? 2 : 1,
                borderColor: colors.borderStrong,
                alignItems: "center",
                ...(theme.mode === "pop"
                  ? { boxShadow: "4px 4px 0 #170B26", transform: [{ rotate: "1.2deg" }] }
                  : {}),
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  backgroundColor: colors.accent + "22",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.accent + "55",
                }}
              >
                <Icon name="wallet" size={30} color={colors.accent} />
              </View>
              <Text style={[theme.typography.h2, { color: colors.textPrimary, marginTop: 18, textAlign: "center" }]}>
                {noMembership ? "Join an association first" : "Dues are coming soon"}
              </Text>
              <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 23, maxWidth: 300 }]}>
                {noMembership
                  ? "Dues & payments open up once you join your association. They'll show up here the moment your association starts collecting."
                  : "Your association hasn't opened dues collection yet. When it does, your fees, payments and receipts will all live right here."}
              </Text>
              <View
                style={{
                  marginTop: 18,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, color: "#170B26" }}>
                  Coming soon
                </Text>
              </View>
            </View>
          ) : null}

          {/* Fees to pay */}
          {fees !== null && fees.length > 0 ? (
            <>
              <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 12 }]}>
                Dues
              </Text>
              <View style={{ gap: 10 }}>
                {fees.map((fee) => (
                  <View
                    key={fee.id}
                    style={{
                      padding: 16,
                      borderRadius: theme.radii.lg,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 13,
                          backgroundColor: colors.surfaceAlt,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name="creditCard" size={20} color={colors.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>{fee.name}</Text>
                        <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                          {fee.session} · due {new Date(fee.dueDate).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={[theme.typography.h3, { color: colors.textPrimary }]}>
                        ₦{(fee.amountKobo / 100).toLocaleString()}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => navigation.navigate("PayFee", { feeId: fee.id })}
                      style={{
                        marginTop: 12,
                        alignItems: "center",
                        paddingVertical: 11,
                        borderRadius: theme.radii.md,
                        backgroundColor: colors.accent,
                        borderWidth: theme.mode === "pop" ? 2 : 0,
                        borderColor: colors.borderStrong,
                      }}
                    >
                      <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 13, color: "#170B26" }}>
                        Pay dues
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Payment history */}
          {payments.length > 0 ? (
            <>
              <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 26, marginBottom: 12 }]}>
                Payment history
              </Text>
              <View style={{ gap: 10 }}>
                {payments.map((payment) => (
                  <Pressable
                    key={payment.id}
                    onPress={() => navigation.navigate("Receipt", { paymentId: payment.id })}
                    style={{
                      padding: 16,
                      borderRadius: theme.radii.md,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                          {payment.fee?.name ?? "Payment"}
                        </Text>
                        <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                          ₦{(payment.amountKobo / 100).toLocaleString()}
                        </Text>
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            backgroundColor:
                              payment.status === "successful"
                                ? colors.successBg
                                : payment.status === "pending"
                                  ? colors.warningBg
                                  : colors.errorBg,
                          }}
                        >
                          <Text
                            style={[
                              theme.typography.small,
                              {
                                color:
                                  payment.status === "successful"
                                    ? colors.success
                                    : payment.status === "pending"
                                      ? colors.warning
                                      : colors.error,
                                fontWeight: "700",
                              },
                            ]}
                          >
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {payment.receipt ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                        <Icon name="fileText" size={14} color={colors.brand} />
                        <Text style={[theme.typography.captionBold, { color: colors.brand }]}>View receipt</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {!comingSoon && fees !== null && fees.length === 0 ? (
            <View
              style={{
                marginTop: 24,
                padding: 20,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
              }}
            >
              <Icon name="wallet" size={26} color={colors.textMuted} />
              <Text style={[theme.typography.body, { color: colors.textMuted, marginTop: 10, textAlign: "center", maxWidth: 280, lineHeight: 22 }]}>
                No dues open yet — your association hasn't registered for this session.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
