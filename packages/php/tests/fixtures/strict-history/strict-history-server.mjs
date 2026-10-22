import http from 'node:http';
import https from 'node:https';
import { createHash, createHmac, hkdfSync, createCipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
const root=process.env.POLYMORFA_TEST_WORK_DIR??path.join(homedir(),'.polymorfa-agent-work','zk-program-20261014','native-customer-peers');mkdirSync(root,{recursive:true});
const directory=mkdtempSync(path.join(root,'peer-'));
const authority=path.join(directory,'authority.pem'),authorityKey=path.join(directory,'authority-key.pem');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',authorityKey,'-out',authority,'-subj','/CN=PolymorfaSyntheticRoot','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-addext','subjectKeyIdentifier=hash'],{stdio:'ignore'});
execFileSync('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',path.join(directory,'key.pem'),'-out',path.join(directory,'request.pem'),'-subj','/CN=mmg.whatsapp.net'],{stdio:'ignore'});
writeFileSync(path.join(directory,'extensions.txt'),'basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:mmg.whatsapp.net\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always,issuer\n');
execFileSync('openssl',['x509','-req','-in',path.join(directory,'request.pem'),'-CA',authority,'-CAkey',authorityKey,'-CAcreateserial','-out',path.join(directory,'cert.pem'),'-days','1','-extfile',path.join(directory,'extensions.txt')],{stdio:'ignore'});

const corpus = JSON.parse(readFileSync(new URL('./strict-history.json', import.meta.url)));
const bytes = name => Buffer.from(corpus.streams[name].input, 'base64');
const sha = b => createHash('sha256').update(b).digest();
const key = Buffer.alloc(32, 7);
const material = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'WhatsApp History Keys', 112));
const encrypt = compressed => {
 const cipher = createCipheriv('aes-256-cbc', material.subarray(16,48), material.subarray(0,16));
 const body = Buffer.concat([cipher.update(compressed),cipher.final()]);
 const encrypted = Buffer.concat([body,createHmac('sha256',material.subarray(48,80)).update(material.subarray(0,16)).update(body).digest().subarray(0,10)]);
 return { encrypted, descriptor:{directPath:'',mediaKey:key.toString('hex'),fileSha256:sha(compressed).toString('hex'),fileEncSha256:sha(encrypted).toString('hex'),fileLength:compressed.length} };
};
const gzip = bytes('provider-gzip'); const corrupt = Buffer.from(gzip); corrupt[corrupt.length-8]^=1;
const cases = {gzip,zlib:bytes('provider-zlib'),raw:bytes('provider-raw'),tail:Buffer.concat([gzip,Buffer.from([0])]),concat:Buffer.concat([gzip,bytes('empty-gzip')]),checksum:corrupt,large:bytes('large-gzip'),gate:gzip};
const files = Object.fromEntries(Object.entries(cases).map(([name,data])=>[name,encrypt(data)]));
const descriptors = Object.fromEntries(Object.entries(files).map(([name,v])=>[name,{...v.descriptor,directPath:`/${name}.enc`}]));
const requests=[];let waiting=0;
const cdn=https.createServer({key:readFileSync(path.join(directory,'key.pem')),cert:readFileSync(path.join(directory,'cert.pem'))},(req,res)=>{
 const url=new URL(req.url,'https://mmg.whatsapp.net');
 if(url.pathname==='/state'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({requests,waiting}));return;}
 const name=url.pathname.slice(1,-4);
 requests.push({path:url.pathname,mms:url.searchParams.get('mms-type'),authorization:!!req.headers.authorization,cookie:!!req.headers.cookie,origin:req.headers.origin??null,referer:req.headers.referer??null,version:!!req.headers['polymorfa-version']});
 const entry=files[name==='tampered'?'gzip':name];if(!entry){res.writeHead(404);res.end();return;}
 const body=Buffer.from(entry.encrypted);if(name==='tampered')body[0]^=1;
 res.writeHead(200,{'content-length':body.length});
 if(name==='gate'){waiting++;res.write(body.subarray(0,-1));req.on('close',()=>{waiting--;});}else res.end(body);
});
await new Promise(r=>cdn.listen(0,'127.0.0.1',r));
console.log(JSON.stringify({port:cdn.address().port,directory,certificate:readFileSync(authority).toString('base64'),descriptors}));
