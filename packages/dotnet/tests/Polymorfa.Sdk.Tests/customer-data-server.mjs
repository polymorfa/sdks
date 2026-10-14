import http from 'node:http';
import https from 'node:https';
import { createHash, createHmac, hkdfSync, createCipheriv } from 'node:crypto';
import { deflateSync, gzipSync, deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
const root=path.join(homedir(),'.polymorfa-agent-work','zk-program-20261014','native-customer-peers');mkdirSync(root,{recursive:true});
const directory=mkdtempSync(path.join(root,'peer-'));
const authority=path.join(directory,'authority.pem'),authorityKey=path.join(directory,'authority-key.pem');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',authorityKey,'-out',authority,'-subj','/CN=PolymorfaSyntheticRoot','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'});
execFileSync('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',path.join(directory,'key.pem'),'-out',path.join(directory,'request.pem'),'-subj','/CN=mmg.whatsapp.net'],{stdio:'ignore'});
writeFileSync(path.join(directory,'extensions.txt'),'basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:mmg.whatsapp.net\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
execFileSync('openssl',['x509','-req','-in',path.join(directory,'request.pem'),'-CA',authority,'-CAkey',authorityKey,'-CAcreateserial','-out',path.join(directory,'cert.pem'),'-days','1','-extfile',path.join(directory,'extensions.txt')],{stdio:'ignore'});
const sha=b=>createHash('sha256').update(b).digest();const varint=n=>{let x=BigInt(n),b=[];do{let v=Number(x&127n);x>>=7n;b.push(v|(x?128:0));}while(x);return Buffer.from(b)};
const field=(n,b)=>Buffer.concat([varint(n*8+2),varint(b.length),b]);const integer=(n,v)=>Buffer.concat([varint(n*8),varint(v)]);
const proto=Buffer.concat([integer(1,6),field(2,Buffer.concat([field(1,Buffer.from('chat@example')),integer(5,18446744073709551615n),field(13,Buffer.from('private chat')),field(199,Buffer.from('unknown nested'))])),integer(5,2),integer(6,100),integer(211,18446744073709551615n)]);
const compressed=deflateSync(proto),mediaKey=Buffer.alloc(32,7),expanded=Buffer.from(hkdfSync('sha256',mediaKey,Buffer.alloc(0),'WhatsApp History Keys',112));
const cipher=createCipheriv('aes-256-cbc',expanded.subarray(16,48),expanded.subarray(0,16));const ciphertext=Buffer.concat([cipher.update(compressed),cipher.final()]);const encrypted=Buffer.concat([ciphertext,createHmac('sha256',expanded.subarray(48,80)).update(expanded.subarray(0,16)).update(ciphertext).digest().subarray(0,10)]);
const requests=[],states=new Map();let grants=0;
function state(name){if(!states.has(name))states.set(name,{attempts:0,bytes:Buffer.alloc(0),finals:0});return states.get(name)}
function send(res,status,value,extra={}){res.writeHead(status,{'content-type':'application/json',...extra});res.end(value===undefined?'':JSON.stringify(value))}
const api=http.createServer(async(req,res)=>{const parts=new URL(req.url,'http://fixture').pathname.split('/'),session=decodeURIComponent(parts[2]??'');let bytes=[];try{for await(const c of req)bytes.push(c);}catch{return;}const body=Buffer.concat(bytes);requests.push({boundary:'api',path:req.url,authorization:!!req.headers.authorization,version:req.headers['polymorfa-version'],type:req.headers['content-type'],body:body.toString('base64')});
if(req.url.includes('upload-grants')){const request=JSON.parse(body);if(Object.keys(request).some(k=>!['type','fileEncSha256','ptt'].includes(k)))return send(res,400,{});const kind=request.type==='file'?'document':request.type==='voice'?(request.ptt?'ptt':'audio'):request.type;grants++;return send(res,200,{data:{host:'mmg.whatsapp.net',uploadUrl:`https://mmg.whatsapp.net/mms/${kind}/${request.fileEncSha256}?auth=synthetic-grant-${grants}&token=kept&scenario=${session}`,expiresAt:2000000000}})}
if(req.url.includes('media/uploads')){const hash=new URL(req.url,'http://fixture').searchParams.get('fileEncSha256');if(sha(body).toString('base64url')!==hash)return send(res,415,{});return send(res,200,{data:{directPath:'/stored.enc',url:'https://mmg.whatsapp.net/stored.enc'}})}
if(req.url.includes('/messages/send'))return send(res,200,{success:true,data:{id:'message',whatsapp_ids:{linked_devices:'wa'},conversation:{id:'c'},timestamp:'2026-10-14',status:'sent',type:'image'}});return send(res,200,{data:{requestId:'request'}})});
const archiveVector=JSON.parse(readFileSync(path.join(process.cwd(),'contracts/fixtures/whatsapp-media.json'),'utf8')).fixtures.find(v=>v.kind==='image');
const archiveBytes=Buffer.from(archiveVector.encrypted,'hex');const archiveWaiting=[];
const cdn=https.createServer({key:readFileSync(path.join(directory,'key.pem')),cert:readFileSync(path.join(directory,'cert.pem'))},async(req,res)=>{
const url=new URL(req.url,'https://mmg.whatsapp.net');if(url.pathname==='/release-archive'){for(const pending of archiveWaiting.splice(0))pending.end(archiveBytes.subarray(-1));return send(res,200,{released:true});}
if(url.pathname==='/state')return send(res,200,{requests,grants,states:[...states].map(([name,s])=>({name,attempts:s.attempts,finals:s.finals,size:s.bytes.length}))});
requests.push({boundary:'cdn',path:req.url,authorization:!!req.headers.authorization,cookie:!!req.headers.cookie,origin:req.headers.origin,referer:req.headers.referer});
if(['/archive.enc','/archive-bad.enc','/archive-gate.enc'].includes(url.pathname)){const body=Buffer.from(archiveBytes);if(url.pathname==='/archive-bad.enc')body[0]^=1;res.writeHead(200,{'content-length':body.length});if(url.pathname==='/archive-gate.enc'){res.write(body.subarray(0,-1));archiveWaiting.push(res);}else res.end(body);return;}
if(url.pathname==='/history.enc'){if(url.searchParams.get('mms-type')!=='md-msg-hist')return send(res,400,{});res.writeHead(200,{'content-length':encrypted.length});res.end(encrypted);return;}
if(url.pathname==='/history-bad.enc'){let bad=Buffer.from(encrypted);bad[0]^=1;res.writeHead(200,{'content-length':bad.length});res.end(bad);return;}
const scenario=url.searchParams.get('scenario'),s=state(scenario),hash=url.pathname.split('/').at(-1);if(url.searchParams.get('resume'))return send(res,200,{resume:s.bytes.length?String(s.bytes.length):'0'});
if(url.searchParams.has('final_hash')){s.finals++;if(sha(s.bytes).toString('base64url')!==hash)return send(res,415,{});return send(res,200,{direct_path:'/stored.enc',url:'https://mmg.whatsapp.net/stored.enc',handle:'handle'});}
s.attempts++;
if(scenario==='redirect'){req.resume();return send(res,307,undefined,{location:'https://mmg.whatsapp.net/escape?secret=fixture'});}
let chunks=[];try{for await(const chunk of req)chunks.push(chunk);}catch{return;}const bytes=Buffer.concat(chunks);
if(scenario==='unauthorized'&&s.attempts===1)return send(res,401,{});
if(scenario==='retry'&&s.attempts===1){s.bytes=bytes.subarray(0,17);return send(res,408,{});}
const start=Number(url.searchParams.get('bytestart')??0),end=Number(url.searchParams.get('byteend')??bytes.length);if(bytes.length!==end-start)return send(res,400,{});
s.bytes=Buffer.concat([s.bytes.subarray(0,start),bytes]);if(url.searchParams.get('stream'))return send(res,200,{});
if(sha(s.bytes).toString('base64url')!==hash)return send(res,415,{});return send(res,200,{direct_path:'/stored.enc',url:'https://mmg.whatsapp.net/stored.enc',handle:'handle'});
});
await Promise.all([new Promise(r=>api.listen(0,'127.0.0.1',r)),new Promise(r=>cdn.listen(0,'127.0.0.1',r))]);
console.log(JSON.stringify({archive:archiveVector,apiPort:api.address().port,port:cdn.address().port,directory,certificate:readFileSync(authority).toString('base64'),history:{directPath:'/history.enc',mediaKey:mediaKey.toString('hex'),fileSha256:sha(compressed).toString('hex'),fileEncSha256:sha(encrypted).toString('hex'),fileLength:compressed.length},proto:proto.toString('base64'),zlib:compressed.toString('base64'),gzip:gzipSync(proto).toString('base64'),raw:deflateRawSync(proto).toString('base64')}));
