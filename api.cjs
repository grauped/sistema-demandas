const Approval=require('./approval.cjs');
const crypto=require('node:crypto');
const {passwordHash,passwordMatches,digest,ACCOUNTS}=require('./database.cjs');
const C=require('./contracts-core.js');
const P=require('./access-policy.js');
const error=(status,message)=>Object.assign(new Error(message),{status});
function validPassword(value){if(typeof value!=='string'||value.length<10||value.length>128)throw error(400,'Use uma senha de 10 a 128 caracteres.');}
function validateTasks(tasks){
    if(!Array.isArray(tasks)||tasks.length>50000)throw error(400,'Lista de demandas inválida.');
    const ids=new Set();
    for(const task of tasks){
        if(!task||typeof task.id!=='string'||!task.id||ids.has(task.id)||typeof task.title!=='string'||!task.title.trim()||!C.validDate(task.date)||typeof task.completed!=='boolean')throw error(400,'Demanda inválida.');
        ids.add(task.id);for(const key of ['description','category','time','priority','recurrence'])if(typeof task[key]!=='string')throw error(400,'Dados da demanda inválidos.');
    }return tasks;
}
async function body(req){
    if(!req.headers['content-type']?.startsWith('application/json'))throw error(415,'Envie dados em JSON.');
    let text='',size=0;for await(const part of req){size+=part.length;if(size>10*1024*1024)throw error(413,'O arquivo excede 10 MB.');text+=part;}
    try{return JSON.parse(text);}catch{throw error(400,'JSON inválido.');}
}
function createAPI(store){
    const {db}=store,attempts=new Map();
    const setupDone=()=>db.prepare("SELECT COUNT(*) count FROM users WHERE digest<>''").get().count===3;
    const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    function session(req){const token=(req.headers.cookie||'').split(';').map(item=>item.trim()).find(item=>item.startsWith('session='))?.slice(8);if(!token)return null;return db.prepare('SELECT sessions.*,users.role FROM sessions JOIN users USING(username) WHERE token=? AND expires>?').get(digest(token),Date.now());}
    function openSession(res,username){
        const token=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(32).toString('base64url');
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),username,csrf,Date.now()+8*60*60*1000);
        res.setHeader('Set-Cookie',`session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);return csrf;
    }
    const manager=s=>{if(s.role!=='gestora')throw error(403,'Somente a gestora pode acessar esta operação.');};
    const stale=(incoming,current)=>{if(incoming!==current)throw error(409,'Os dados foram alterados em outra aba. Recarregue a página antes de salvar.');};
    async function handle(req,res,pathname){
        try{
            const method=req.method;
            if(!['GET','POST','PUT'].includes(method))throw error(405,'Método não permitido.');
            if(method!=='GET'&&((req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)||req.headers['sec-fetch-site']==='cross-site'))throw error(403,'Origem não permitida.');
            if(pathname==='/api/status'&&method==='GET'){json(res,200,{setupRequired:!setupDone(),accounts:ACCOUNTS});return;}
            if(pathname==='/api/setup'&&method==='POST'){
                if(setupDone())throw error(403,'As senhas iniciais já foram definidas.');
                const input=await body(req);const users=[];
                if(Object.keys(input).some(key=>!Object.keys(ACCOUNTS).includes(key)))throw error(400,'Somente os três acessos autorizados podem ser configurados.');
                for(const [role,username] of Object.entries(ACCOUNTS)){validPassword(input[role]);users.push({username,...await passwordHash(input[role])});}
                store.transaction(()=>{if(setupDone())throw error(403,'As senhas iniciais já foram definidas.');for(const user of users)db.prepare('UPDATE users SET salt=?,digest=? WHERE username=?').run(user.salt,user.digest,user.username);});
                json(res,201,{ok:true});return;
            }
            if(pathname==='/api/login'&&method==='POST'){
                if(!setupDone())throw error(409,'Defina as senhas no primeiro acesso.');
                const input=await body(req);if(typeof input.username!=='string'||typeof input.password!=='string'||input.password.length>128)throw error(400,'Informe e-mail e senha.');
                const username=input.username.trim().toLowerCase(),key=(req.socket.remoteAddress||'')+':'+username,attempt=attempts.get(key);
                if(attempt&&attempt.until>Date.now()&&attempt.count>=5)throw error(429,'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
                const user=Object.values(ACCOUNTS).includes(username)?db.prepare('SELECT * FROM users WHERE username=?').get(username):null;
                if(!await passwordMatches(input.password,user)){const count=attempt&&attempt.until>Date.now()?attempt.count+1:1;attempts.set(key,{count,until:Date.now()+15*60*1000});throw error(401,'E-mail ou senha incorretos.');}
                attempts.delete(key);const prior=session(req);if(prior)db.prepare('DELETE FROM sessions WHERE token=?').run(prior.token);
                json(res,200,{user:{username,role:user.role,label:P.roles[user.role].label},csrf:openSession(res,username)});return;
            }
            const s=session(req);if(!s)throw error(401,'Entre com seu e-mail e senha.');
            if(method!=='GET'&&req.headers['x-csrf-token']!==s.csrf)throw error(403,'Sessão inválida. Entre novamente.');
            if(pathname==='/api/session'&&method==='GET'){json(res,200,{user:{username:s.username,role:s.role,label:P.roles[s.role].label},csrf:s.csrf});return;}
            if(pathname==='/api/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(s.token);res.setHeader('Set-Cookie','session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');json(res,200,{ok:true});return;}
            if(pathname==='/api/password'&&method==='POST'){
                const input=await body(req);validPassword(input.newPassword);const user=db.prepare('SELECT * FROM users WHERE username=?').get(s.username);
                if(typeof input.currentPassword!=='string'||input.currentPassword.length>128||!await passwordMatches(input.currentPassword,user))throw error(400,'Senha atual incorreta.');
                const hash=await passwordHash(input.newPassword);store.transaction(()=>{db.prepare('UPDATE users SET salt=?,digest=? WHERE username=?').run(hash.salt,hash.digest,s.username);db.prepare('DELETE FROM sessions WHERE username=?').run(s.username);});
                res.setHeader('Set-Cookie','session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');json(res,200,{ok:true});return;
            }
            if(pathname==='/api/contracts/approval'&&method==='POST'){
                manager(s);const input=await body(req);
                if(!['approved','pending'].includes(input.status))throw error(400,'Situação inválida.');
                const result=store.transaction(()=>{
                    const current=store.read('contracts');stale(input.revision,current.revision);
                    const item=current.data.contracts.find(item=>item.id===input.id);
                    if(!item)throw error(404,'Contrato não encontrado.');
                    if(item.cancelled)throw error(400,'Reative o contrato antes de aprovar.');
                    item.approvalStatus=input.status;item.approvedBy=input.status==='approved'?s.username:null;
                    item.approvedAt=input.status==='approved'?new Date().toISOString():null;
                    return {data:P.select(current.data,s.role),revision:store.write('contracts',current.data)};
                });json(res,200,result);return;
            }
            if(pathname==='/api/contracts'&&method==='GET'){const current=store.read('contracts');json(res,200,{data:P.select(current.data,s.role),revision:current.revision});return;}
            if(pathname==='/api/contracts'&&method==='PUT'){
                const input=await body(req);const result=store.transaction(()=>{
                    const current=store.read('contracts');stale(input.revision,current.revision);const next=P.merge(current.data,input.data,s.role);
                    const existing=new Map(current.data.contracts.map(item=>[item.id,item]));
                    const prefix='SC-'+new Date().getFullYear()+'-';
                    let sequence=Math.max(0,...current.data.contracts.filter(item=>item.number.startsWith(prefix)).map(item=>Number(item.number.slice(prefix.length))));
                    for(const item of next.contracts){if(existing.has(item.id))item.number=existing.get(item.id).number;else item.number=prefix+String(++sequence).padStart(4,'0');}
                    Approval.enforce(current.data,next);
                    if(input.restore)db.prepare('INSERT INTO backups(role,created,value) VALUES(?,?,?)').run(s.role,new Date().toISOString(),JSON.stringify(P.select(current.data,s.role)));
                    return {data:P.select(next,s.role),revision:store.write('contracts',next)};
                });json(res,200,result);return;
            }
            if(pathname==='/api/backup/previous'&&method==='GET'){const previous=db.prepare('SELECT value FROM backups WHERE role=? ORDER BY id DESC LIMIT 1').get(s.role);json(res,200,{data:previous?JSON.parse(previous.value):null});return;}
            if(pathname==='/api/tasks'){
                manager(s);if(method==='GET'){json(res,200,store.read('tasks'));return;}
                if(method==='PUT'){const input=await body(req);validateTasks(input.data);const revision=store.transaction(()=>{stale(input.revision,store.read('tasks').revision);return store.write('tasks',input.data);});json(res,200,{revision});return;}
            }
            if(pathname==='/api/migrate'&&method==='POST'){
                manager(s);const input=await body(req),migrationId='browser-v1';
                if(db.prepare('SELECT name FROM migrations WHERE name=?').get(migrationId))throw error(409,'Os dados antigos já foram importados.');
                const contracts=input.contracts?P.normalize(input.contracts):null,tasks=input.tasks?validateTasks(input.tasks):null;
                store.transaction(()=>{
                    if(db.prepare('SELECT name FROM migrations WHERE name=?').get(migrationId))throw error(409,'Os dados antigos já foram importados.');
                    if(contracts){const old=store.read('contracts').data;if(old.instructors.length||old.contracts.length)throw error(409,'O banco já contém cadastros. Revise a importação com a gestora.');Approval.enforce({contracts:[]},contracts);store.write('contracts',contracts);}
                    if(tasks){if(store.read('tasks').data.length)throw error(409,'O banco já contém demandas. Revise a importação com a gestora.');store.write('tasks',tasks);}
                    db.prepare('INSERT INTO backups(role,created,value) VALUES(?,?,?)').run('legacy',new Date().toISOString(),JSON.stringify(input));db.prepare('INSERT INTO migrations VALUES(?,?)').run(migrationId,new Date().toISOString());
                });json(res,200,{ok:true});return;
            }
            throw error(404,'Operação não encontrada.');
        }catch(err){json(res,err.status||400,{error:err.message||'Não foi possível concluir a operação.'});}
    }
    return {handle,session,setupDone};
}
module.exports={createAPI,validateTasks};
