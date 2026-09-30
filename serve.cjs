const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const allowed = new Set(['index.html','styles.css','geometry.js','app.js']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server = http.createServer((req,res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\//,'') || 'index.html'; }
  catch (_) {res.writeHead(400).end();return;}
  if(!allowed.has(name)){res.writeHead(404).end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  fs.readFile(path.join(__dirname,name),(err,buffer)=>{
    if(err){res.writeHead(500).end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:buffer);
  });
});
server.listen(5191,'127.0.0.1',()=>console.log('Perspective Grid: http://127.0.0.1:5191'));
