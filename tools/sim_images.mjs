// Custom pictures: buy the image cape, upload a picture, see it wait for review, approve it, serve it.
// Usage: node tools/sim_images.mjs  (uses a throwaway save file)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createProfiles } from '../profiles.js';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mugr-img-'));
delete process.env.UPSTASH_REDIS_REST_URL;
const P = createProfiles(path.join(dir, 'profiles.json'));
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
const token = 'ab'.repeat(16);
const pr = await P.load(token);
P.award(pr, 5000);
if (await P.setImage(pr, 'data:image/png;base64,AAAA') !== 'Buy the image cape or the image flag first.') fail('uploaded without owning one');
if (P.buy(pr, 'image_cape')) fail('could not buy');
const png = 'data:image/png;base64,' + Buffer.from('fake picture bytes').toString('base64');
const err = await P.setImage(pr, png);
if (err) fail(err);
console.log('after upload', pr.img, pr.imgSt);
const pending = await P.pendingImages();
if (pending.length !== 1 || pending[0].id !== pr.img) fail('not pending');
if (await P.imageData(pr.img)) fail('served before approval');
const tokens = await P.judgeImage(pr.img, true, 'mod');
if (!tokens?.includes(token)) fail('judge did not find the wearer');
if (pr.imgSt !== 'ok' || !(await P.imageData(pr.img))) fail('not approved');
if ((await P.pendingImages()).length) fail('still pending');
// a turned-down picture can't be sent again
const bad = 'data:image/png;base64,' + Buffer.from('rude picture').toString('base64');
await P.setImage(pr, bad);
await P.judgeImage(pr.img, false, 'mod');
if (pr.imgSt !== 'rejected') fail('not rejected');
if (await P.setImage(pr, bad) !== 'A moderator already turned that picture down.') fail('rejected picture accepted again');
console.log('view', JSON.stringify(P.view ? P.view(pr) : {}).slice(0, 200));
console.log('images ok');
process.exit(0);
