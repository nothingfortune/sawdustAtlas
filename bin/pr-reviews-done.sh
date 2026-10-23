#!/usr/bin/env bash
#
# Post a summary comment on a PR once all AI-review feedback has been processed.
#
# Run this at the END of the review loop — after await-codex-review.sh and
# await-copilot-review.sh have been fetched, every finding addressed, and each
# thread replied to. It posts one issue-comment signalling reviewers that the
# Codex + Copilot feedback is handled, and reports the live CI state so the
# "good to merge" claim is honest (it won't say ready if checks fail/run).
#
# Usage:
#   bin/pr-reviews-done.sh [PR_NUMBER] [extra note] [--ack-suppressed] [--lessons "<takeaway>"]
#   SUPPRESSED_ACK=1 LESSONS="..." bin/pr-reviews-done.sh 285
#
# With no PR number, uses the PR for the current branch (gh pr view).
# --ack-suppressed asserts you have read and handled the findings Copilot filed inside collapsed
# "Suppressed comments" blocks; without it this refuses to post when any exist (exit 3).
# --lessons is REQUIRED whenever the reviews produced any finding at all: the loop's last step is
# deciding what testing-strategy or test change keeps that bug class from recurring — posted as a
# "Testing takeaways" section. "None new" is a valid takeaway, but it must be said explicitly
# (e.g. --lessons "none new: both findings are a class the unit tests already cover").
# Otherwise it must cite the L-NNNN that the lessons MCP add_lesson/add_origin returned (checked on the lessons repo's main).
set -euo pipefail

# Flags are stripped before positional parsing so `--ack-suppressed` / `--lessons` can be passed
# with or without a PR number and are never mistaken for one.
ACK="${SUPPRESSED_ACK:-}"
LESSONS="${LESSONS:-}"
ARGS=()
expect_lessons=""
for arg in "$@"; do
  if [ -n "$expect_lessons" ]; then LESSONS="$arg"; expect_lessons=""; continue; fi
  case "$arg" in
    --ack-suppressed) ACK=1 ;;
    --lessons=*)      LESSONS="${arg#--lessons=}" ;;
    --lessons)        expect_lessons=1 ;;
    *)                ARGS+=( "$arg" ) ;;
  esac
done

NOTE="${ARGS[1]:-}"

# shellcheck source=bin/lib/pr-review-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib/pr-review-lib.sh"
read -r REPO PR < <(pr_resolve_repo_and_number "pr-reviews-done" "${ARGS[0]:-}") || exit 2

# A failed comment fetch must not read as "0 unaddressed", or the gate passes without checking threads.
if reviewcomments="$(gh api "repos/$REPO/pulls/$PR/comments" --paginate 2>/dev/null)" \
  && threads="$(printf '%s' "$reviewcomments" | jq -s 'add // []' | unaddressed_bot_threads)"; then
  unaddressed_n="$(printf '%s' "$threads" | grep -c . || true)"
else
  unaddressed_n="?"   # fetch failed → unknown; treated as not-ready in the verdict below
fi

# Suppressed findings live only in review bodies with no thread to reply in, so they need an explicit --ack-suppressed.
if reviewsjson="$(gh api "repos/$REPO/pulls/$PR/reviews" --paginate 2>/dev/null)"; then
  suppressed="$(printf '%s' "$reviewsjson" | jq -s 'add // []' | suppressed_findings || true)"
  suppressed_n="$(printf '%s' "$suppressed" | grep -c . || true)"
else
  suppressed="" ; suppressed_n="?"
fi

# Unknown is not zero; --ack-suppressed still overrides because the reviews may have been read in the browser.
if [ "$suppressed_n" = "?" ] && [ -z "$ACK" ]; then
  echo "Refusing to post: could not fetch reviews for $REPO PR #$PR, so suppressed findings are UNKNOWN." >&2
  echo "Copilot files some findings in collapsed blocks that never reach the comments API, so an" >&2
  echo "unverified fetch cannot be reported as 'no findings'. Retry, or pass --ack-suppressed if" >&2
  echo "you have read the reviews yourself." >&2
  exit 3
fi

if [ "${suppressed_n:-0}" -gt 0 ] && [ -z "$ACK" ]; then
  echo "Refusing to post: ${suppressed_n} suppressed finding(s) on $REPO PR #$PR have not been acknowledged." >&2
  echo >&2
  printf '%s\n' "$suppressed" | sed 's/^/  /' >&2
  echo >&2
  echo "These are collapsed in the review body and never appear in the comments API, so nothing" >&2
  echo "else in this loop can see them. Address them, then re-run with --ack-suppressed." >&2
  exit 3
fi

# Refuse before the lessons gate: a takeaway cannot honestly be written for an unread finding.
if [ "$unaddressed_n" = "?" ]; then
  echo "Refusing to post: could not fetch or parse review comments for $REPO PR #$PR, so unaddressed" >&2
  echo "threads are UNKNOWN. A failed fetch is never 'nothing to address'. Retry once the API answers." >&2
  exit 3
fi

if [ "$unaddressed_n" -gt 0 ]; then
  echo "Refusing to post: ${unaddressed_n} bot review thread(s) on $REPO PR #$PR have no reply from us." >&2
  echo >&2
  echo "List them with:  bin/pr-unaddressed.sh $PR" >&2
  echo "address each one, reply in-thread, then re-run this." >&2
  exit 3
fi

# A fixed finding leaves its bug class open until a test or strategy change closes it, so findings demand a takeaway.
if [ "$unaddressed_n" = "?" ] || [ "$suppressed_n" = "?" ]; then
  findings_n="?"
