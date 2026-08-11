#!/usr/bin/env node
/**
 * Matriq — demo seed (idempotent).
 *
 * Creates a realistic dev/demo dataset so the Admin Console, Association
 * Dashboard and mobile APK all have something to show:
 *   - 1 admin account            (admin@matriq.app)
 *   - 1 association              (NAISS — National Association of Indigent Students of Science)
 *   - 3 executives (president, treasurer, pro)
 *   - 8 verified members
 *   - 1 fee (2026/2027 dues)
 *   - 5 successful + 2 pending payments (internal refs, no gateway calls)
 *   - 2 announcements, 1 event with RSVPs
 *
 * Idempotent: safe to re-run. It deletes the seeded emails AND the NAISS
 * shortCode first, so it never duplicates — BUT it also erases any existing
 * data tied to that shortCode (real members/executives/payments included).
 * Only run this against a dev/demo database. Passwords below are for DEMO
 * ONLY — change them in production (override via SEED_*_PASSWORD env vars).
 * Run inside the backend container or locally:
 *
 *   docker exec -i matriq-backend node /app/scripts/seed-demo.js
 *   DATABASE_URL=... node backend/scripts/seed-demo.js
 *
 * All money is stored as integer kobo (minor units), never float.
 */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaPg } = require("@prisma/adapter-pg");

// Resolve the generated Prisma client from the repo layout OR the compiled
// dist/ layout (production container only ships dist/).
const base = process.env.SEED_BASE_DIR || path.resolve(__dirname, "..");
const clientCandidates = [
  path.join(base, "src/generated/prisma/client"),
  path.join(base, "dist/generated/prisma/client"),
];
const clientPath = clientCandidates.find((p) =>
  fs.existsSync(`${p}.js`) || fs.existsSync(`${p}.cjs`),
);
if (!clientPath) {
  console.error(
    `Prisma client not found. Set SEED_BASE_DIR (tried: ${clientCandidates.join(", ")})`,
  );
  process.exit(1);
}
const { PrismaClient } = require(clientPath);
const argon2 = require("argon2");

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://matriq:matriq@localhost:5432/matriq";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ── Demo credentials (printed at the end) ────────────────────────────
const ADMIN_EMAIL = "admin@matriq.app";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin@Matriq2026";
const EXEC_PASSWORD = process.env.SEED_EXEC_PASSWORD || "Exec@Matriq2026";
const MEMBER_PASSWORD = process.env.SEED_MEMBER_PASSWORD || "Member@Matriq2026";

const EXEC_EMAILS = {
  president: "president@matriq.app",
  treasurer: "treasurer@matriq.app",
  pro: "pro@matriq.app",
};

const MEMBER_EMAILS = Array.from({ length: 8 }, (_, i) =>
  `member${i + 1}@matriq.app`,
);

const SHORT_CODE = "NAISS";

