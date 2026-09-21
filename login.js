'use strict';
(() => {
    const $=id=>document.getElementById(id);
    function showError(message){$('loginError').textContent=message;}
    async function submit(form,action){const button=form.querySelector('button[type="submit"]');button.disabled=true;showError('');try{await action();}catch(error){showError(error.message);}finally{button.disabled=false;}}
    $('loginForm').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{const user=await Auth.login($('email').value,$('password').value);$('password').value='';location.replace(user.role==='gestora'?'/index.html':'/contratos.html');});});
    $('setupForm').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{
        const data={};for(const role of ['gestora','exatas','saude']){if($(role+'Password').value!==$(role+'Confirm').value)throw new Error('A confirmação de senha de '+role+' não confere.');data[role]=$(role+'Password').value;}
        await Auth.api('/api/setup',{method:'POST',data});
        const status=await Auth.api('/api/status');await Auth.login(status.accounts.gestora,data.gestora);
        $('setupForm').reset();location.replace('/index.html');
    });});
    $('passwordForm').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{
        if($('newPassword').value!==$('confirmPassword').value)throw new Error('A confirmação da nova senha não confere.');
        await Auth.api('/api/password',{method:'POST',data:{currentPassword:$('currentPassword').value,newPassword:$('newPassword').value}});$('passwordForm').reset();location.replace('/login.html');
    });});
    (async()=>{
        try{
            const status=await Auth.api('/api/status');
            if(status.setupRequired){$('loginTitle').textContent='Primeiro acesso';$('loginIntro').textContent='Defina as senhas dos acessos autorizados neste computador.';for(const [role,email] of Object.entries(status.accounts))$(role+'Email').textContent=email;$('setupForm').hidden=false;}
            else if(new URLSearchParams(location.search).has('senha')){await Auth.session();$('loginTitle').textContent='Alterar minha senha';$('loginIntro').textContent='A alteração encerrará suas sessões abertas.';$('passwordForm').hidden=false;}
            else $('loginForm').hidden=false;
        }catch(error){showError(error.message);}
    })();
})();
