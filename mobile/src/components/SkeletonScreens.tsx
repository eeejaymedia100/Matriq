import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import {
  Skeleton,
  SkeletonCircle,
  SkeletonText,
  SkeletonCard,
} from "./Skeleton";
import type { MatriqTheme, MatriqThemeColors } from "../theme/themes";

// ── Screen-shaped skeleton layouts ──────────────────────────────────────────
// Each layout mirrors the block structure of its real screen (header, cards,
// list rows, buttons) so the transition from loading → content is seamless.
// Theme-aware: surfaces + backgrounds follow the active theme.

function SkeletonFeeRow({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return (
    <SkeletonCard>
      <SkeletonText width="55%" height={15} />
      <SkeletonText width="30%" height={11} style={{ marginTop: 4 }} />
      <View style={[styles.rowBetween, { marginTop: 16 }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonText width={96} height={18} />
          <SkeletonText width="75%" height={11} />
        </View>
        <Skeleton width={84} height={34} borderRadius={10} />
      </View>
    </SkeletonCard>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export function DashboardSkeleton() {
  const { theme } = useTheme();
  const styles = makeStyles(theme, theme.colors);

  return (
    <View style={styles.screen}>
      {/* Header: greeting + avatar */}
      <View style={[styles.rowBetween, { marginBottom: 24, marginTop: 8 }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <SkeletonText width="55%" height={22} />
          <SkeletonText width="38%" height={12} />
        </View>
        <SkeletonCircle size={48} />
      </View>

      {/* Verification banner */}
      <View style={styles.banner}>
        <Skeleton width={30} height={30} borderRadius={10} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonText width="68%" height={13} />
          <SkeletonText width="48%" height={11} />
        </View>
        <SkeletonText width={18} height={18} />
      </View>

      {/* Membership card */}
      <SkeletonCard>
        <SkeletonText width="62%" height={16} />
        <SkeletonText width="40%" height={11} style={{ marginTop: 4 }} />
        <View style={styles.badgeRow}>
          <Skeleton width={72} height={22} borderRadius={999} />
          <Skeleton width={86} height={22} borderRadius={999} />
        </View>
      </SkeletonCard>

      {/* Quick actions */}
      <SkeletonText width={120} height={16} style={styles.sectionTitle} />
      <View style={styles.actionsGrid}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.actionCard}>
            <Skeleton width={30} height={30} borderRadius={10} />
            <SkeletonText width={46} height={11} />
          </View>
        ))}
      </View>

      {/* Upcoming dues */}
      <SkeletonText width={130} height={16} style={styles.sectionTitle} />
      <SkeletonFeeRow styles={styles} />
      <SkeletonFeeRow styles={styles} />
    </View>
  );
}

// ── Generic list screen (Announcements / Events / Dues & Payments) ──────────

export function ListScreenSkeleton({
  rows = 4,
  titleWidth = 160,
}: {
  rows?: number;
  titleWidth?: number;
}) {
  const { theme } = useTheme();
  const styles = makeStyles(theme, theme.colors);

  return (
    <View style={styles.screen}>
      <SkeletonText width={titleWidth} height={24} style={styles.title} />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i}>
          <SkeletonText width="58%" height={15} />
          <SkeletonText width="34%" height={11} style={{ marginTop: 4 }} />
          <SkeletonText width="100%" height={12} style={{ marginTop: 8 }} />
          <SkeletonText width="72%" height={12} style={{ marginTop: 6 }} />
          <View style={[styles.rowBetween, { marginTop: 16 }]}>
            <SkeletonText width={64} height={11} />
            <Skeleton width={56} height={20} borderRadius={999} />
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

// ── Referrals ───────────────────────────────────────────────────────────────

export function ReferralsSkeleton() {
  const { theme } = useTheme();
  const styles = makeStyles(theme, theme.colors);

  return (
    <View style={styles.screen}>
      <SkeletonText width={110} height={24} style={styles.title} />

      {/* Ambassador / progress card */}
      <SkeletonCard>
        <SkeletonText width="62%" height={16} />
        <SkeletonText width="48%" height={11} style={{ marginTop: 4 }} />
        <SkeletonText width="90%" height={13} style={{ marginTop: 16 }} />
        <Skeleton width="100%" height={8} borderRadius={999} style={{ marginTop: 16 }} />
      </SkeletonCard>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <SkeletonCard style={styles.statCard}>
          <SkeletonText width={44} height={22} />
          <SkeletonText width={72} height={11} style={{ marginTop: 6 }} />
        </SkeletonCard>
        <SkeletonCard style={styles.statCard}>
          <SkeletonText width={44} height={22} />
          <SkeletonText width={72} height={11} style={{ marginTop: 6 }} />
        </SkeletonCard>
      </View>

      {/* Share code card */}
      <SkeletonCard>
        <SkeletonText width="45%" height={15} />
        <View style={styles.codeBox}>
          <SkeletonText width={120} height={22} />
        </View>
        <Skeleton width="100%" height={44} borderRadius={10} />
      </SkeletonCard>
    </View>
  );
}

// ── Receipt ─────────────────────────────────────────────────────────────────

export function ReceiptSkeleton() {
  const { theme } = useTheme();
  const styles = makeStyles(theme, theme.colors);

  return (
    <View style={styles.screen}>
      <SkeletonText width={90} height={24} style={styles.title} />

      {/* Receipt card */}
      <SkeletonCard style={styles.receiptCard}>
        <View style={styles.receiptHeader}>
          <SkeletonText width={90} height={22} />
          <SkeletonText width={150} height={12} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width="100%" height={1} />
        <View style={styles.qrArea}>
          <SkeletonText width={130} height={12} />
          <Skeleton width={110} height={110} borderRadius={10} style={{ marginVertical: 16 }} />
          <Skeleton width={80} height={20} borderRadius={999} />
        </View>
        <Skeleton width="100%" height={1} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={[styles.rowBetween, { paddingVertical: 4, marginTop: 6 }]}>
            <SkeletonText width={64} height={11} />
            <SkeletonText width={110} height={11} />
          </View>
        ))}
      </SkeletonCard>

      {/* Share button */}
      <Skeleton width="100%" height={48} borderRadius={10} />
    </View>
  );
}

// ── Verification status ─────────────────────────────────────────────────────

export function VerificationStatusSkeleton() {
  const { theme } = useTheme();
  const styles = makeStyles(theme, theme.colors);

  return (
    <View style={styles.screen}>
      {/* Status card */}
      <View style={styles.statusCard}>
        <SkeletonCircle size={48} />
        <SkeletonText width={170} height={20} style={{ marginTop: 16 }} />
        <SkeletonText width="90%" height={12} style={{ marginTop: 8 }} />
        <SkeletonText width="70%" height={12} style={{ marginTop: 6 }} />
      </View>

      {/* Info card */}
      <SkeletonCard>
        <SkeletonText width="55%" height={15} />
        <SkeletonText width="100%" height={12} style={{ marginTop: 8 }} />
        <SkeletonText width="100%" height={12} style={{ marginTop: 6 }} />
        <SkeletonText width="82%" height={12} style={{ marginTop: 6 }} />
      </SkeletonCard>

      {/* Upload button */}
      <Skeleton width="100%" height={50} borderRadius={10} />

      {/* History */}
      <SkeletonText width={140} height={16} style={styles.sectionTitle} />
      {Array.from({ length: 2 }).map((_, i) => (
        <SkeletonCard key={i}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, gap: 5 }}>
              <SkeletonText width="60%" height={13} />
              <SkeletonText width="40%" height={11} />
            </View>
            <Skeleton width={70} height={20} borderRadius={999} />
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

// ── Shared styles (theme-aware) ─────────────────────────────────────────────

function makeStyles(theme: MatriqTheme, colors: MatriqThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, padding: theme.spacing.lg },
    rowBetween: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: { marginBottom: theme.spacing.md },
    sectionTitle: { marginTop: theme.spacing.lg, marginBottom: theme.spacing.md },
    badgeRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.warningBg,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: colors.warning,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
      marginBottom: theme.spacing.lg,
    },
    actionsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
    },
    actionCard: {
      width: "30%",
      aspectRatio: 1,
      backgroundColor: colors.surface,
      borderRadius: theme.radii.lg,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.xs,
      shadowColor: colors.textPrimary,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
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
      marginVertical: theme.spacing.md,
    },
    receiptCard: {
      borderWidth: 2,
      borderColor: colors.brand + "20",
      borderRadius: theme.radii.xl,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },
    receiptHeader: { alignItems: "center", marginBottom: theme.spacing.md },
    qrArea: { alignItems: "center", marginVertical: theme.spacing.md },
    statusCard: {
      backgroundColor: colors.warningBg,
      borderRadius: theme.radii.xl,
      padding: theme.spacing.xl,
      marginBottom: theme.spacing.lg,
      alignItems: "center",
    },
  });
}
