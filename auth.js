'use strict';
window.Auth = (() => {
    let current=null;
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('institution-session') : null;
    if (channel) channel.onmessage = () => { document.body.classList.remove('auth-ready'); location.replace('/login.html'); };
    const legacyKeys=['sistema_instrutores_contratos_v1','sistema_demandas_v1'];
    async function api(path,{method='GET',data}={}){
        const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(current?{'X-CSRF-Token':current.csrf}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
        const result=await response.json();
        if(!response.ok){const error=Object.assign(new Error(result.error||'Não foi possível concluir a operação.'),{status:response.status});if(response.status===401&&path!=='/api/login')location.replace('/login.html');throw error;}
        return result;
    }
    async function migrate(){
        const contracts=localStorage.getItem(legacyKeys[0]),tasks=localStorage.getItem(legacyKeys[1]);
        if(!contracts&&!tasks)return;
        const payload={};if(contracts)payload.contracts=JSON.parse(contracts);if(tasks)payload.tasks=JSON.parse(tasks);
        payload.previousContractsBackup = localStorage.getItem('sistema_instrutores_contratos_v1_antes_restauracao');
        await api('/api/migrate',{method:'POST',data:payload});
        // Remover somente após a cópia transacional ter sido confirmada pelo servidor.
        legacyKeys.forEach(key=>localStorage.removeItem(key));
        localStorage.removeItem('sistema_instrutores_contratos_v1_antes_restauracao');
    }
    async function requireSession(role){
        current=await api('/api/session');
        if(role&&current.user.role!==role){location.replace('/contratos.html');throw new Error('Acesso restrito à gestora.');}
        if(current.user.role==='gestora'){
            try{await migrate();}catch(error){
                const warning=document.createElement('div');warning.className='auth-warning';warning.setAttribute('role','alert');warning.textContent='Os dados antigos foram preservados, mas a importação precisa de revisão: '+error.message;document.body.prepend(warning);
            }
        }
        mount();return current.user;
    }
    function mount(){
        document.body.dataset.role=current.user.role;
        document.querySelectorAll('[data-manager-only]').forEach(el=>el.hidden=current.user.role!=='gestora');
        const bar=document.createElement('div');bar.className='auth-bar';
        const label=document.createElement('span');label.textContent=current.user.label+' · '+current.user.username;
        const password=document.createElement('button');password.className='text-button';password.textContent='Alterar senha';password.addEventListener('click',()=>location.assign('/login.html?senha=1'));
        const logout=document.createElement('button');logout.className='btn-secondary';logout.textContent='Sair';logout.addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST',data:{}});channel?.postMessage('logout');location.replace('/login.html');}catch(error){label.textContent=error.message;}});
        bar.append(label,password,logout);document.querySelector('main')?.prepend(bar);
        document.body.classList.add('auth-ready');
    }
    async function login(username,password){current=await api('/api/login',{method:'POST',data:{username,password}});channel?.postMessage('login');return current.user;}
    async function session(){current=await api('/api/session');return current.user;}
    window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
    window.addEventListener('focus',async()=>{if(!current||!document.body.classList.contains('auth-protected'))return;try{const live=await api('/api/session');if(live.user.username!==current.user.username){document.body.classList.remove('auth-ready');location.replace('/login.html');}}catch{document.body.classList.remove('auth-ready');}});
    return {api,requireSession,login,session,get user(){return current?.user;}};
})();
