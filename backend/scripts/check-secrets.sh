#!/usr/bin/env bash
# Pre-commit check: fail if any secret value from the local env file appears in the staged diff.
# Prints only the variable NAME that leaked, never the value.
# Usage: bash backend/scripts/check-secrets.sh
set -euo pipefail
ENV_FILE="${PRPP_ENV_FILE:-$HOME/.config/prpp/backend.env}"
# The check script itself contains the patterns below, so it is excluded from the scan.
diff="$(git diff --cached -- . ':!backend/scripts/check-secrets.sh')"
leaks=0
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# || -z "$value" ]] && continue
  # Public values: the API URL, login emails and the fictional demo passwords (published in the README).
  [[ "$key" == "MEDPLUM_BASE_URL" || "$key" == *_EMAIL || "$key" =~ ^DEMO_[A-Z]+_PASSWORD$ ]] && continue
  if grep -qF -- "$value" <<<"$diff"; then
    echo "LEAK: value of $key is in the staged diff"
    leaks=$((leaks + 1))
  fi
done < "$ENV_FILE"
ADMIN_FILE="${PRPP_ADMIN_FILE:-$HOME/hackathon/backend-nube/ADMIN-MEDPLUM.txt}"
if [[ -f "$ADMIN_FILE" ]]; then
  while IFS= read -r value; do
    [[ -z "$value" ]] && continue
    if grep -qF -- "$value" <<<"$diff"; then
      echo "LEAK: the admin password from $(basename "$ADMIN_FILE") is in the staged diff"
      leaks=$((leaks + 1))
    fi
  done < <(sed -n 's/^Clave: *//p' "$ADMIN_FILE")
fi
if grep -qiE 'BEGIN (RSA|OPENSSH) PRIVATE KEY|aws_secret_access_key|AKIA[0-9A-Z]{16}' <<<"$diff"; then
  echo "LEAK: private key or AWS credential pattern in the staged diff"
  leaks=$((leaks + 1))
fi
if git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -vq '\.env\.example$'; then
  echo "LEAK: a .env file is staged"
  leaks=$((leaks + 1))
fi
if [[ $leaks -gt 0 ]]; then
  exit 1
fi
echo "ok   no secrets in staged diff ($(git diff --cached --name-only | wc -l) files checked)"
