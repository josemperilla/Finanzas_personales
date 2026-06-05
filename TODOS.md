echo "TODOS.md updated"
# Verify
grep -n "Workers" TODOS.md 2>/dev/null | tail -3When >10 users or custom domain is needed, migrate apps_script/webhook.gs to a Cloudflare Worker. Chose GAS on 2026-06-04 for simplicity (2 users, no rate limit issues). Workers give: custom domain, better rate limits, KV for Gmail tokens, Cron for email polling. Blocked by: Workers migration is a full rewrite of webhook.gs in TypeScript.

## TODO: Migrate webhook to Cloudflare Workers
When >10 users or custom domain is needed, migrate apps_script/webhook.gs to a Cloudflare Worker.
Chose GAS on 2026-06-04 for simplicity (2 users). Workers give: custom domain, better rate limits,
KV for Gmail tokens, Cron for email polling.