async function hash(pw) {
  return argon2.hash(pw, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function main() {
  console.log("Seeding demo data…");

  // ── Cleanup (idempotency) ─────────────────────────────────────────
  const seededEmails = [ADMIN_EMAIL, ...Object.values(EXEC_EMAILS), ...MEMBER_EMAILS];

  const admin = await prisma.adminAccount.findUnique({ where: { email: ADMIN_EMAIL } });
  if (admin) await prisma.adminAccount.delete({ where: { id: admin.id } });

  const assoc = await prisma.association.findUnique({ where: { shortCode: SHORT_CODE } });
  if (assoc) {
    // Delete children in FK order.
    await prisma.announcementRead.deleteMany({ where: { announcement: { associationId: assoc.id } } });
    await prisma.announcement.deleteMany({ where: { associationId: assoc.id } });
    await prisma.eventRsvp.deleteMany({ where: { event: { associationId: assoc.id } } });
    await prisma.event.deleteMany({ where: { associationId: assoc.id } });
    await prisma.verificationRequest.deleteMany({ where: { associationId: assoc.id } });
    await prisma.aiDocument.deleteMany({ where: { associationId: assoc.id } });
    await prisma.receipt.deleteMany({
      where: { payment: { fee: { associationId: assoc.id } } },
    });
    await prisma.payment.deleteMany({ where: { fee: { associationId: assoc.id } } });
    await prisma.fee.deleteMany({ where: { associationId: assoc.id } });
    await prisma.associationExecutive.deleteMany({ where: { associationId: assoc.id } });
    await prisma.membership.deleteMany({ where: { associationId: assoc.id } });
    await prisma.association.delete({ where: { id: assoc.id } });
  }

  // Users referenced only by this seed.
  const users = await prisma.user.findMany({
    where: { email: { in: seededEmails.filter((e) => e !== ADMIN_EMAIL) } },
    select: { id: true },
  });
  for (const u of users) {
    await prisma.refreshToken.deleteMany({ where: { family: { userId: u.id } } });
    await prisma.refreshTokenFamily.deleteMany({ where: { userId: u.id } });
    await prisma.legalAcceptance.deleteMany({ where: { userId: u.id } });
    await prisma.aiQueryLog.deleteMany({ where: { userId: u.id } });
    await prisma.referral.deleteMany({
      where: { OR: [{ referrerId: u.id }, { referredUserId: u.id }] },
    });
    await prisma.user.delete({ where: { id: u.id } });
  }

  // ── Admin ─────────────────────────────────────────────────────────
  const adminAccount = await prisma.adminAccount.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: await hash(ADMIN_PASSWORD),
    },
  });
  console.log(`  ✓ admin ${ADMIN_EMAIL}`);

  // ── Association ───────────────────────────────────────────────────
  const association = await prisma.association.create({
    data: {
      name: "National Association of Indigent Students of Science",
      shortCode: SHORT_CODE,
      faculty: "Science",
      whatsappNumber: "+2348000000000",
      transparency: {
        breakdown: [
          { label: "Semester activities", percentage: 40 },
          { label: "Examination support", percentage: 30 },
          { label: "Association welfare", percentage: 30 },
        ],
      },
    },
  });
  console.log(`  ✓ association ${association.name} (${SHORT_CODE})`);

  // ── Executives (users + executive roles) ─────────────────────────
  const execUserIds = {};
  for (const [role, email] of Object.entries(EXEC_EMAILS)) {
    const user = await prisma.user.create({
      data: {
        fullName: `Exec ${role[0].toUpperCase()}${role.slice(1)} Matriq`,
        email,
        passwordHash: await hash(EXEC_PASSWORD),
        registrationType: "staylite",
        matricNumber: `NAISS/${role.toUpperCase()}001`,
        matricStatus: "confirmed",
        faculty: "Science",
        department: "Microbiology",
        level: "400",
        emailVerified: true,
        legalAcceptances: {
          create: [
            { documentType: "privacy_policy", documentVersion: "1.0", ipAddress: "0.0.0.0" },
            { documentType: "terms_and_conditions", documentVersion: "1.0", ipAddress: "0.0.0.0" },
          ],
        },
      },
    });
    const exec = await prisma.associationExecutive.create({
      data: {
        userId: user.id,
        associationId: association.id,
        role,
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, associationId: association.id, status: "live" },
    });
    execUserIds[role] = { userId: user.id, execId: exec.id };
    console.log(`  ✓ executive ${role} ${email}`);
  }

  // ── Members ───────────────────────────────────────────────────────
  const memberUserIds = [];
  const depts = ["Microbiology", "Chemistry", "Physics", "Biochemistry", "Botany", "Zoology", "Computer Science", "Mathematics"];
  for (let i = 0; i < MEMBER_EMAILS.length; i++) {
    const user = await prisma.user.create({
      data: {
        fullName: `Member ${i + 1} Matriq`,
        email: MEMBER_EMAILS[i],
        passwordHash: await hash(MEMBER_PASSWORD),
        registrationType: "staylite",
        matricNumber: `NAISS/20${22 + (i % 4)}/${String(i + 1).padStart(4, "0")}`,
        matricStatus: "confirmed",
        faculty: "Science",
        department: depts[i % depts.length],
        level: String(200 + (i % 4) * 100),
        emailVerified: true,
        legalAcceptances: {
          create: [
            { documentType: "privacy_policy", documentVersion: "1.0", ipAddress: "0.0.0.0" },
            { documentType: "terms_and_conditions", documentVersion: "1.0", ipAddress: "0.0.0.0" },
          ],
        },
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, associationId: association.id, status: "live" },
    });
    memberUserIds.push(user.id);
    console.log(`  ✓ member ${MEMBER_EMAILS[i]}`);
  }

  // ── Fee ───────────────────────────────────────────────────────────
  const fee = await prisma.fee.create({
    data: {
      associationId: association.id,
      name: "2026/2027 Academic Session Dues",
      amountKobo: 500000, // ₦5,000
      currency: "NGN",
      dueDate: new Date("2026-12-15"),
      session: "2026/2027",
    },
  });
  console.log(`  ✓ fee ${fee.name} (₦5,000)`);

  // ── Payments (5 successful + 2 pending) ───────────────────────────
  const payerIds = [...memberUserIds.slice(0, 5)];
  for (let i = 0; i < payerIds.length; i++) {
    const successful = i < 5; // first 5 paid
    await prisma.payment.create({
      data: {
        userId: payerIds[i],
        feeId: fee.id,
        amountKobo: 500000,
        status: successful ? "successful" : "pending",
        internalReference: `SEED-${fee.id.slice(0, 8)}-${i + 1}`,
        method: "card",
        paidAt: successful ? new Date(Date.now() - (i + 1) * 86400000) : null,
      },
    });
  }
  // 2 more pending from remaining members
  for (const [i, uid] of memberUserIds.slice(5, 7).entries()) {
    await prisma.payment.create({
      data: {
        userId: uid,
        feeId: fee.id,
        amountKobo: 500000,
        status: "pending",
        internalReference: `SEED-${fee.id.slice(0, 8)}-P${i + 1}`,
      },
    });
  }
  console.log("  ✓ 7 payments (5 successful, 2 pending)");

  // ── Announcements ─────────────────────────────────────────────────
  const presExecId = execUserIds.president.execId;
  await prisma.announcement.create({
    data: {
      associationId: association.id,
      authorExecutiveId: presExecId,
      title: "Welcome to the 2026/2027 Session 🎉",
      body: "We are excited to welcome all members to a new academic session. " +
        "Dues payment for the session is now open — please pay before December 15, 2026.",
      pinned: true,
    },
  });
  await prisma.announcement.create({
    data: {
      associationId: association.id,
      authorExecutiveId: execUserIds.pro.execId,
      title: "Matriq AI Study Companion is live",
      body: "Ask questions about your courses, past questions and handouts — " +
        "the AI companion is available in the mobile app for all verified members.",
      pinned: false,
    },
  });
  console.log("  ✓ 2 announcements");

  // ── Event + RSVPs ─────────────────────────────────────────────────
  const event = await prisma.event.create({
    data: {
      associationId: association.id,
      authorExecutiveId: presExecId,
      title: "Science Faculty Career Fair 2026",
      description: "Meet industry mentors, explore internships and graduate placements.",
      location: "Faculty of Science Lecture Hall A",
      eventDate: new Date("2026-09-20T10:00:00.000Z"),
    },
  });
  for (const uid of memberUserIds.slice(0, 4)) {
    await prisma.eventRsvp.create({ data: { eventId: event.id, userId: uid } });
  }
  console.log("  ✓ 1 event + 4 RSVPs");

  console.log("\n✅ Seed complete.");
  console.log("──────────────────────────────────────────────");
  console.log("Admin Console (matriq-ebon.vercel.app):");
  console.log(`  email:    ${ADMIN_EMAIL}`);
  console.log(`  password: ${ADMIN_PASSWORD}`);
  console.log("Association Dashboard (matriq-dashboard.vercel.app):");
  for (const [role, email] of Object.entries(EXEC_EMAILS)) {
    console.log(`  ${role}: ${email} / ${EXEC_PASSWORD}`);
  }
  console.log("Mobile app (members):");
  console.log(`  ${MEMBER_EMAILS[0]} / ${MEMBER_PASSWORD} (8 total)`);
  console.log("──────────────────────────────────────────────");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
