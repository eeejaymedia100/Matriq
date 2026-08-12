#!/usr/bin/env bash
set -u
API="http://localhost/v1"
EMAIL="dob-e2e-$(date +%s)@test.local"
PASS="StrongPass123!"

# Register, then force-verify in DB (email delivery is blocked by Resend test mode)
curl -s -m 10 -X POST "$API/auth/register/staylite" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"fullName\":\"DOB Tester\",\"matricNumber\":\"ENG/2026/88888\",\"faculty\":\"Eng\",\"department\":\"CSE\",\"level\":\"400\",\"privacyPolicyVersion\":\"1.0\",\"termsVersion\":\"1.0\"}" > /dev/null
docker exec matriq-postgres psql -U matriq -d matriq -c "UPDATE users SET email_verified=true, verification_token=NULL, verification_code_expires_at=NULL WHERE email='$EMAIL';" > /dev/null

TOK=$(curl -s -m 10 -X POST "$API/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])' 2>/dev/null)
echo "=== login token: ${TOK:0:12}... ==="

echo "=== PATCH /me with dateOfBirth 2005-05-12 ==="
curl -s -m 10 -X PATCH "$API/me" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d '{"dateOfBirth":"2005-05-12"}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print("dateOfBirth:", d.get("dateOfBirth"))' 2>/dev/null

echo "=== GET /me shows persisted dateOfBirth ==="
curl -s -m 10 "$API/me" -H "Authorization: Bearer $TOK" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("dateOfBirth:", d.get("dateOfBirth"), "| emailVerified:", d.get("emailVerified"))' 2>/dev/null

echo "=== future date rejected ==="
curl -s -m 10 -X PATCH "$API/me" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d '{"dateOfBirth":"2099-01-01"}'
echo

echo "=== invalid year rejected ==="
curl -s -m 10 -X PATCH "$API/me" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d '{"dateOfBirth":"1850-06-01"}'
echo

echo "=== cleanup ==="
UID=$(docker exec matriq-postgres psql -U matriq -d matriq -t -A -c "SELECT id FROM users WHERE email='$EMAIL';")
docker exec matriq-postgres psql -U matriq -d matriq -c "DELETE FROM legal_acceptances WHERE user_id='$UID';" > /dev/null 2>&1
docker exec matriq-postgres psql -U matriq -d matriq -c "DELETE FROM refresh_token_families WHERE user_id='$UID';" > /dev/null 2>&1
docker exec matriq-postgres psql -U matriq -d matriq -c "DELETE FROM users WHERE id='$UID';"
echo "cleaned up $EMAIL"
