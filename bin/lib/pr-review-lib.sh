#!/usr/bin/env bash
# Helpers for the AI-review loop. Sourced by bin/pr-unaddressed.sh, bin/pr-reviews-done.sh,
# bin/await-codex-review.sh, and bin/await-copilot-review.sh; unit-tested in
# tests/bin/pr-review-lib.test.sh.
#
# suppressed_findings (pure, no network): findings Copilot files in a collapsed "Suppressed
# comments" block of the review BODY, which the comments API never returns.
#
# unaddressed_bot_threads (pure, no network): given the JSON array of a PR's inline
# review comments (as returned by `gh api repos/{repo}/pulls/{pr}/comments --paginate |
# jq -s 'add // []'`), find the top-level BOT comments that have no reply from us. A
# reply "from us" is any comment whose in_reply_to_id points at the bot comment and
# whose author is NOT a bot. A bot thread with only bot activity — or no reply at
# all — is "unaddressed".
#
# pr_resolve_repo_and_number: resolve the repo and PR every script needs (network — calls gh).

# Default bot-login match (Codex + Copilot logins, case-insensitive):
#   chatgpt-codex-connector[bot] · Copilot · copilot-pull-request-reviewer[bot]
PR_REVIEW_BOTS="${PR_REVIEW_BOTS:-codex|copilot}"

# unaddressed_bot_threads [bots_regex]
# Reads the comments JSON array on STDIN. Emits one TAB-separated line per
# unaddressed thread: "<comment_id>\t<path>:<line>\t@<login>\t<80-char snippet>".
# Emits nothing (and the caller sees empty output) when every bot thread has our reply.
unaddressed_bot_threads() {
  local bots="${1:-$PR_REVIEW_BOTS}"
  jq -r --arg bots "$bots" '
    def is_bot: (.user.login | test($bots; "i"));
    . as $all
    | ($all | map(select(.in_reply_to_id != null))) as $replies
    | $all
    | map(select((.in_reply_to_id == null) and is_bot))          # top-level bot comments
    | map(
        .id as $cid
        # a reply pointing at this comment, authored by a non-bot, is "our reply"
        | ($replies | any((.in_reply_to_id == $cid) and (is_bot | not))) as $ours
        | select($ours | not)                                    # keep only the un-replied
        | "\(.id)\t\(.path):\(.line // .original_line // "?")\t@\(.user.login)\t\((.body // "") | gsub("[\r\n]+"; " ") | .[0:80])"
      )
    | .[]
  '
}

