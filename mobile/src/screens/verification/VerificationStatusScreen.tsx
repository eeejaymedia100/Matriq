import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Card, Button, VerificationStatusSkeleton } from "../../components";
import { Icon, type IconName } from "../../components/icons";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { VerificationRequest } from "../../types/api";
import type { MatriqTheme, MatriqThemeColors } from "../../theme/themes";

interface Props {
  navigation: { navigate: (s: string, p?: object) => void };
}

export function VerificationStatusScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);

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

  const statusConfig: Record<
    string,
    { icon: IconName; color: string; bg: string; title: string; description: string }
  > = {
    pending: {
      icon: "clock",
      color: colors.warning,
      bg: colors.warningBg,
      title: "Verification Pending",
      description:
        "Your document has been submitted and is awaiting review by an association executive. This usually takes 1-3 business days.",
    },
    approved: {
      icon: "check",
      color: colors.success,
      bg: colors.successBg,
      title: "Identity Confirmed",
      description:
        "Your identity has been verified. You now have full access to all Matriq features.",
    },
    rejected: {
      icon: "x",
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
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
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
            <Icon name={config.icon} size={48} color={config.color} />
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
              To confirm your student identity, association executives review
              your uploaded document (student ID card or portal screenshot).
              This prevents impersonation and ensures only genuine students
              access association features.
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
                    user?.matricStatus === "confirmed"
                      ? colors.success
                      : colors.warning,
                },
              ]}
            >
              {user?.matricStatus === "confirmed" ? "Confirmed" : "Provisional"}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}

function makeStyles(theme: MatriqTheme, colors: MatriqThemeColors) {
  return StyleSheet.create({
    container: { padding: theme.spacing.lg },
    statusCard: {
      borderRadius: theme.radii.xl,
      padding: theme.spacing.xl,
      marginBottom: theme.spacing.lg,
      alignItems: "center",
    },
    statusTitle: {
      fontFamily: theme.typography.h2.fontFamily,
      fontSize: theme.typography.h2.fontSize,
      lineHeight: theme.typography.h2.lineHeight,
      marginBottom: theme.spacing.sm,
      textAlign: "center",
    },
    statusDesc: {
      fontFamily: theme.typography.body.fontFamily,
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
      color: colors.textSecondary,
      textAlign: "center",
    },
    reasonBox: {
      marginTop: theme.spacing.md,
      backgroundColor: colors.surfaceAlt,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      width: "100%",
    },
    reasonLabel: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.error,
      marginBottom: 2,
    },
    reasonText: {
      fontFamily: theme.typography.body.fontFamily,
      fontSize: theme.typography.body.fontSize,
      color: colors.textPrimary,
    },
    reviewedAt: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      color: colors.textMuted,
      marginTop: theme.spacing.md,
    },
    infoText: {
      fontFamily: theme.typography.body.fontFamily,
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
      color: colors.textSecondary,
    },
    historyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: theme.spacing.sm,
    },
    historyBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    historyInfo: { flex: 1 },
    historyName: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.textPrimary,
    },
    historyDate: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      color: colors.textMuted,
    },
    historyBadge: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderRadius: 999,
    },
    historyBadgeText: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      fontWeight: "600",
      textTransform: "capitalize",
    },
    userStatusLine: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: theme.spacing.lg,
      padding: theme.spacing.md,
    },
    userStatusLabel: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      color: colors.textMuted,
    },
    userStatusValue: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
    },
  });
}
