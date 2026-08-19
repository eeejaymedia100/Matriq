import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, DashboardSkeleton } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import { useFocusEffect } from "@react-navigation/native";
import type { Association, Fee, Payment } from "../../types/api";

interface DashboardData {
  associations: Association[];
  fees: Fee[];
  recentPayments: Payment[];
  badgeCount: number;
}

export function DashboardScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user, logout } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const [memberships, badges] = await Promise.all([
        api.get<{ memberships: Array<{ association: Association }> }>("/me/memberships"),
        api.get<{ badges: string[] }>("/me/badges"),
      ]);

      const associations = memberships.memberships.map((m) => m.association);
      const recentPayments: Payment[] = [];

      // Fetch fees for first association
      let fees: Fee[] = [];
      if (associations.length > 0) {
        try {
          fees = await api.get<Fee[]>(`/associations/${associations[0].id}/fees`);
        } catch { /* no fees yet */ }
      }

      setData({
        associations,
        fees,
        recentPayments,
        badgeCount: badges.badges.length,
      });
    } catch {
      // Dashboard fetch failed — user might need to re-login
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [fetchDashboard]),
  );

  if (loading) return <DashboardSkeleton />;

  const association = data?.associations[0];

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDashboard(); }} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Hello, {user?.fullName?.split(" ")[0] ?? "Student"}
            </Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("Profile")} style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.fullName?.charAt(0)?.toUpperCase() ?? "S"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Verification Status */}
        {user?.matricStatus === "provisional" && (
          <TouchableOpacity
            onPress={() => navigation.navigate("VerificationStatus")}
            style={styles.verificationBanner}
          >
            <View style={styles.verificationBannerInner}>
              <Ionicons name="hourglass-outline" size={26} color="#8B6914" />
              <View style={{ flex: 1 }}>
                <Text style={styles.verificationTitle}>Identity Verification Pending</Text>
                <Text style={styles.verificationSub}>
                  Upload your student ID to unlock full access
                </Text>
              </View>
              <Text style={styles.verificationArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Membership Card */}
        {association ? (
          <Card
            title={association.name}
            subtitle={`${association.shortCode} · ${association.faculty}`}
          >
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: colors.successBg }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>Active</Text>
              </View>
              {user?.matricStatus === "confirmed" && (
                <View style={[styles.badge, { backgroundColor: colors.successBg }]}>
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                    <Text style={[styles.badgeText, { color: colors.success }]}>Verified</Text>
                  </View>
                </View>
              )}
              {user?.matricStatus === "provisional" && (
                <View style={[styles.badge, { backgroundColor: "#FFF8E1" }]}>
                  <Text style={[styles.badgeText, { color: "#E6A817" }]}>Provisional</Text>
                </View>
              )}
              {data && data.badgeCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primaryLight + "20" }]}>
                  <Text style={[styles.badgeText, { color: colors.primary }]}>
                    {data.badgeCount} Badge{data.badgeCount > 1 ? "s" : ""}
                  </Text>
                </View>
              )}
            </View>
          </Card>
        ) : (
          <Card title="No Association">
            <Text style={styles.emptyText}>
              You haven't joined an association yet. Browse available associations to get started.
            </Text>
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => navigation.navigate("Explore")}
            >
              <Text style={styles.joinBtnText}>Browse Associations</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("Fees")}
          >
            <Ionicons name="wallet-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>Dues</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("Fees")}
          >
            <Ionicons name="receipt-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>Receipts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("VerificationStatus")}
          >
            <Ionicons name="shield-checkmark-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>Verify ID</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("Announcements")}
          >
            <Ionicons name="megaphone-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>News</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("Events")}
          >
            <Ionicons name="calendar-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>Events</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("AI")}
          >
            <Ionicons name="sparkles-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>AI Tutor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("Referrals")}
          >
            <Ionicons name="link-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>Refer</Text>
          </TouchableOpacity>
        </View>

        {/* Dues Summary */}
        {data && data.fees.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            {data.fees.map((fee) => {
              const daysLeft = Math.ceil(
                (new Date(fee.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
              );
              return (
                <Card key={fee.id} title={fee.name} subtitle={`${fee.session}`}>
                  <View style={styles.feeRow}>
                    <View>
                      <Text style={styles.feeAmount}>
                        ₦{(fee.amountKobo / 100).toLocaleString()}
                      </Text>
                      <Text style={styles.feeDue}>
                        Due: {new Date(fee.dueDate).toLocaleDateString()}
                        {daysLeft > 0 ? ` (${daysLeft}d left)` : " (Overdue!)"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.payBtn}
                      onPress={() => navigation.navigate("PayFee", { feeId: fee.id })}
                    >
                      <Text style={styles.payBtnText}>Pay Now</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </>
        )}

        {/* Services */}
        {association?.whatsappNumber && (
          <Card title="Association Services" subtitle="Contact via WhatsApp">
            <View style={styles.serviceRow}>
              <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.serviceText}>
                WhatsApp: {association.whatsappNumber}
              </Text>
            </View>
          </Card>
        )}

        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  greeting: { ...typography.h1, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typography.h3, color: colors.textOnPrimary },
  badgeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  badgeText: { ...typography.captionBold },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  emptyText: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  joinBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  joinBtnText: { ...typography.bodyBold, color: colors.textOnPrimary },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionCard: {
    width: "30%",
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: { fontSize: 28 },
  actionLabel: { ...typography.captionBold, color: colors.textSecondary },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feeAmount: { ...typography.h2, color: colors.textPrimary },
  feeDue: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  payBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  payBtnText: { ...typography.captionBold, color: colors.textOnPrimary },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  serviceText: { ...typography.body, color: colors.textSecondary },
  logoutBtn: { alignSelf: "center", marginTop: spacing.lg, padding: spacing.md },
  logoutText: { ...typography.body, color: colors.error },
  verificationBanner: {
    backgroundColor: "#FFF8E1",
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "#F0D060",
  },
  verificationBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  verificationIcon: { fontSize: 28 },
  verificationTitle: { ...typography.bodyBold, color: "#8B6914" },
  verificationSub: { ...typography.caption, color: "#A08020", marginTop: 2 },
  verificationArrow: { fontSize: 20, color: "#8B6914" },
});
