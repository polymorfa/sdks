import {createServer,request} from 'node:http';
const target=new URL(process.argv[2]);const maximum=Number(process.argv[3]);
const server=createServer(async(req,res)=>{
 let size=0;const parts=[];
 for await(const part of req){size+=part.length;if(size>maximum){res.writeHead(413,{'content-type':'application/json','connection':'close'});res.end('{"error":"ingress_body_too_large"}');return;}parts.push(part);}
 const body=Buffer.concat(parts);const headers={...req.headers,'content-length':String(body.length)};delete headers['transfer-encoding'];delete headers.host;
 const upstream=request(new URL(req.url,target),{method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});upstream.end(body);
});server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`})));
