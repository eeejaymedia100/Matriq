---
name: matriq-rbac-patterns
description: Use whenever creating or modifying any backend API endpoint. Ensures role-based access control is enforced consistently via NestJS guards rather than ad-hoc checks scattered per-endpoint, per the RBAC model defined in security.md and data-model.md.
---

# Matriq RBAC Patterns

## The five roles

`student` · `treasurer` · `president` · `pro` · `admin`

Treasurer/President/P.R.O. are always scoped to a specific `association_id` — a role check alone
is never sufficient; every executive-only endpoint must also verify the resource being acted on
belongs to that executive's own association.

## The pattern every endpoint must follow

1. **Authentication guard first** — verifies the JWT, attaches the authenticated user/executive
   to the request. No endpoint skips this except the explicitly public auth endpoints
   (`register`, `login`, `refresh`) and the signature-verified payment webhook.
2. **Role guard second** — a declarative `@Roles(...)` decorator on the route handler, checked by
   a shared `RolesGuard`. Never an inline `if (user.role !== 'admin') throw ...` written per
   endpoint — that's exactly the pattern that lets one endpoint quietly drift out of sync with
   the rest.
3. **Association-scoping check third**, for any executive-role endpoint — verify
   `request.params.associationId` (or the resource's derived association) matches the
   authenticated executive's own `association_id`. This cannot be a guard alone in most cases
   (it depends on the specific resource being loaded) — implement it as an explicit check at the
   top of the handler or service method, and never skip it because "the guard already checked
   the role."

## Example shape (adapt to actual NestJS conventions established in the codebase)

```ts
@Roles('treasurer', 'president', 'pro')
@UseGuards(JwtAuthGuard, RolesGuard)
@Post('associations/:associationId/announcements')
async createAnnouncement(
  @Param('associationId') associationId: string,
  @CurrentExecutive() executive: ExecutiveContext,
  @Body() dto: CreateAnnouncementDto,
) {
  if (executive.associationId !== associationId) {
    throw new ForbiddenException();
  }
  // ... proceed, and audit-log this action per security.md
}
```

## Non-negotiables

- **Never trust a role or association ID sent in the request body or query string** for
  authorization decisions — only the value derived from the authenticated session/token.
- **Every executive/admin action that changes state gets an audit log entry** (`audit_logs`
  table, per `data-model.md`) — write the log call in the same method as the action, not as an
  afterthought elsewhere.
- **Admin is a fully separate authentication path** (`admin_accounts` table, its own login
  endpoint) — never a role value that could theoretically be granted through the same flow as
  student/executive roles. There is no code path where a `PATCH` to a user record can result in
  `role = admin`.
- **Write the "wrong role rejected" test alongside the "right role accepted" test**, every time —
  a test suite that only checks the happy path doesn't actually verify the RBAC boundary exists.

## When you're not sure

If a new feature doesn't cleanly fit "student, single executive role, or admin," stop and check
`security.md` and `data-model.md` rather than inventing a new ad-hoc permission check — if those
docs don't cover it either, that's a real gap to flag to a human (per `agent-workflow.md`), not
a place to freelance a new pattern silently.
