import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, spacing, radii } from "../theme/colors";
import {
  Skeleton,
  SkeletonCircle,
  SkeletonText,
  SkeletonCard,
} from "./Skeleton";

// ── Screen-shaped skeleton layouts ──────────────────────────────────────────
// Each layout mirrors the block structure of its real screen (header, cards,
// list rows, buttons) so the transition from loading → content is seamless.

const screenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});

// ── Dashboard ───────────────────────────────────────────────────────────────

function SkeletonFeeRow() {
  return (
    <SkeletonCard>
      <SkeletonText width="55%" height={15} />
      <SkeletonText width="30%" height={11} style={{ marginTop: 4 }} />
      <View style={[screenStyles.rowBetween, { marginTop: spacing.md }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonText width={96} height={18} />
          <SkeletonText width="75%" height={11} />
        </View>
        <Skeleton width={84} height={34} borderRadius={radii.md} />
      </View>
    </SkeletonCard>
  );
}

export function DashboardSkeleton() {
  return (
    <View style={screenStyles.screen}>
      {/* Header: greeting + avatar */}
      <View style={[screenStyles.rowBetween, { marginBottom: spacing.lg, marginTop: spacing.sm }]}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <SkeletonText width="55%" height={22} />
          <SkeletonText width="38%" height={12} />
        </View>
        <SkeletonCircle size={48} />
      </View>

      {/* Verification banner */}
      <View style={styles.banner}>
        <Skeleton width={30} height={30} borderRadius={radii.md} />
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
          <Skeleton width={72} height={22} borderRadius={radii.full} />
          <Skeleton width={86} height={22} borderRadius={radii.full} />
        </View>
      </SkeletonCard>

      {/* Quick actions */}
      <SkeletonText width={120} height={16} style={styles.sectionTitle} />
      <View style={styles.actionsGrid}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.actionCard}>
            <Skeleton width={30} height={30} borderRadius={radii.md} />
            <SkeletonText width={46} height={11} />
          </View>
        ))}
      </View>

      {/* Upcoming dues */}
      <SkeletonText width={130} height={16} style={styles.sectionTitle} />
      <SkeletonFeeRow />
      <SkeletonFeeRow />
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
  return (
    <View style={screenStyles.screen}>
      <SkeletonText width={titleWidth} height={24} style={styles.title} />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i}>
          <SkeletonText width="58%" height={15} />
          <SkeletonText width="34%" height={11} style={{ marginTop: 4 }} />
          <SkeletonText width="100%" height={12} style={{ marginTop: spacing.sm }} />
          <SkeletonText width="72%" height={12} style={{ marginTop: 6 }} />
          <View style={[screenStyles.rowBetween, { marginTop: spacing.md }]}>
            <SkeletonText width={64} height={11} />
            <Skeleton width={56} height={20} borderRadius={radii.full} />
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

// ── Referrals ───────────────────────────────────────────────────────────────

export function ReferralsSkeleton() {
  return (
    <View style={screenStyles.screen}>
      <SkeletonText width={110} height={24} style={styles.title} />

      {/* Ambassador / progress card */}
      <SkeletonCard>
        <SkeletonText width="62%" height={16} />
        <SkeletonText width="48%" height={11} style={{ marginTop: 4 }} />
        <SkeletonText width="90%" height={13} style={{ marginTop: spacing.md }} />
        <Skeleton width="100%" height={8} borderRadius={radii.full} style={{ marginTop: spacing.md }} />
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
        <Skeleton width="100%" height={44} borderRadius={radii.md} />
      </SkeletonCard>
    </View>
  );
}

// ── Receipt ─────────────────────────────────────────────────────────────────

export function ReceiptSkeleton() {
  return (
    <View style={screenStyles.screen}>
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
          <Skeleton width={110} height={110} borderRadius={radii.md} style={{ marginVertical: spacing.md }} />
          <Skeleton width={80} height={20} borderRadius={radii.full} />
        </View>
        <Skeleton width="100%" height={1} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={[screenStyles.rowBetween, { paddingVertical: spacing.xs, marginTop: 6 }]}>
            <SkeletonText width={64} height={11} />
            <SkeletonText width={110} height={11} />
          </View>
        ))}
      </SkeletonCard>

      {/* Share button */}
      <Skeleton width="100%" height={48} borderRadius={radii.md} />
    </View>
  );
}

// ── Verification status ─────────────────────────────────────────────────────

export function VerificationStatusSkeleton() {
  return (
    <View style={screenStyles.screen}>
      {/* Status card */}
      <View style={styles.statusCard}>
        <SkeletonCircle size={48} />
        <SkeletonText width={170} height={20} style={{ marginTop: spacing.md }} />
        <SkeletonText width="90%" height={12} style={{ marginTop: spacing.sm }} />
        <SkeletonText width="70%" height={12} style={{ marginTop: 6 }} />
      </View>

      {/* Info card */}
      <SkeletonCard>
        <SkeletonText width="55%" height={15} />
        <SkeletonText width="100%" height={12} style={{ marginTop: spacing.sm }} />
        <SkeletonText width="100%" height={12} style={{ marginTop: 6 }} />
        <SkeletonText width="82%" height={12} style={{ marginTop: 6 }} />
      </SkeletonCard>

      {/* Upload button */}
      <Skeleton width="100%" height={50} borderRadius={radii.md} />

      {/* History */}
      <SkeletonText width={140} height={16} style={styles.sectionTitle} />
      {Array.from({ length: 2 }).map((_, i) => (
        <SkeletonCard key={i}>
          <View style={screenStyles.rowBetween}>
            <View style={{ flex: 1, gap: 5 }}>
              <SkeletonText width="60%" height={13} />
              <SkeletonText width="40%" height={11} />
            </View>
            <Skeleton width={70} height={20} borderRadius={radii.full} />
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

// ── Shared styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.md },
  badgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#F0D060",
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.lg,
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
    marginVertical: spacing.md,
  },
  receiptCard: {
    borderWidth: 2,
    borderColor: colors.primary + "20",
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  receiptHeader: { alignItems: "center", marginBottom: spacing.md },
  qrArea: { alignItems: "center", marginVertical: spacing.md },
  statusCard: {
    backgroundColor: colors.warningBg,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: "center",
  },
});
