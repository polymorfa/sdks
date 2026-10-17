import {createServer} from 'node:http';
const state={requests:0,followed:0,valid:true};
const server=createServer(async(req,res)=>{
 if(req.url==='/state'){res.setHeader('content-type','application/json');res.end(JSON.stringify(state));return;}
 state.requests++;if(req.url.startsWith('/credential-leak'))state.followed++;
 state.valid&&=req.headers.authorization==='Bearer pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'&&!req.headers.cookie;
 let raw='';for await(const part of req)raw+=part;
 if(req.method==='POST')state.valid&&=req.headers['idempotency-key']==='status-key'&&raw==='{"synthetic":true}';
 const match=req.url.match(/(?:case-|status\/)(\d{3})/);const status=match?Number(match[1]):200;
 const shape=req.url.match(/shape=([^&]+)/)?.[1]??'object';
 const body=shape==='empty'?'':shape==='scalar'?'7':shape==='list'?'[1,2]':shape==='null'?'null':shape==='bad'?'<synthetic>':'{"data":{"id":"synthetic"}}';
 res.writeHead(status,{'content-type':'application/json','x-request-id':'status-'+status,'polymorfa-version':'2026-09-22','x-caller-secret':'must-not-leak','location':`http://127.0.0.1:${server.address().port}/credential-leak?capability=must-not-leak`,'content-length':Buffer.byteLength(body),'connection':'close'});res.end(body);
});server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`})));