else
  findings_n="$(printf '%s' "$reviewcomments" | jq -s 'add // [] | [.[] | select(.in_reply_to_id == null) | select((.user.login // "") | test("copilot|codex"; "i"))] | length')"
  findings_n=$(( findings_n + suppressed_n ))
fi
if { [ "$findings_n" = "?" ] || [ "${findings_n:-0}" -gt 0 ]; } && [ -z "$LESSONS" ]; then
  echo "Refusing to post: the reviews on $REPO PR #$PR produced ${findings_n} finding(s), and no testing" >&2
  echo "takeaway was given. Every finding is a bug some test layer failed to catch — decide what" >&2
  echo "testing-strategy or test change prevents that class from recurring (or state why existing" >&2
  echo "coverage already owns it) and re-run with:" >&2
  echo "  bin/pr-reviews-done.sh $PR --lessons \"<what changes in the tests/strategy, or 'none new: <why>'>\"" >&2
  exit 3
fi

# Uncited takeaways die in this PR comment; ids are looked up (fail closed) because a regex accepts unwritten ones.
LESSONS_REPO="${LESSONS_REPO:-hestiamediagroup/engineering-lessons}"
LESSONS_PATH="plugins/engineering-lessons/skills/lessons/lessons"
lesson_links=""
if [ -n "$LESSONS" ]; then
  # Whole tokens at a word boundary: a typo like L-0082oops must refuse, not verify as L-0082; CALL-410 is a ticket.
  cited="$(printf '%s' "$LESSONS" | grep -oE '(^|[^[:alnum:]_-])L-[[:alnum:]_-]+' | sed -E 's/^[^L]//' | sort -u || true)"
  malformed="$(printf '%s\n' "$cited" | grep -vE '^(L-[0-9]{4})?$' || true)"
  if [ -n "$malformed" ]; then
    echo "Refusing to post: malformed lesson id(s): $(printf '%s' "$malformed" | tr '\n' ' ')- ids are exactly L- plus four digits." >&2
    exit 3
  fi
  if [ -z "$cited" ]; then
    if ! printf '%s' "$LESSONS" | grep -qiE 'none new: *[^ ]'; then
      echo "Refusing to post: the takeaway cites no lesson id and is not 'none new: <why>'." >&2
      echo "Record it in the shared lessons first, with the lessons MCP server's tools (plugin" >&2
      echo "engineering-lessons): search_lessons for an existing rule, then add_origin (it happened again)" >&2
      echo "or add_lesson (new bug class). Re-run citing the id they return:" >&2
      echo "  bin/pr-reviews-done.sh $PR --lessons \"L-NNNN: <what changes in the tests/strategy>\"" >&2
      exit 3
    fi
  else
    if ! names="$(gh api "repos/$LESSONS_REPO/contents/$LESSONS_PATH?ref=main" --jq '.[].name' 2>/dev/null)" || [ -z "$names" ]; then
      echo "Refusing to post: could not list lessons on $LESSONS_REPO main, so the cited ids are UNVERIFIED." >&2
      echo "A failed lookup is not proof they exist. Retry once the API answers (this needs gh access to" >&2
      echo "$LESSONS_REPO)." >&2
      exit 3
    fi
    for id in $cited; do
      file="$(printf '%s\n' "$names" | grep -E "^${id}-.*\.md$" | head -1 || true)"
      if [ -z "$file" ]; then
        echo "Refusing to post: $id is not on $LESSONS_REPO main. Cite the id add_lesson / add_origin returned" >&2
        echo "after it merged, not one you expect it to get." >&2
        exit 3
      fi
      lesson_links="${lesson_links}${lesson_links:+, }[${id}](https://github.com/${LESSONS_REPO}/blob/main/${LESSONS_PATH}/${file})"
    done
  fi
fi

# An empty or errored rollup must not read as merge-ready; skipping counts as ok.
buckets="$(gh pr checks "$PR" --json bucket -q '.[].bucket' 2>/dev/null || true)"
total="$(  printf '%s\n' "$buckets" | grep -c .          || true)"
blocked="$(printf '%s\n' "$buckets" | grep -cxE 'fail|cancel' || true)"
pending="$(printf '%s\n' "$buckets" | grep -cx  'pending'     || true)"

# Every thread is answered past the gates above, so the verdict is about CI only.
if [ "${total:-0}" -eq 0 ]; then
  verdict="Reviews processed. **No CI checks reported yet** — verify CI is green before merging."
elif [ "${blocked:-0}" -gt 0 ]; then
  verdict="Reviews processed, but **${blocked} CI check(s) failing/cancelled** — not ready to merge yet."
elif [ "${pending:-0}" -gt 0 ]; then
  verdict="Reviews processed. **${pending} check(s) still running** — mergeable once CI is green."
else
  verdict="Reviews processed and **CI is green — good to merge.** ✅"
fi

body="🤖 ${verdict}

All Codex & GitHub Copilot review feedback has been addressed and replied to in-thread."
if [ "$suppressed_n" != "?" ] && [ "${suppressed_n:-0}" -gt 0 ]; then
  # These were handled without a thread, so say so or the claim above rests on evidence nobody can check.
  body="${body}
Includes ${suppressed_n} finding(s) filed in collapsed \"Suppressed comments\" blocks, which have no
thread to reply in — those are answered in a PR comment instead."
fi
if [ -n "$LESSONS" ]; then
  body="${body}

**Testing takeaways:** ${LESSONS}"
  if [ -n "$lesson_links" ]; then
    body="${body}
Recorded in engineering-lessons: ${lesson_links}"
  fi
fi
if [ -n "$NOTE" ]; then
  body="${body}

${NOTE}"
fi

gh pr comment "$PR" --body "$body"
echo "Posted reviews-done summary to $REPO PR #$PR."
