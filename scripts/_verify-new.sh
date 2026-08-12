#!/usr/bin/env bash
# Live E2E verification of the new auth behaviors (run ON the matriq server).
set -u
API="http://localhost/v1"
EMAIL="verify-e2e-$(date +%s)@test.local"
PASS="StrongPass123!"

echo "=== 1) register (sends verification email; code stored) ==="
curl -s -m 10 -X POST "$API/auth/register/staylite" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"fullName\":\"E2E Tester\",\"matricNumber\":\"ENG/2026/99999\",\"faculty\":\"Eng\",\"department\":\"CSE\",\"level\":\"400\",\"privacyPolicyVersion\":\"1.0\",\"termsVersion\":\"1.0\"}" | head -c 300
echo

echo "=== 2) wrong password login -> structured INVALID_CREDENTIALS ==="
curl -s -m 10 -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"WrongPass!\"}"
echo

echo "=== 3) resend x6 -> expect 5 ok, 6th = VERIFICATION_EMAIL_LIMIT with retryAfterMs ==="
for i in 1 2 3 4 5 6; do
  OUT=$(curl -s -m 10 -X POST "$API/auth/resend-verification" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\"}")
  echo "  attempt $i: $OUT" | head -c 260
  echo
done

echo "=== 4) dateOfBirth persistence (login -> PATCH /me -> re-fetch) ==="
TOK=$(curl -s -m 10 -X POST "$API/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])' 2>/dev/null)
if [ -n "$TOK" ]; then
  curl -s -m 10 -X PATCH "$API/me" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d '{"dateOfBirth":"2005-05-12"}' | head -c 200
  echo
  echo "--- stored value ---"
  curl -s -m 10 "$API/me" -H "Authorization: Bearer $TOK" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("dateOfBirth:", d.get("dateOfBirth"))' 2>/dev/null
  echo "--- future date rejected? ---"
  curl -s -m 10 -X PATCH "$API/me" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d '{"dateOfBirth":"2099-01-01"}' | head -c 200
  echo
else
  echo "login failed (email may not verify) - skipping DOB checks"
fi

echo "=== 5) cleanup test user ==="
docker exec matriq-postgres psql -U matriq -d matriq -c "DELETE FROM users WHERE email='$EMAIL';" 2>&1 | tail -1
