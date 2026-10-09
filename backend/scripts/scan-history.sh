#!/usr/bin/env bash
# POR-88 · read-only scan of the WHOLE git history (all local and remote branches + optional extra refs)
# for secrets and personal data. Prints only WHERE (commit + file) and WHAT TYPE, never the value.
# - every value of the local env file (passwords, client secrets, ids) and the admin password file
# - generic patterns: private keys, AWS keys, JWTs, GitHub/OpenAI/Slack tokens, links with ?llave=,
#   "password = <long value>"
# - .env / .secrets.json / key files ever committed
# - e-mail addresses in content and in commit metadata (author/committer) that are not example.com/noreply
# - optional: words from a LOCAL list (one per line, e.g. real names), never committed:
#   ~/.config/prpp/privacy-words.txt (override with PRPP_PRIVACY_WORDS)
# Usage: bash backend/scripts/scan-history.sh [extra refs or commit ids...]
#   e.g. include a closed PR head: bash backend/scripts/scan-history.sh $(git ls-remote origin refs/pull/1/head | cut -f1)
# Exit 1 if a secret value or a secret pattern is found.
set -uo pipefail
ENV_FILE="${PRPP_ENV_FILE:-$HOME/.config/prpp/backend.env}"
ADMIN_FILE="${PRPP_ADMIN_FILE:-$HOME/hackathon/backend-nube/ADMIN-MEDPLUM.txt}"
WORDS_FILE="${PRPP_PRIVACY_WORDS:-$HOME/.config/prpp/privacy-words.txt}"
REFS=(--all "$@")
OUT="$(mktemp)"
trap 'rm -f "$OUT" "$OUT.tmp"' EXIT
# The scanner itself contains the patterns: excluded.
git log -p --no-color --format='@@COMMIT %h' "${REFS[@]}" -- . ':!backend/scripts/scan-history.sh' ':!backend/scripts/check-secrets.sh' >"$OUT"
echo "scan: $(git rev-list "${REFS[@]}" | wc -l) commits, $(wc -l <"$OUT") lines of history"
secrets=0

where_fixed() { # $1 value, $2 label: commit + file of added/removed lines containing the value
  awk -v pat="$1" -v lab="$2" '/^@@COMMIT/{c=$2} /^diff --git/{f=substr($4,3)} /^[+-]/ && index($0,pat)>0 {print "  " lab ": commit " c " · " f}' "$OUT" | sort -u | head -5
}
where_regex() { # $1 extended regex (case-insensitive), $2 label
  awk '/^@@COMMIT/{c=$2} /^diff --git/{f=substr($4,3)} /^[+-]/ {print c "\t" f "\t" $0}' "$OUT" |
    grep -iE -- "$1" | awk -F'\t' -v lab="$2" '{print "  " lab ": commit " $1 " · " $2}' | sort -u | head -8
}

echo "== values of the local env file =="
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# || -z "$value" || "$key" == MEDPLUM_BASE_URL ]] && continue
    n=$(grep -cF -- "$value" "$OUT" || true)
    case "$key" in
      DEMO_*_PASSWORD) type="demo password (public on purpose)" ;;
      *PASSWORD* | *SECRET*) type=secret ;;
      *_EMAIL) type="login e-mail (public if example.com)" ;;
      *) type=id ;;
    esac
    echo "$key ($type): $n"
    if [[ "$n" != 0 ]]; then
      where_fixed "$value" "$key"
      [[ "$type" == secret ]] && secrets=$((secrets + 1))
    fi
  done <"$ENV_FILE"
else
  echo "(no env file at $ENV_FILE)"
fi
if [[ -f "$ADMIN_FILE" ]]; then
  while IFS= read -r value; do
    [[ -z "$value" ]] && continue
    n=$(grep -cF -- "$value" "$OUT" || true)
    echo "admin password ($(basename "$ADMIN_FILE")): $n"
    [[ "$n" != 0 ]] && secrets=$((secrets + 1))
  done < <(sed -n 's/^Clave: *//p' "$ADMIN_FILE")
fi

echo "== secret patterns =="
# Lines holding a fictional demo password (published on purpose) are not findings.
if [[ -f "$ENV_FILE" ]]; then
  grep -E '^DEMO_[A-Z]+_PASSWORD=.' "$ENV_FILE" | cut -d= -f2- | while IFS= read -r v; do
    grep -vF -- "$v" "$OUT" >"$OUT.tmp"; mv "$OUT.tmp" "$OUT"
  done
fi
PATTERNS=(
  'BEGIN [A-Z ]*PRIVATE KEY'
  'AKIA[0-9A-Z]{16}'
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  'gh[pousr]_[A-Za-z0-9]{20,}'
  'sk-[A-Za-z0-9]{20,}'
  'xox[abp]-[A-Za-z0-9-]{10,}'
  '[?&]llave=[A-Za-z0-9]'
  "(password|passwd|secret|token|clave)[\"' ]*[:=][\"' ]*[A-Za-z0-9+/_-]{12,}"
)
for p in "${PATTERNS[@]}"; do
  n=$(grep -E '^[+-]' "$OUT" | grep -ciE -- "$p" || true)
  echo "/$p/: $n"
  if [[ "$n" != 0 ]]; then
    where_regex "$p" "pattern"
    secrets=$((secrets + 1))
  fi
done

echo "== secret-looking files ever committed =="
git log "${REFS[@]}" --name-only --format= | sort -u | grep -E '(^|/)\.env($|\.)|\.secrets\.json$|\.pem$|\.key$|id_rsa|ADMIN-' | while read -r f; do
  if [[ "$f" == *.env.example ]]; then echo "  $f (template, allowed)"; else echo "  $f  <-- check"; fi
done

echo "== e-mail addresses in content (not example.com / noreply) =="
grep -E '^[+-]' "$OUT" | grep -oiE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' | grep -viE '@example\.(com|org)$|noreply' | sort | uniq -c | sed -E 's/^ *([0-9]+) [^@]+@/  \1 x <user>@/' || true
echo "== commit metadata (author/committer e-mails not noreply) =="
git log "${REFS[@]}" --format='%h %ae%n%h %ce' | grep -viE 'noreply' | awk '{split($2,a,"@"); print "  commit " $1 " · <user>@" a[2]}' | sort -u || true

if [[ -f "$WORDS_FILE" ]]; then
  echo "== local privacy word list ($(wc -l <"$WORDS_FILE") words; matches by file, words not printed) =="
  pat="$(grep -v '^\s*$' "$WORDS_FILE" | paste -sd'|')"
  where_regex "$pat" "word"
  echo "  in commit metadata: $(git log "${REFS[@]}" --format='%an %ae %cn %ce %s' | grep -ciE "$pat" || true) commits"
fi

if [[ $secrets -gt 0 ]]; then
  echo "FAIL $secrets secret finding(s): rotate the value (deleting the file is not enough once it is in the history)"
  exit 1
fi
echo "ok   no secret values or secret patterns in the history"
