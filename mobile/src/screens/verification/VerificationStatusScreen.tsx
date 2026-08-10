import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, Button, VerificationStatusSkeleton } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { VerificationRequest } from "../../types/api";

interface Props {
  navigation: { navigate: (s: string, p?: object) => void };
}

export function VerificationStatusScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<{ requests: VerificationRequest[] }>(
        "/me/verification",
      );
      setRequests(data.requests);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus]),
  );

  if (loading) return <VerificationStatusSkeleton />;

  const latestRequest = requests[0];

  const statusConfig = {
    pending: {
      icon: "⏳",
      color: colors.warning,
      bg: colors.warningBg,
      title: "Verification Pending",
      description:
        "Your document has been submitted and is awaiting review by an association executive. This usually takes 1-3 business days.",
    },
    approved: {
      icon: "✅",
      color: colors.success,
      bg: colors.successBg,
      title: "Identity Confirmed",
      description:
        "Your identity has been verified. You now have full access to all Matriq features.",
    },
    rejected: {
      icon: "❌",
      color: colors.error,
      bg: colors.errorBg,
      title: "Verification Rejected",
      description:
        "Your document was not accepted. Please review the reason below and re-submit with a clearer document.",
    },
  };

  const config = latestRequest
    ? statusConfig[latestRequest.status]
    : statusConfig.pending;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchStatus();
            }}
          />
        }
      >
        {/* Current Status Card */}
        <View style={[styles.statusCard, { backgroundColor: config.bg }]}>
          <Text style={styles.statusIcon}>{config.icon}</Text>
          <Text style={[styles.statusTitle, { color: config.color }]}>
            {config.title}
          </Text>
          <Text style={styles.statusDesc}>{config.description}</Text>

          {latestRequest?.rejectionReason && (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Rejection Reason:</Text>
              <Text style={styles.reasonText}>
                {latestRequest.rejectionReason}
              </Text>
            </View>
          )}

          {latestRequest?.reviewedAt && (
            <Text style={styles.reviewedAt}>
              Reviewed: {new Date(latestRequest.reviewedAt).toLocaleDateString()}
            </Text>
          )}
        </View>

        {/* Quick Info */}
        <Card title="About Verification">
          <Text style={styles.infoText}>
            To confirm your student identity, association executives review your
            uploaded document (student ID card or portal screenshot). This prevents
            impersonation and ensures only genuine students access association
            features.
          </Text>
        </Card>

        {/* Actions */}
        {(!latestRequest || latestRequest.status === "rejected") && (
          <Button
            title={latestRequest ? "Re-submit Document" : "Upload Document"}
            onPress={() => navigation.navigate("VerificationUpload")}
            size="lg"
          />
        )}

        {/* History */}
        {requests.length > 1 && (
          <Card title="Submission History">
            {requests.map((req, i) => (
              <View
                key={req.id}
                style={[
                  styles.historyRow,
                  i < requests.length - 1 && styles.historyBorder,
                ]}
              >
                <View style={styles.historyInfo}>
                  <Text style={styles.historyName}>
                    {req.documentOriginalName}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(req.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.historyBadge,
                    {
                      backgroundColor:
                        req.status === "approved"
                          ? colors.successBg
                          : req.status === "rejected"
                            ? colors.errorBg
                            : colors.warningBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.historyBadgeText,
                      {
                        color:
                          req.status === "approved"
                            ? colors.success
                            : req.status === "rejected"
                              ? colors.error
                              : colors.warning,
                      },
                    ]}
                  >
                    {req.status}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Matric status line from user profile */}
        <View style={styles.userStatusLine}>
          <Text style={styles.userStatusLabel}>Account Status: </Text>
          <Text
            style={[
              styles.userStatusValue,
              {
                color:
                  user?.matricStatus === "confirmed" ? colors.success : colors.warning,
              },
            ]}
          >
            {user?.matricStatus === "confirmed" ? "Confirmed" : "Provisional"}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg },
  statusCard: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: "center",
  },
  statusIcon: { fontSize: 48, marginBottom: spacing.sm },
  statusTitle: { ...typography.h2, marginBottom: spacing.sm, textAlign: "center" },
  statusDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  reasonBox: {
    marginTop: spacing.md,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: radii.md,
    padding: spacing.md,
    width: "100%",
  },
  reasonLabel: { ...typography.captionBold, color: colors.error, marginBottom: 2 },
  reasonText: { ...typography.body, color: colors.textPrimary },
  reviewedAt: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  infoText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  historyBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyInfo: { flex: 1 },
  historyName: { ...typography.captionBold, color: colors.textPrimary },
  historyDate: { ...typography.small, color: colors.textMuted },
  historyBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  historyBadgeText: {
    ...typography.small,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  userStatusLine: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  userStatusLabel: { ...typography.caption, color: colors.textMuted },
  userStatusValue: { ...typography.captionBold },
});
