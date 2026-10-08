import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
const root=process.cwd(), port=Number(process.env.PORT || 8000);
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.data':'application/octet-stream','.png':'image/png'};
createServer(async(req,res)=> {
    try {
        const url=new URL(req.url,'http://localhost');
        if (url.pathname==='/favicon.ico') { res.writeHead(204);res.end();return; }
        const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/' ? '/embed.html' : url.pathname));
        if (!path.startsWith(root+sep)) { res.writeHead(403); res.end(); return; }
        const body=await readFile(path);
        res.writeHead(200,{'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'});
        res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port,'127.0.0.1',()=>console.log(`Mapgen4 sphere: http://localhost:${port}/embed.html`));
