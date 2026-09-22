const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('./contracts-core.js');
const P=require('./access-policy.js');
const {createServer}=require('./server.cjs');
const {ACCOUNTS}=require('./database.cjs');
const passwords={gestora:'Teste-Gestora-2026!',exatas:'Teste-Exatas-2026!',saude:'Teste-Saude-2026!'};
function instructor(id,department){return {id,department,name:'Instrutor '+id,document:id,contact:'',address:'Rua Exemplo',number:'1',complement:'',neighborhood:'Centro',city:'Mossoró',state:'RN',postalCode:'00000-000',pix:'teste@example.com',pixType:'email',active:true,documents:{rg:false,cpf:false,residence:false,degree:false,other:false}};}
function contract(id,person,course){return {id,number:'SC-2026-0001',department:P.courseDepartment(course),instructorId:person.id,instructorSnapshot:structuredClone(person),course,group:'10',shift:'M',discipline:'Disciplina '+course,type:'theory',hoursUnits:1000,hourRateCents:2000,amountCents:20000,startDate:'2026-09-01',endDate:'2026-10-01',referenceDate:'2026-10-01',requestDate:'2026-09-17',requester:'Teste',notes:'',cancelled:false};}
test('migração separa instrutor compartilhado e mantém não classificados exclusivos da gestora',()=>{
    const shared=instructor('shared',undefined),unknown=instructor('unknown',undefined);
    const data=P.normalize({...C.empty(),instructors:[shared,unknown],contracts:[contract('1',shared,'ADM'),contract('2',shared,'ENF')]});
    assert.equal(data.instructors.length,3);
    assert.equal(P.select(data,'exatas').instructors.length,1);
    assert.equal(P.select(data,'saude').instructors.length,1);
    assert.equal(P.select(data,'gestora').instructors.length,3);
    assert.notEqual(data.contracts[0].instructorId,data.contracts[1].instructorId);
    assert.deepEqual(P.normalize(data),data);
});
test('permissões incluem os novos cursos nas coordenações corretas',()=>{
    for (const course of ['ELP','BCV']) assert.equal(P.courseDepartment(course),'exatas');
    for (const course of ['EIC','FLB']) assert.equal(P.courseDepartment(course),'saude');
});
test('servidor autentica apenas os três e-mails e isola consultas, gravações, demandas e backups',async t=>{
    const parent=path.join(__dirname,'tmp');fs.mkdirSync(parent,{recursive:true});
    const directory=fs.mkdtempSync(path.join(parent,'access-test-'));
    const {server,store}=createServer({directory});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
    async function call(route,{method='GET',data,session,csrf=true,headers={}}={}){
        const response=await fetch(base+route,{method,redirect:'manual',headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,...(csrf?{'X-CSRF-Token':session.csrf}:{})}:{}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
        const text=await response.text();let result;try{result=JSON.parse(text);}catch{result=text;}
        return {status:response.status,data:result,headers:response.headers};
    }
    assert.equal((await call('/api/contracts')).status,401);
    assert.equal((await call('/contratos.html')).status,302);
    assert.equal((await call('/api/setup',{method:'POST',data:{...passwords,outro:'NaoPermitido!'}})).status,400);
    assert.equal((await call('/api/setup',{method:'POST',data:passwords})).status,201);
    assert.equal(store.db.prepare('SELECT count(*) n FROM users').get().n,3);
    assert.equal((await call('/api/setup',{method:'POST',data:passwords})).status,403);
    assert.equal((await call('/api/login',{method:'POST',data:{username:'outro@gmail.com',password:passwords.gestora}})).status,401);
    const sessions={};
    for(const [role,username] of Object.entries(ACCOUNTS)){
        const result=await call('/api/login',{method:'POST',data:{username,password:passwords[role],role:'gestora'}});
        assert.equal(result.status,200);assert.equal(result.data.user.role,role);
        assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.match(result.headers.get('set-cookie'),/SameSite=Strict/);
        sessions[role]={cookie:result.headers.get('set-cookie').split(';')[0],csrf:result.data.csrf};
        assert.notEqual(store.db.prepare('SELECT digest FROM users WHERE username=?').get(username).digest,passwords[role]);
    }
    const ex=instructor('ex','exatas'),sa=instructor('sa','saude');
    const initial={...C.empty(),instructors:[ex,sa],contracts:[contract('ex-contract',ex,'ADM'),contract('sa-contract',sa,'ENF')]};
    let manager=await call('/api/contracts',{session:sessions.gestora});
    assert.equal((await call('/api/contracts',{method:'PUT',session:sessions.gestora,csrf:false,data:{data:initial,revision:manager.data.revision}})).status,403);
    const saved=await call('/api/contracts',{method:'PUT',session:sessions.gestora,data:{data:initial,revision:manager.data.revision}});
    assert.equal(saved.status,200);assert.equal(new Set(saved.data.data.contracts.map(item=>item.number)).size,2);
    for(const role of ['exatas','saude']){
        const scoped=await call('/api/contracts',{session:sessions[role]});assert.equal(scoped.status,200);
        assert.equal(scoped.data.data.instructors.length,1);assert.equal(scoped.data.data.contracts.length,1);
        assert.equal(scoped.data.data.instructors[0].department,role);
        assert.equal((await call('/api/tasks',{session:sessions[role]})).status,403);
        assert.equal((await call('/api/tasks',{method:'PUT',session:sessions[role],data:{data:[],revision:0}})).status,403);
        assert.equal((await call('/index.html',{session:sessions[role]})).headers.get('location'),'/contratos.html');
        assert.equal((await call('/app.js',{session:sessions[role]})).status,403);
        const wrong=structuredClone(scoped.data.data);wrong.instructors.push(role==='exatas'?sa:ex);
        assert.notEqual((await call('/api/contracts',{method:'PUT',session:sessions[role],data:{data:wrong,revision:scoped.data.revision}})).status,200);
    }
    const exScope=(await call('/api/contracts',{session:sessions.exatas})).data;
    exScope.data.instructors[0].name='Exatas atualizado';
    const updated=await call('/api/contracts',{method:'PUT',session:sessions.exatas,data:{...exScope,restore:true}});assert.equal(updated.status,200);
    assert.equal((await call('/api/contracts',{session:sessions.saude})).data.data.instructors[0].name,sa.name);
    assert.equal((await call('/api/backup/previous',{session:sessions.exatas})).data.data.instructors.length,1);
    assert.equal((await call('/api/backup/previous',{session:sessions.saude})).data.data,null);
    assert.equal((await call('/api/contracts',{method:'PUT',session:sessions.exatas,data:exScope})).status,409);
    assert.equal((await call('/api/contracts',{method:'PUT',session:sessions.exatas,headers:{Origin:'https://outro.example'},data:exScope})).status,403);
    manager=await call('/api/contracts',{session:sessions.gestora});assert.equal(manager.data.data.instructors.length,2);
    assert.equal((await call('/data/sistema.sqlite',{session:sessions.gestora})).status,404);
    // Approval cannot be forged through scoped saves or backup restores.
    let scope=(await call('/api/contracts',{session:sessions.exatas})).data;
    scope.data.contracts[0].approvalStatus='approved';scope.data.contracts[0].approvedBy=ACCOUNTS.gestora;
    let response=await call('/api/contracts',{method:'PUT',session:sessions.exatas,data:{...scope,restore:true}});
    assert.equal(response.status,200);assert.equal(response.data.data.contracts[0].approvalStatus,'pending');
    assert.equal(C.report(response.data.data.contracts,C.cycle('2026-09')).total,0);
    let revision=response.data.revision;
    assert.equal((await call('/api/contracts/approval',{method:'POST',session:sessions.exatas,data:{id:'ex-contract',status:'approved',revision}})).status,403);
    assert.equal((await call('/api/contracts/approval',{method:'POST',session:sessions.gestora,data:{id:'ex-contract',status:'approved',revision:revision-1}})).status,409);
    response=await call('/api/contracts/approval',{method:'POST',session:sessions.gestora,data:{id:'ex-contract',status:'approved',revision}});
    assert.equal(response.status,200);assert.equal(response.data.data.contracts.find(x=>x.id==='ex-contract').approvedBy,ACCOUNTS.gestora);
    assert.equal(C.report(response.data.data.contracts,C.cycle('2026-09')).total,20000);
    scope=(await call('/api/contracts',{session:sessions.exatas})).data;
    scope.data.settings.requester='Novo solicitante padrão';
    response=await call('/api/contracts',{method:'PUT',session:sessions.exatas,data:scope});
    assert.equal(response.data.data.contracts[0].approvalStatus,'approved');
    scope=response.data;scope.data.contracts[0].discipline='Disciplina corrigida';
    response=await call('/api/contracts',{method:'PUT',session:sessions.exatas,data:scope});
    assert.equal(response.data.data.contracts[0].approvalStatus,'pending');assert.equal(response.data.data.contracts[0].approvedBy,null);
    assert.equal(C.report(response.data.data.contracts,C.cycle('2026-09')).total,0);
    assert.equal((await call('/api/logout',{method:'POST',session:sessions.exatas,data:{}})).status,200);
    assert.equal((await call('/api/contracts',{session:sessions.exatas})).status,401);
    assert.equal((await call('/api/register',{method:'POST',session:sessions.gestora,data:{username:'novo@gmail.com'}})).status,404);
});

test('login sem socket autentica e mantém limite de tentativas',async()=>{
    const {Readable}=require('node:stream');
    const {createAPI}=require('./api.cjs');
    const {passwordHash}=require('./database.cjs');
    const user={username:ACCOUNTS.exatas,role:'exatas',...await passwordHash(passwords.exatas)};
    const sessions=[];
    const api=createAPI({setupDone:async()=>true,getUser:async()=>user,clearExpiredSessions:async()=>{},createSession:async value=>sessions.push(value)});
    async function login(socket,password){
        const req=Readable.from([Buffer.from(JSON.stringify({username:user.username,password}))]);
        Object.assign(req,{method:'POST',headers:{'content-type':'application/json','x-forwarded-proto':'https'},socket});
        const result={headers:{}};
        const res={writeHead(status){result.status=status;},setHeader(key,value){result.headers[key]=value;},end(value){result.data=JSON.parse(value);}};
        await api.handle(req,res,'/api/login');return result;
    }
    for(const socket of [null,undefined]){
        const result=await login(socket,passwords.exatas);
        assert.equal(result.status,200);
        assert.equal(result.data.user.role,'exatas');
        assert.match(result.headers['Set-Cookie'],/Secure/);
        assert.ok(result.data.csrf);
    }
    assert.equal(sessions.length,2);
    for(let i=0;i<5;i++)assert.equal((await login(null,'senha-incorreta')).status,401);
    assert.equal((await login(null,'senha-incorreta')).status,429);
});
