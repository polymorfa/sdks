// Run from a task-owned directory with Playwright installed. No operator profile.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const directory = resolve(process.argv[2]);
const moduleName = 'polymorfa_indexeddb_browser_acceptance.js';
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Rust IndexedDB acceptance</title>'); return;
    }
    if (pathname === '/denied.html') {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<script type="module">import init,{denied_storage} from './${moduleName}'; await init(); try { parent.postMessage({rust_idb_denied:await denied_storage()},'*'); } catch { parent.postMessage({rust_idb_denied:false},'*'); }</script>`); return;
    }
    const filename = resolve(directory, '.' + pathname);
    if (!filename.startsWith(directory + '/')) throw new Error('Path outside fixture');
    response.setHeader('Content-Type', ({'.js':'text/javascript','.wasm':'application/wasm'})[extname(filename)] || 'application/octet-stream');
    response.end(await readFile(filename));
  } catch { response.statusCode = 404; response.end('Fixture not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE});
try {
  const context = await browser.newContext();
  const external = [];
  context.on('request', request => { if (!request.url().startsWith(base + '/')) external.push(request.url()); });
  const page = await context.newPage();
  await page.goto(base);
  const name = `rust_idb_${Date.now()}`;
  const result = await page.evaluate(async ({name,moduleName}) => {
    const module = await import('./'+moduleName); await module.default();
    const passed = await module.run_conformance(name);
    const rollbackName = name + '_provider_rollback';
    const entities = JSON.parse(module.entity_names());
    const database = await new Promise((resolve,reject) => {
      const request = indexedDB.open(rollbackName,2);
      request.onupgradeneeded = () => {
        for (const entity of entities) request.result.createObjectStore(entity,{keyPath:'_id'});
        request.transaction.objectStore('messages').createIndex('unique_text','text',{unique:true});
      };
      request.onsuccess = () => resolve(request.result); request.onerror=()=>reject(new Error('Fixture schema setup failed'));
    });
    database.close();
    const rollback = await module.provider_rollback(rollbackName);
    const denied = await new Promise((resolve,reject) => {
      const iframe = document.createElement('iframe'); iframe.sandbox='allow-scripts'; iframe.src='/denied.html';
      const timeout = setTimeout(()=>reject(new Error('Opaque origin acceptance timed out')),15000);
      window.addEventListener('message', function receive(event) {
        if (event.source === iframe.contentWindow && event.origin === 'null' && event.data?.rust_idb_denied !== undefined) {
          clearTimeout(timeout); window.removeEventListener('message',receive); iframe.remove(); resolve(event.data.rust_idb_denied);
        }
      }); document.body.append(iframe);
    });
    return {passed,rollback,denied};
  }, {name,moduleName});
  assert.equal(result.rollback,true); assert.equal(result.denied,true); assert.match(result.passed,/all17.*2000.*lease.*cancel/);
  await page.close();
  const reopened = await context.newPage(); await reopened.goto(base);
  const revision = await reopened.evaluate(async ({name,moduleName}) => {
    const module = await import('./'+moduleName); await module.default(); return module.persisted_revision(name);
  }, {name,moduleName});
  assert.equal(revision,2); assert.equal(external.length,0);
  console.log(JSON.stringify({...result, freshPagePersistedRevision:revision, browser:browser.version()}));
  await context.close();
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
