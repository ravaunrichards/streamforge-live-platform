const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const ROOT = __dirname, PUB = path.join(ROOT, 'public'), DATA = path.join(ROOT, 'data', 'db.json');
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.SESSION_SECRET || 'local-development-secret-change-before-deploy';
fs.mkdirSync(path.dirname(DATA), {recursive:true});
function load(){try{return JSON.parse(fs.readFileSync(DATA,'utf8'))}catch{return {users:[],channels:[],messages:[]}}}
let db=load();
function save(){fs.writeFileSync(DATA,JSON.stringify(db,null,2))}
function send(res,status,obj,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(obj))}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e6){reject(Error('Request too large'));req.destroy()}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch{reject(Error('Invalid JSON'))}});req.on('error',reject)})}
function token(user){const payload=Buffer.from(JSON.stringify({id:user.id,exp:Date.now()+7*864e5})).toString('base64url');const sig=crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');return payload+'.'+sig}
function current(req){const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!t)return null;const [p,s]=t.split('.');if(!p||!s)return null;const expected=crypto.createHmac('sha256',SECRET).update(p).digest();let actual;try{actual=Buffer.from(s,'base64url')}catch{return null}if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;try{const x=JSON.parse(Buffer.from(p,'base64url'));return x.exp>Date.now()?db.users.find(u=>u.id===x.id)||null:null}catch{return null}}
function safeUser(u){return {id:u.id,username:u.username,displayName:u.displayName,bio:u.bio||'',createdAt:u.createdAt}}
async function route(req,res){
 const u=new URL(req.url,'http://localhost');const p=u.pathname;
 if(req.method==='GET'&&p==='/api/health')return send(res,200,{ok:true,service:'StreamForge'});
 if(req.method==='POST'&&p==='/api/register'){const b=await body(req);const username=String(b.username||'').trim().toLowerCase();const password=String(b.password||'');if(!/^[a-z0-9_]{3,24}$/.test(username)||password.length<8)return send(res,400,{error:'Username must be 3–24 letters, numbers or underscores; password needs 8+ characters'});if(db.users.some(x=>x.username===username))return send(res,409,{error:'Username already exists'});const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(password,salt,64).toString('hex');const user={id:crypto.randomUUID(),username,displayName:String(b.displayName||username).slice(0,60),bio:'',salt,hash,createdAt:new Date().toISOString()};db.users.push(user);save();return send(res,201,{token:token(user),user:safeUser(user)})}
 if(req.method==='POST'&&p==='/api/login'){const b=await body(req);const user=db.users.find(x=>x.username===String(b.username||'').toLowerCase());if(!user||crypto.scryptSync(String(b.password||''),user.salt,64).toString('hex')!==user.hash)return send(res,401,{error:'Invalid username or password'});return send(res,200,{token:token(user),user:safeUser(user)})}
 const me=current(req);
 if(req.method==='GET'&&p==='/api/me')return me?send(res,200,{user:safeUser(me)}):send(res,401,{error:'Sign in required'});
 if(req.method==='GET'&&p==='/api/channels'){const list=db.channels.filter(c=>!u.searchParams.get('q')||`${c.title} ${c.category} ${c.username}`.toLowerCase().includes(u.searchParams.get('q').toLowerCase())).sort((a,b)=>Number(b.isLive)-Number(a.isLive)||b.createdAt.localeCompare(a.createdAt));return send(res,200,{channels:list})}
 if(req.method==='POST'&&p==='/api/channels'){if(!me)return send(res,401,{error:'Sign in required'});const b=await body(req);const title=String(b.title||'').trim();if(title.length<3||title.length>100)return send(res,400,{error:'Title must be 3–100 characters'});const c={id:crypto.randomUUID(),ownerId:me.id,username:me.username,title,category:String(b.category||'Just Chatting').slice(0,50),description:String(b.description||'').slice(0,500),isLive:false,createdAt:new Date().toISOString(),startedAt:null};db.channels.unshift(c);save();return send(res,201,{channel:c})}
 const cm=p.match(/^\/api\/channels\/([^/]+)$/);
 if(cm&&req.method==='GET'){const c=db.channels.find(x=>x.id===cm[1]);return c?send(res,200,{channel:c}):send(res,404,{error:'Channel not found'})}
 if(cm&&req.method==='POST'){if(!me)return send(res,401,{error:'Sign in required'});const c=db.channels.find(x=>x.id===cm[1]);if(!c)return send(res,404,{error:'Channel not found'});if(c.ownerId!==me.id)return send(res,403,{error:'Only the channel owner can change stream status'});const b=await body(req);c.isLive=Boolean(b.isLive);c.startedAt=c.isLive?(c.startedAt||new Date().toISOString()):null;save();return send(res,200,{channel:c})}
 const mm=p.match(/^\/api\/channels\/([^/]+)\/messages$/);
 if(mm&&req.method==='GET'){const c=db.channels.find(x=>x.id===mm[1]);if(!c)return send(res,404,{error:'Channel not found'});return send(res,200,{messages:db.messages.filter(m=>m.channelId===c.id).slice(-100)})}
 if(mm&&req.method==='POST'){if(!me)return send(res,401,{error:'Sign in required'});const c=db.channels.find(x=>x.id===mm[1]);if(!c)return send(res,404,{error:'Channel not found'});const b=await body(req);const text=String(b.text||'').trim();if(!text||text.length>1000)return send(res,400,{error:'Message must be 1–1000 characters'});const m={id:crypto.randomUUID(),channelId:c.id,userId:me.id,username:me.username,text,createdAt:new Date().toISOString()};db.messages.push(m);save();return send(res,201,{message:m})}
 if(req.method==='GET'&&p.startsWith('/api/'))return send(res,404,{error:'API route not found'});
 const rel=p==='/'?'index.html':path.normalize(decodeURIComponent(p)).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/,'');const f=path.join(PUB,rel);if(!f.startsWith(PUB+path.sep)&&f!==path.join(PUB,'index.html'))return send(res,403,{error:'Forbidden'});fs.readFile(f,(e,d)=>{if(e)return send(res,404,{error:'Not found'});const ext=path.extname(f);const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','x-content-type-options':'nosniff'});res.end(d)})
}
http.createServer((req,res)=>route(req,res).catch(e=>send(res,400,{error:e.message||'Bad request'}))).listen(PORT,()=>console.log(`StreamForge running at http://localhost:${PORT}`));
