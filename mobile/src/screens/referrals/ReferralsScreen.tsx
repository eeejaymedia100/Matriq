import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Share,
} from "react-native";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, Button, ReferralsSkeleton } from "../../components";
import { api } from "../../api/client";
import { useFocusEffect } from "@react-navigation/native";
import type { ReferralInfo } from "../../types/api";

export function ReferralsScreen() {
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
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Referrals</Text>

        {/* Ambassador Card */}
        {data?.isAmbassador ? (
          <Card
            title="🏆 Ambassador Status"
            subtitle="You're a Matriq Ambassador!"
          >
            <View style={styles.ambassadorBox}>
              <Text style={styles.ambassadorText}>
                You've referred {data.totalReferrals}+ students! Enjoy exclusive perks.
              </Text>
            </View>
          </Card>
        ) : (
          <Card
            title="🎯 Be an Ambassador"
            subtitle="Refer 10+ students to unlock Ambassador status"
          >
            <View style={styles.progressBox}>
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

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  ambassadorBox: {
    backgroundColor: colors.successBg,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  ambassadorText: { ...typography.body, color: colors.success },
  progressBox: { marginTop: spacing.sm },
  progressText: { ...typography.captionBold, color: colors.textSecondary, marginBottom: spacing.sm },
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: radii.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: radii.full,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statCard: { flex: 1, alignItems: "center" },
  codeBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  codeText: { ...typography.h2, color: colors.primary, letterSpacing: 4 },
});