# suppressed_findings [bots_regex]
# Reads the REVIEWS JSON array on STDIN (as returned by `gh api repos/{repo}/pulls/{pr}/reviews
# --paginate | jq -s 'add // []'`). Emits one TAB-separated line per finding Copilot filed inside a
# collapsed "Suppressed comments" block: "<path:line>\t@<login>\t<160-char snippet>".
# Pure: no network. Parsed with awk because the payload is markdown inside JSON.
suppressed_findings() {
  local bots="${1:-$PR_REVIEW_BOTS}"
  # \u0001 marks the start of each bot review body so awk can attribute findings to a login.
  jq -r --arg bots "$bots" '
    .[] | select(.user.login | test($bots; "i"))
    | "\u0001\(.user.login)", (.body // "")
  ' 2>/dev/null | awk '
    { sub(/\r$/, "") }
    /^\001/ { login = substr($0, 2); inblock = 0; pending = ""; next }
    # Only inside the suppressed block: the same **path:line** shape appears in other sections.
    /<summary>[^<]*Suppressed comments/ { inblock = 1; pending = ""; next }
    inblock && /<\/details>/ { inblock = 0; pending = ""; next }
    inblock && /^\*\*[^*]+:[0-9]+\*\*[ \t]*$/ {
      loc = $0; gsub(/\*\*/, "", loc); gsub(/[ \t]+$/, "", loc); pending = loc; next
    }
    inblock && pending != "" && /^\* / {
      text = $0; sub(/^\* /, "", text)
      printf "%s\t@%s\t%s\n", pending, login, substr(text, 1, 160)
      pending = ""
    }
  '
}

# pr_resolve_repo_and_number <script-name> [pr-arg]
# Resolves REPO (gh repo view for the current git remote) and PR (pr-arg if given,
# else gh pr view for the current branch). On success, echoes "REPO PR" (one line,
# space-separated) on stdout — callers read it with:
#   read -r REPO PR < <(pr_resolve_repo_and_number "my-script" "${1:-}") || exit 2
# On failure, prints a usage error naming <script-name> to stderr and returns 2 with
# no stdout (so the `read` above fails too, and `|| exit 2` fires).
pr_resolve_repo_and_number() {
  local script="$1" pr="${2:-}" repo
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  if [ -z "$repo" ]; then
    echo "${script}: not in a GitHub repo (gh repo view failed)." >&2
    return 2
  fi
  if [ -z "$pr" ]; then
    pr="$(gh pr view --json number -q .number 2>/dev/null || true)"
  fi
  if [ -z "$pr" ]; then
    echo "usage: ${script}.sh <pr-number>  (no PR found for the current branch)" >&2
    return 2
  fi
  printf '%s %s\n' "$repo" "$pr"
}

# review_request_needed <login-pattern> [head-sha]
# Pure decision: given a PR's `requested_reviewers` and `reviews` on stdin as
#   {"requested_reviewers":[…],"reviews":[…]}
# print "request" if a review still needs to be asked for, else "skip".
# Copilot reviews only when requested; "skip" when already pending (re-requesting resets the
# queue) or when it has already reviewed THIS head.
review_request_needed() {
  local pattern="${1:?review_request_needed: login pattern required}" head="${2:-}"
  # Coalesce logins to "": a deleted account's review has `user: null`, and test() on null aborts jq.
  jq -r --arg p "$pattern" --arg head "$head" '
    ((.requested_reviewers // []) | map(select((.login // "") | test($p; "i"))) | length) as $pending
    | ((.reviews // []) | map(select(((.user.login // "") | test($p; "i"))
        and ($head != "") and (.commit_id == $head))) | length) as $reviewed_head
    | if $pending > 0 or $reviewed_head > 0 then "skip" else "request" end
  '
}

# pr_request_review <repo> <pr> <api-login> <login-pattern>
# Request <api-login> as a reviewer, but only when review_request_needed says so.
# Echoes a one-line note about what it did. Never fails the caller: a repo where the
# reviewer isn't installed simply won't gain a pending request, and the poll that
# follows still behaves exactly as it did before.
#
# NOTE: only GitHub Copilot is requestable this way. Requesting the Codex connector
# is accepted by the API (HTTP 200) but silently dropped — `requested_reviewers`
# stays empty — so Codex cannot be triggered from here and its awaiter only polls.
pr_request_review() {
  local repo="$1" pr="$2" login="$3" pattern="$4" head state
  head="$(gh pr view "$pr" --repo "$repo" --json headRefOid -q .headRefOid 2>/dev/null || true)"
  state="$(gh api "repos/$repo/pulls/$pr" 2>/dev/null \
    | jq -c '{requested_reviewers, reviews: []}' 2>/dev/null || echo '{}')"
  # Merge in the reviews list (a separate endpoint) so "already reviewed this head" counts.
  state="$(jq -sc '.[0] * {reviews: (.[1] // [])}' \
    <(printf '%s' "$state") \
    <(gh api --paginate "repos/$repo/pulls/$pr/reviews" 2>/dev/null | jq -s 'add // []' 2>/dev/null || echo '[]') \
    2>/dev/null || printf '%s' "$state")"

  # Only an explicit "skip" skips: an extra request is noise, a silent skip polls for a review never asked for.
  if [ "$(printf '%s' "$state" | review_request_needed "$pattern" "$head" 2>/dev/null)" = "skip" ]; then
    echo "(${login} already requested or has reviewed this commit — not re-requesting.)"
    return 0
  fi
  if gh api -X POST "repos/$repo/pulls/$pr/requested_reviewers" \
       -f "reviewers[]=$login" >/dev/null 2>&1; then
    echo "Requested a review from ${login}."
  else
    echo "(Could not request ${login} — polling anyway.)"
  fi
  return 0
}
