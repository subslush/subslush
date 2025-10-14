#!/bin/bash
echo "Testing auth rate limiting..."

for i in {1..8}; do
  echo -n "Request $i: "
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
    http://localhost:3001/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrongpassword"}')
  echo "$HTTP_CODE"
  sleep 0.1
done

echo ""
echo "Expected: First 5 should be 401, remaining should be 429 (rate limited)"