import { definePolymorfa } from '@polymorfa/elements';
let client;
function mount() {
 if (document.querySelector('pmfa-inbox')) client ??= definePolymorfa({tokenEndpoint:'/api/polymorfa/token'});
 else {client?.dispose();client=undefined;}
}
document.addEventListener('htmx:afterSwap',mount);
document.addEventListener('htmx:responseError',()=> { const error=document.querySelector('#error');if(error)error.textContent='The request failed. Check your sign-in and try again.';});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
