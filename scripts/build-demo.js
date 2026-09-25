// Builds a static, backend-free copy of the site into demo/dist/.
//
//   npm run build:demo
//
// demo/demo-api.js answers every fetch('/api/...') in the browser from
// localStorage, so the output runs as plain HTML on any static host with no
// Node server and no connection to the live Firestore database.
// The real app in public/ is left untouched.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'demo', 'dist');
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ['css', 'js', 'images']) fs.mkdirSync(path.join(out, dir), { recursive: true });

// Static assets
fs.copyFileSync(path.join(root, 'public', 'css', 'style.css'), path.join(out, 'css', 'style.css'));
for (const f of fs.readdirSync(path.join(root, 'public', 'js'))) {
  fs.copyFileSync(path.join(root, 'public', 'js', f), path.join(out, 'js', f));
}
for (const f of ['township_backroom.jpg', 'township_ensuite.jpg', 'student_room.jpg', 'converted_garage.jpg']) {
  fs.copyFileSync(path.join(root, 'public', 'images', f), path.join(out, 'images', f));
}

// Sample data: only the built-in sample records (ids like listing_001), never
// listings or phone numbers submitted by real users.
const store = JSON.parse(fs.readFileSync(path.join(root, 'data', 'rentaroom_store.json'), 'utf8'));
const isSample = (prefix) => (x) => new RegExp(`^${prefix}_0\\d\\d$`).test(String(x._id));
const localImage = (img) => {
  const m = String(img || '').match(/(township_backroom|township_ensuite|student_room|converted_garage)/);
  return m ? `images/${m[1]}.jpg` : 'images/township_backroom.jpg';
};
const seed = {
  landlords: store.landlords.filter(isSample('landlord')),
  listings: store.listings.filter(isSample('listing')).map((l) => ({
    ...l,
    landlordId: typeof l.landlordId === 'object' && l.landlordId ? l.landlordId._id : l.landlordId,
    image: localImage(l.image),
    photos: undefined
  })),
  requests: store.requests.filter(isSample('req')),
  messages: store.messages.filter(isSample('msg'))
};
// One flagged example so the admin moderation queue has something in it.
seed.listings.push({
  _id: 'listing_099', landlordId: seed.landlords[2] ? seed.landlords[2]._id : null,
  title: 'Room available — pay deposit before viewing', suburb: 'Meadowlands', address: 'Zone 2, Meadowlands',
  monthlyRent: 350, propertyType: 'Backroom', amenities: [], image: 'images/township_backroom.jpg',
  status: 'pending_review', flagged: true, reportCount: 1,
  flagReasons: ['Contains suspicious phrase: "pay before viewing"', 'Rent is unusually low for the area.'],
  createdAt: new Date().toISOString()
});

const api = fs.readFileSync(path.join(root, 'demo', 'demo-api.js'), 'utf8')
  .replace(/\/\*__SEED__\*\/[^\n]*/, `${JSON.stringify(seed)};`);
fs.writeFileSync(path.join(out, 'demo-api.js'), api);

// In-page replacement for confirm(), which sandboxed preview frames block.
const DEMO_UI = `<script>function demoConfirm() { return true; }</script>`;

function transform(html, { isAdmin }) {
  html = html
    .replace(/(href|src)="\/(css|js)\//g, '$1="$2/')
    .replace(/\/images\//g, 'images/')
    .replace(/href="\/admin"/g, 'href="admin.html"')
    .replace(/href="\/"/g, 'href="./"')
    .replace(/<meta name="viewport" content="[^"]*"\s*\/?>/, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />')
    .replace(/<head>/, '<head>\n<script src="demo-api.js"></script>')
    .replace(/\bconfirm\(/g, 'demoConfirm(');

  const banner = isAdmin
    ? `<div style="background:#1e293b;color:#cbd5e1;font:500 13px/1.4 system-ui,sans-serif;padding:8px 16px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center;align-items:center;border-bottom:1px solid #334155">
  <span><b style="color:#fb7185">Demo mode</b>: sign in with username <code style="background:#0f172a;padding:1px 6px;border-radius:4px">admin</code> and password <code style="background:#0f172a;padding:1px 6px;border-radius:4px">demo</code></span>
  <a href="./" style="color:#fda4af;font-weight:700">&larr; Back to listings</a>
</div>`
    : `<div style="background:#0f172a;color:#e2e8f0;font:500 13px/1.4 system-ui,sans-serif;padding:8px 16px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center;align-items:center">
  <span><b style="color:#fb923c">Demo mode</b>: sample data, saved in your browser only. Nothing reaches the live site.</span>
  <a href="admin.html" style="color:#fdba74;font-weight:700">Open admin (admin / demo)</a>
  <button type="button" onclick="RentARoomDemo.reset()" style="background:none;border:1px solid #475569;color:#cbd5e1;border-radius:8px;padding:2px 10px;cursor:pointer">Reset demo data</button>
</div>`;
  return html.replace(/(<body[^>]*>)/, `$1\n${banner}\n${DEMO_UI}`);
}

const index = transform(fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8'), { isAdmin: false });
const admin = transform(fs.readFileSync(path.join(root, 'public', 'admin.html'), 'utf8'), { isAdmin: true });
fs.writeFileSync(path.join(out, 'index.html'), index);
fs.writeFileSync(path.join(out, 'admin.html'), admin);

// Same page without the doctype/html/head/body wrapper, for hosts that supply
// their own document skeleton (such as Claude artifacts).
const fragment = index
  .replace(/<!DOCTYPE html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/g, '')
  .replace(/<\/?head>\s*/g, '')
  .replace(/<body([^>]*)>/, '<div$1>')
  .replace('</body>', '</div>');
fs.writeFileSync(path.join(out, 'page.html'), fragment);

console.log(`Demo built in demo/dist/ (${seed.listings.length} sample listings, ${seed.requests.length} room requests)`);
