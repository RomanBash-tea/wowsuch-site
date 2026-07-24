// Render build step: inject WOWSUCH_FEED_TOKEN (env var) into assets/js/core.js.
// The committed source keeps an empty placeholder so the token never lives in git;
// Render runs `node scripts/inject-feed-token.js` as the static-site build command.
// Spec: dev-inbox/done/021-dashboard-live-tea-feed.md (## Result, step 2).
const fs = require('fs');

const p = 'assets/js/core.js';
const marker = 'var WOWSUCH_FEED_TOKEN = "";';

const token = process.env.WOWSUCH_FEED_TOKEN;
if (!token) throw new Error('WOWSUCH_FEED_TOKEN env var is not set');

let s = fs.readFileSync(p, 'utf8');
if (!s.includes(marker)) throw new Error('WOWSUCH_FEED_TOKEN marker not found in ' + p);

s = s.replace(marker, 'var WOWSUCH_FEED_TOKEN = ' + JSON.stringify(token) + ';');
fs.writeFileSync(p, s);
console.log('WOWSUCH_FEED_TOKEN injected into ' + p);
