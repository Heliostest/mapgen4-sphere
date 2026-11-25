import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=process.cwd(),port=Number(process.env.PORT||8017);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.css':'text/css','.md':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/experiments/exoplasim/':url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
 if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
 const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless'}).end(body);
}catch{res.writeHead(404).end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`ExoPlaSim comparison: http://127.0.0.1:${port}/experiments/exoplasim/`));
