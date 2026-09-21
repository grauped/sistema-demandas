const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createDatabase}=require('./database.cjs');
const {createAPI}=require('./api.cjs');
const files=new Set(['index.html','app.js','style.css','contratos.html','contracts.css','contracts.js','contracts-core.js','cost-report.js','access-policy.js','contract-pdf.js','login.html','auth.js','login.js','auth.css','assets/vendor/pdf-lib.min.js','assets/vendor/pdf.min.mjs','assets/vendor/pdf.worker.min.mjs','assets/contract-template.js','assets/contract-template.pdf']);
const publicFiles=new Set(['login.html','auth.js','login.js','auth.css','style.css']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.pdf':'application/pdf'};
function createServer({directory=path.join(__dirname,'data')}={}){
    const store=createDatabase(directory),api=createAPI(store);
    const server=http.createServer(async(req,res)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
        if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')){res.writeHead(403);res.end('Host não permitido');return;}
        let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
        if(pathname.startsWith('/api/')){await api.handle(req,res,pathname);return;}
        if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
        const name=pathname.slice(1)||'index.html';
        if(!files.has(name)){res.writeHead(404);res.end('Não encontrado');return;}
        const s=api.session(req);
        if(!publicFiles.has(name)&&!s){res.writeHead(302,{Location:'/login.html'});res.end();return;}
        if(['index.html','app.js'].includes(name)&&s?.role!=='gestora'){res.writeHead(name==='index.html'?302:403,name==='index.html'?{Location:'/contratos.html'}:{});res.end();return;}
        fs.readFile(path.join(__dirname,name),(err,content)=>{if(err){res.writeHead(500);res.end('Arquivo indisponível');return;}res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);});
    });
    server.on('close',()=>store.close());return {server,store};
}
if(require.main===module){const port=Number(process.argv[2]||8765);const {server}=createServer();server.listen(port,'127.0.0.1',()=>console.log(`Sistema disponível em http://127.0.0.1:${port}`));}
module.exports={createServer};
