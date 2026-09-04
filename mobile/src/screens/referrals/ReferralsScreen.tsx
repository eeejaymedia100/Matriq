import React, { useState, useCallback } from "react";
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
import { Card, Button, ReferralsSkeleton } from "../../components";
import { api } from "../../api/client";
import { useFocusEffect } from "@react-navigation/native";
import type { ReferralInfo } from "../../types/api";

export function ReferralsScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);
  const [data, setData] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const result = await api.get<ReferralInfo>("/me/referrals");
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch]),
  );

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on Matriq — the student association app for DELSU!\n\nUse my invite code: ${data?.shareCode ?? "MATRIQ"}\n\nDownload now and stay connected with your association.`,
      });
    } catch {
      // cancelled
    }
  };

  if (loading) return <ReferralsSkeleton />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Referrals</Text>

        {/* Ambassador Card */}
        {data?.isAmbassador ? (
          <Card
            title="Ambassador Status"
            subtitle="You're a Matriq Ambassador!"
          >
            <View style={styles.ambassadorBox}>
              <Ionicons name="trophy" size={22} color={colors.success} />
              <Text style={styles.ambassadorText}>
                You've referred {data.totalReferrals}+ students! Enjoy exclusive perks.
              </Text>
            </View>
          </Card>
        ) : (
          <Card
            title="Be an Ambassador"
            subtitle="Refer 10+ students to unlock Ambassador status"
          >
            <View style={styles.progressBox}>
              <Ionicons name="flag" size={20} color={colors.brand} style={styles.progressIcon} />
              <Text style={styles.progressText}>
                {data?.completedReferrals ?? 0} / 10 referrals completed
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min((data?.completedReferrals ?? 0) * 10, 100)}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <Card title={`${data?.totalReferrals ?? 0}`} subtitle="Total Referrals" style={styles.statCard} />
          <Card title={`${data?.completedReferrals ?? 0}`} subtitle="Completed" style={styles.statCard} />
        </View>

        {/* Share */}
        <Card title="Your Share Code">
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{data?.shareCode ?? "MATRIQ"}</Text>
          </View>
          <Button title="Share Invite Link" onPress={handleShare} variant="primary" />
        </Card>

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
      marginBottom: theme.spacing.md,
    },
    ambassadorBox: {
      backgroundColor: colors.successBg,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    ambassadorText: {
      ...theme.typography.body,
      color: colors.success,
      textAlign: "center",
    },
    progressBox: { marginTop: theme.spacing.sm },
    progressIcon: { alignSelf: "center", marginBottom: theme.spacing.sm },
    progressText: {
      ...theme.typography.captionBold,
      color: colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    progressBar: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: theme.radii.pill,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.brand,
      borderRadius: theme.radii.pill,
    },
    statsRow: {
      flexDirection: "row",
      gap: theme.spacing.md,
    },
    statCard: { flex: 1, alignItems: "center" },
    codeBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      alignItems: "center",
      marginBottom: theme.spacing.md,
    },
    codeText: { ...theme.typography.h2, color: colors.brand, letterSpacing: 4 },
  });
}
