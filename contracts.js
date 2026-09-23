'use strict';

(async () => {
    const user = await Auth.requireSession();
    const role = user.role;
    const P = AccessPolicy;
    const allowedCourses = P.roles[role].courses;
    const C = ContractsCore;
    let revision = 0;
    let saving = false;
    let previousBackup = null;
    const selectedContracts = new Set();
    let selectableContracts = [];
    const $ = id => document.getElementById(id);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dateBR = value => value.split('-').reverse().join('/');
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const clone = value => JSON.parse(JSON.stringify(value));
    const instructorFields = { name: 'Name', document: 'Document', contact: 'Contact', address: 'Address', number: 'Number', complement: 'Complement', neighborhood: 'Neighborhood', city: 'City', state: 'State', postalCode: 'PostalCode', pix: 'Pix', pixType: 'PixType' };
    const documentFields = { rg: 'Rg', cpf: 'Cpf', residence: 'Residence', degree: 'Degree', other: 'Other' };
    let data = C.empty();

    let readable = true;
    let pdfUrl = null;
    let pdfName = '';
    let busyPDF = false;
    let previewVersion = 0;

    function notify(message) {
        $('moduleToast').textContent = message;
        $('moduleToast').classList.add('show');
        clearTimeout(notify.timer);
        notify.timer = setTimeout(() => $('moduleToast').classList.remove('show'), 6000);
    }

    async function load() {
        try {
            const result = await Auth.api('/api/contracts');
            data = P.validate(result.data); revision = result.revision;
            previousBackup = (await Auth.api('/api/backup/previous')).data;
            readable = true; $('storageError').hidden = true;
        } catch(error) {
            readable = false; $('storageError').hidden = false;
            $('storageError').textContent = 'Não foi possível carregar o banco local: ' + error.message;
        }
    }

    async function commit(next, { restore = false } = {}) {
        if (saving) { notify('Aguarde o salvamento em andamento.'); return false; }
        saving = true;
        try {
            if (!readable) throw new Error('Recarregue os dados antes de salvar.');
            P.validate(next);
            const result = await Auth.api('/api/contracts', {method:'PUT', data:{data:next,revision,restore}});
            if (restore) previousBackup = clone(data);
            data = result.data; revision = result.revision;
            $('storageError').hidden = true; render(); return true;
        } catch(error) { notify(error.message || 'Não foi possível salvar.'); return false; }
        finally { saving = false; renderContracts(); }
    }

    function switchTab(tab) {
        const labels = { instructors: 'Instrutores', contracts: 'Contratos', reports: 'Orçamento mensal' };
        if (!labels[tab]) return;
        for (const key of Object.keys(labels)) $(key + 'Panel').hidden = key !== tab;
        document.querySelectorAll('[data-tab]').forEach(button => {
            const active = button.dataset.tab === tab;
            button.classList.toggle('active', active);
            if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
        });
        $('moduleTitle').textContent = labels[tab];
        if (tab === 'reports') renderReport();
    }

    function render() {
        renderInstructors(); renderContracts(); renderReport();
        $('defaultRequester').value = data.settings.requester;
        $('backupPrevious').hidden = !previousBackup;
    }

    function viewInstructors() {
        const department = role === 'gestora' ? $('departmentFilter').value : role;
        return data.instructors.filter(item => !department || item.department === department);
    }
    function viewContracts() {
        const department = role === 'gestora' ? $('departmentFilter').value : role;
        return data.contracts.filter(item => !department || item.department === department);
    }
    function renderInstructors() {
        const query = $('instructorSearch').value.trim().toLocaleLowerCase('pt-BR');
        const rows = viewInstructors().filter(item => ($('includeInactive').checked || item.active) &&
            `${item.name} ${item.document}`.toLocaleLowerCase('pt-BR').includes(query));
        rows.sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
        $('instructorList').innerHTML = rows.length ? rows.map(item => `
            <article class="record-card"><div><h4>${escape(item.name)}</h4><p>${escape(item.document)} · ${escape(item.city)}${item.state ? ' / ' + escape(item.state) : ''}</p>
            <p>${escape(item.contact || 'Sem contato informado')}</p><p>${escape(P.roles[item.department]?.label || 'A classificar pela gestora')}</p><span class="record-status ${item.active ? '' : 'inactive'}">${item.active ? 'Cadastro ativo' : 'Inativo'}</span></div>
            <div class="record-actions"><button class="text-button" data-instructor="edit" data-id="${escape(item.id)}">Editar</button>
            ${item.active ? `<button class="btn-secondary" data-instructor="contract" data-id="${escape(item.id)}">Novo contrato</button>` : ''}
            <button class="text-button" data-instructor="toggle" data-id="${escape(item.id)}">${item.active ? 'Desativar' : 'Reativar'}</button></div></article>`).join('') :
            '<div class="empty-state"><strong>Nenhum instrutor encontrado.</strong><span>Cadastre um instrutor para reutilizar seus dados nos contratos.</span></div>';
    }

    function openInstructor(id = '') {
        $('instructorForm').reset();
        $('instructorError').textContent = '';
        $('instructorId').value = id;
        const item = data.instructors.find(item => item.id === id);
        $('instructorDepartment').value = item?.department || (role === 'gestora' ? $('departmentFilter').value : role);
        $('instructorDepartment').disabled = role !== 'gestora' || !!(item && data.contracts.some(record => record.instructorId === item.id));
        $('instructorDialogTitle').textContent = item ? 'Editar instrutor' : 'Cadastrar instrutor';
        if (item) {
            for (const [key, suffix] of Object.entries(instructorFields)) $('instructor' + suffix).value = item[key];
            for (const [key, suffix] of Object.entries(documentFields)) $('doc' + suffix).checked = item.documents[key];
        }
        $('instructorDialog').showModal();
        $('instructorName').focus();
    }

    async function saveInstructor(event) {
        event.preventDefault();
        const old = data.instructors.find(item => item.id === $('instructorId').value);
        if ($('instructorId').value && !old) { $('instructorError').textContent = 'O cadastro não existe mais. Feche o formulário e tente novamente.'; return; }
        const department = role === 'gestora' ? $('instructorDepartment').value : role;
        if (!P.departments.includes(department) && !(role === 'gestora' && department === 'unassigned')) { $('instructorError').textContent = 'Selecione a coordenação do instrutor.'; return; }
        const instructor = { id: old?.id || uid(), active: old?.active ?? true, department, documents: {} };
        for (const [key, suffix] of Object.entries(instructorFields)) instructor[key] = $('instructor' + suffix).value.trim();
        for (const [key, suffix] of Object.entries(documentFields)) instructor.documents[key] = $('doc' + suffix).checked;
        const required = ['name', 'document', 'address', 'number', 'neighborhood', 'city', 'state', 'postalCode', 'pix'];
        if (required.some(key => !instructor[key])) { $('instructorError').textContent = 'Preencha os campos obrigatórios sem deixar apenas espaços.'; return; }
        const normalizedDocument = value => value.replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
        if (normalizedDocument(instructor.document) && data.instructors.some(item => item.id !== instructor.id && item.department === department && normalizedDocument(item.document) === normalizedDocument(instructor.document))) {
            $('instructorError').textContent = 'Já existe um instrutor com esse documento nesta coordenação, inclusive entre os inativos. Edite ou reative o cadastro existente.'; return;
        }
        if (instructor.pixType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(instructor.pix)) { $('instructorError').textContent = 'Informe um e-mail válido para a chave Pix.'; return; }
        const next = clone(data);
        if (old) next.instructors[next.instructors.findIndex(item => item.id === old.id)] = instructor;
        else next.instructors.push(instructor);
        if (await commit(next)) { $('instructorDialog').close(); notify('Instrutor salvo. Os contratos anteriores mantêm os dados originais.'); }
    }

    function renderContracts() {
        const query = $('contractSearch').value.trim().toLocaleLowerCase('pt-BR');
        const month = $('contractMonth').value;
        const period = month ? C.cycle(month) : null;
        $('contractMonthHelp').textContent = (period ? `${dateBR(period.start)} a ${dateBR(period.end)} · ` : 'Todos os meses · ') + 'Data de término. Somente aprovados entram no orçamento.';
        const rows = viewContracts().filter(item => (!period || (item.endDate >= period.start && item.endDate <= period.end)) && (!$('approvalFilter').value || (item.approvalStatus || 'pending') === $('approvalFilter').value) && ($('includeCancelled').checked || !item.cancelled) &&
            `${item.instructorSnapshot.name} ${item.discipline} ${C.groupLabel(item)} ${item.number}`.toLocaleLowerCase('pt-BR').includes(query));
        rows.sort((a,b) => b.requestDate.localeCompare(a.requestDate) || b.number.localeCompare(a.number));
        selectableContracts = role === 'gestora' ? rows.filter(item => !item.cancelled && item.approvalStatus !== 'approved') : [];
        const eligibleIds = new Set(selectableContracts.map(item => item.id));
        for (const id of selectedContracts) if (!eligibleIds.has(id)) selectedContracts.delete(id);
        updateBulkApproval();
        $('contractList').innerHTML = rows.length ? rows.map(item => `
            <article class="record-card"><div>${role === 'gestora' && !item.cancelled && item.approvalStatus !== 'approved' ? `<label class="contract-select"><input type="checkbox" data-select-contract="${escape(item.id)}" aria-label="Selecionar ${escape(item.number)}" ${selectedContracts.has(item.id) ? 'checked' : ''} ${saving ? 'disabled' : ''}> Selecionar</label>` : ''}<h4>${escape(item.discipline)} · ${escape(C.groupLabel(item))}</h4><p>${escape(item.instructorSnapshot.name)}</p>
            <p>${escape(item.number)} · ${dateBR(item.startDate)} a ${dateBR(item.endDate)} · ${item.hoursUnits / 100} h</p>
            <p>Orçamento: ${dateBR(item.referenceDate)}</p><span class="record-status ${item.cancelled ? 'inactive' : item.approvalStatus === 'approved' ? '' : 'pending'}">${item.cancelled ? 'Cancelado · fora do orçamento' : item.approvalStatus === 'approved' ? `Aprovado pela gestora${item.approvedAt ? ' em ' + dateBR(item.approvedAt.slice(0,10)) : ''}` : 'Pendente de aprovação'}</span></div>
            <div class="record-actions">${role === 'gestora' && !item.cancelled ? `<button class="btn-primary" data-contract="approve" data-id="${escape(item.id)}">${item.approvalStatus === 'approved' ? 'Retirar aprovação' : 'Aprovar contrato'}</button>` : ''}<strong class="record-total">${money(item.amountCents)}</strong>
            <button class="btn-secondary" data-contract="pdf" data-id="${escape(item.id)}">Ver PDF</button>
            ${!item.cancelled ? `<button class="text-button" data-contract="edit" data-id="${escape(item.id)}">Editar</button>` : ''}
            <button class="text-button" data-contract="copy" data-id="${escape(item.id)}">Reutilizar</button>
            <button class="text-button" data-contract="toggle" data-id="${escape(item.id)}">${item.cancelled ? 'Reativar' : 'Cancelar registro'}</button></div></article>`).join('') :
            '<div class="empty-state"><strong>Nenhum contrato encontrado.</strong><span>Selecione um instrutor e preencha os dados pedagógicos.</span></div>';
    }

    function updateBulkApproval() {
        $('bulkApproval').hidden = role !== 'gestora';
        const count = selectedContracts.size;
        $('selectedContractCount').textContent = `${count} selecionado(s)`;
        $('selectAllContracts').checked = selectableContracts.length > 0 && count === selectableContracts.length;
        $('selectAllContracts').indeterminate = count > 0 && count < selectableContracts.length;
        $('selectAllContracts').disabled = saving || !readable || !selectableContracts.length;
        $('approveSelected').disabled = saving || !readable || !count;
        $('approveSelected').textContent = saving ? 'Aguarde…' : `Aprovar selecionados (${count})`;
    }

    function openContract({ id = '', instructorId = '', copy = false } = {}) {
        if (!viewInstructors().some(item => item.active && (P.departments.includes(item.department) || role === 'gestora')) && !id) { switchTab('instructors'); notify('Cadastre, classifique ou reative um instrutor desta coordenação antes de criar contratos.'); return; }
        const item = data.contracts.find(item => item.id === id);
        $('contractForm').reset();
        $('contractError').textContent = '';
        $('contractId').value = copy ? '' : id;
        $('contractDialogTitle').textContent = copy ? 'Reutilizar contrato' : item ? 'Editar solicitação' : 'Nova solicitação de contrato';
        const chosen = instructorId || item?.instructorId || '';
        if (chosen && role !== 'gestora' && data.instructors.find(person => person.id === chosen)?.department === 'unassigned') { notify('A gestora precisa classificar a coordenação deste instrutor antes de criar contratos.'); return; }
        $('contractInstructor').innerHTML = '<option value="">Selecione o instrutor</option>' + viewInstructors().filter(person => (P.departments.includes(person.department) || role === 'gestora') && (person.active || (!copy && person.id === chosen)))
            .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(person => `<option value="${escape(person.id)}">${escape(person.name)} · ${person.department === 'exatas' ? 'Exatas' : person.department === 'saude' ? 'Saúde' : 'Geral'}${person.active ? '' : ' (inativo)'}</option>`).join('');
        $('contractInstructor').value = chosen;
        updateCourses(item?.course);
        $('contractRequester').value = data.settings.requester;
        $('contractRequestDate').value = today();
        const fields = { discipline: 'Discipline', type: 'Type', course: 'Course', group: 'Group', shift: 'Shift', startDate: 'Start', endDate: 'End', requester: 'Requester', requestDate: 'RequestDate', referenceDate: 'Reference', notes: 'Notes' };
        if (item) {
            for (const [key,suffix] of Object.entries(fields)) $('contract'+suffix).value = item[key];
            $('contractLessons').value = item.lessonCount ?? '';
            $('contractHours').value = String(item.hoursUnits / 100).replace('.',',');
            $('contractHourRate').value = (item.hourRateCents / 100).toFixed(2).replace('.',',');
            if (copy) { $('contractRequestDate').value = today(); $('contractRequester').value = data.settings.requester || item.requester; }
        }
        updateReference(); updateTotal(); previewInstructor();
        $('contractDialog').showModal();
        (chosen ? $('contractDiscipline') : $('contractInstructor')).focus();
    }

    function updateCourses(preferred) {
        const person = data.instructors.find(item => item.id === $('contractInstructor').value);
        const previous = preferred || $('contractCourse').value;
        const courses = person ? P.roles[person.department]?.courses || (role === 'gestora' ? ['GERAL'] : []) : allowedCourses;
        $('contractCourse').innerHTML = courses.map(code => `<option value="${code}">${code}</option>`).join('');
        if (courses.includes(previous)) $('contractCourse').value = previous;
    }
    function previewInstructor() {
        const previous = data.contracts.find(item => item.id === $('contractId').value);
        const selected = $('contractInstructor').value;
        const item = previous?.instructorId === selected ? previous.instructorSnapshot : data.instructors.find(item => item.id === selected);
        $('instructorPreview').textContent = item ? `${item.name} · ${item.document}\n${item.address}, ${item.number} · ${item.city}/${item.state}\nPix: ${item.pix}${previous?.instructorId === selected ? '\nDados preservados da solicitação original.' : ''}` : '';
    }

    function updateReference() {
        $('contractReference').value = $('contractEnd').value;
    }
    function updateTotal() {
        try { $('contractCalculated').textContent = money(C.total(C.cents($('contractHours').value), C.cents($('contractHourRate').value))); }
        catch { $('contractCalculated').textContent = 'R$ 0,00'; }
    }

    async function saveContract(event) {
        event.preventDefault();
        try {
            const id = $('contractId').value;
            const old = data.contracts.find(item => item.id === id);
            if (id && !old) throw new Error('O registro não existe mais. Feche o formulário e tente novamente.');
            const instructor = data.instructors.find(item => item.id === $('contractInstructor').value);
            if (!instructor || (!instructor.active && instructor.id !== old?.instructorId)) throw new Error('Selecione um instrutor ativo.');
            const hoursUnits = C.cents($('contractHours').value);
            const hourRateCents = C.cents($('contractHourRate').value);
            if (!hoursUnits || !hourRateCents) throw new Error('Carga horária e valor hora-aula devem ser maiores que zero.');
            const year = today().slice(0,4);
            const prefix = 'SC-' + year + '-';
            const sequence = Math.max(0,...data.contracts.filter(item => item.number.startsWith(prefix)).map(item=>Number(item.number.slice(prefix.length)))) + 1;
            const record = { id: old?.id || uid(), number: old?.number || prefix + String(sequence).padStart(4,'0'),
                instructorId: instructor.id, instructorSnapshot: clone(old?.instructorId === instructor.id ? old.instructorSnapshot : instructor),
                lessonCount: $('contractLessons').value ? Number($('contractLessons').value) : null, hoursUnits, hourRateCents, amountCents: C.total(hoursUnits,hourRateCents), cancelled: old?.cancelled || false };
            const fields = { discipline: 'Discipline', type: 'Type', course: 'Course', group: 'Group', shift: 'Shift', startDate: 'Start', endDate: 'End', requester: 'Requester', requestDate: 'RequestDate', referenceDate: 'Reference', notes: 'Notes' };
            for (const [key,suffix] of Object.entries(fields)) record[key] = $('contract'+suffix).value.trim();
            record.referenceDate = record.endDate;
            record.department = P.courseDepartment(record.course);
            if (record.startDate > record.endDate) throw new Error('A data fim não pode ser anterior à data início.');
            C.validateContract(record);
            const next = clone(data);
            if (old) next.contracts[next.contracts.findIndex(item => item.id === old.id)] = record; else next.contracts.push(record);
            next.settings.requester = record.requester;
            if (await commit(next)) { $('contractDialog').close(); switchTab('contracts'); notify('Contrato salvo. Consulte a situação de aprovação na lista.'); }
        } catch (error) { $('contractError').textContent = error.message; }
    }

    function filters() { return { start: $('reportStart').value, end: $('reportEnd').value, course: $('reportCourse').value, group: $('reportGroup').value.trim() }; }
    function renderReport() {
        try {
            const f = filters();
            const result = C.report(viewContracts(),f);
            $('reportPeriod').textContent = `${dateBR(f.start)} a ${dateBR(f.end)} · ${f.course || 'Todos os cursos'}${f.group ? ' · turma '+f.group : ''}`;
            $('reportTotal').textContent = money(result.total);
            $('reportCount').textContent = `${result.rows.length} solicitação(ões) · orçamento previsto`;
            $('courseSummary').innerHTML = result.byCourse.map(item=>`<div class="module-card">${escape(item.course)} · ${item.count}<strong>${money(item.total)}</strong></div>`).join('');
            $('reportRows').innerHTML = result.rows.length ? result.rows.map(item=>'<tr>'+CostReport.values(item).map((value,index)=>`<td>${escape(index===3||index===4?dateBR(value):index===5||index===8?money(value*100):value ?? 'Não informada')}</td>`).join('')+'</tr>').join('') : '<tr><td colspan="9">Nenhum contrato aprovado neste período e filtro.</td></tr>';
            $('reportExport').disabled = $('reportExcel').disabled = !readable;
            return result;
        } catch (error) {
            $('reportPeriod').textContent = error.message;
            $('reportTotal').textContent = '—'; $('reportCount').textContent = '';
            $('courseSummary').innerHTML = ''; $('reportRows').innerHTML = '';
            $('reportExport').disabled = $('reportExcel').disabled = true;
            return null;
        }
    }

    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = name;
        document.body.append(link); link.click(); link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    function exportReport() {
        const result = renderReport(); if (!result) return;
        const f = filters();
        const rows = [[reportTitle()], ['Período',dateBR(f.start),dateBR(f.end)], ['Curso',f.course || 'Todos'],['Turma',f.group || 'Todas'], [], CostReport.headers, ...result.rows.map(item=>CostReport.values(item).map((value,index)=>index===3||index===4?dateBR(value):typeof value==='number'?String(value).replace('.',','):value ?? '')), [],['VALOR TOTAL','','','','','','','',(result.total/100).toFixed(2).replace('.',',')]];
        download(new Blob([C.csv(rows)],{type:'text/csv;charset=utf-8'}),`orcamento-${f.start}-${f.end}${f.course ? '-'+f.course : ''}.csv`);
    }

    function reportTitle(){const department=role==='gestora'?$('departmentFilter').value:role;return 'RELATÓRIO DE DESPESAS COM DISCIPLINAS'+(department==='exatas'?' EXATAS':department==='saude'?' SAÚDE':' GERAL');}
    $('reportExcel').addEventListener('click',()=>{const result=renderReport();if(!result)return;const f=filters();download(new Blob([CostReport.xlsx(result, {title:reportTitle(),...f})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`relatorio-custos-${f.start}-${f.end}.xlsx`);});
    async function showPDF(record) {
        if (busyPDF) return;
        busyPDF = true;
        try {
            const bytes = await ContractPDF.generate(record);
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
            pdfUrl = URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
            pdfName = `${record.number}-${C.groupLabel(record)}.pdf`;
            $('pdfTitle').textContent = record.number + ' · ' + C.groupLabel(record);
            $('pdfCanvas').hidden = true;
            $('pdfPreviewStatus').textContent = 'Carregando prévia…';
            $('pdfDialog').showModal();
            const version = ++previewVersion;
            let previewDocument;
            try {
                const renderer = await import('./assets/vendor/pdf.min.mjs');
                renderer.GlobalWorkerOptions.workerSrc = './assets/vendor/pdf.worker.min.mjs';
                previewDocument = await renderer.getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
                if (version !== previewVersion) return;
                const page = await previewDocument.getPage(1);
                const viewport = page.getViewport({ scale: 1.6 });
                const canvas = $('pdfCanvas'); canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                if (version === previewVersion) { canvas.hidden = false; $('pdfPreviewStatus').textContent = '1 página A4 · canhoto incluído'; }
            } catch {
                $('pdfPreviewStatus').textContent = 'A prévia não está disponível neste navegador. Use Baixar PDF para abrir o documento.';
            } finally { if (previewDocument) await previewDocument.destroy(); }
        } catch(error) { notify('PDF não gerado: ' + error.message); }
        finally { busyPDF = false; }
    }

    document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
    for (const code of allowedCourses) {
        $('contractCourse').add(new Option(code,code)); $('reportCourse').add(new Option(code,code));
    }
    for (const state of 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')) $('instructorState').add(new Option(state,state));
    $('newInstructor').addEventListener('click',()=>openInstructor());
    $('newContract').addEventListener('click',()=>openContract());
    $('instructorForm').addEventListener('submit',saveInstructor);
    $('requesterForm').addEventListener('submit',async event=>{
        event.preventDefault(); const next=clone(data); next.settings.requester=$('defaultRequester').value.trim();
        if(await commit(next)) notify('Solicitante padrão salvo.');
    });
    $('contractForm').addEventListener('submit',saveContract);
    $('instructorSearch').addEventListener('input',renderInstructors);
    $('includeInactive').addEventListener('change',renderInstructors);
    $('contractSearch').addEventListener('input',renderContracts);
    for(const id of ['contractMonth','approvalFilter']) $(id).addEventListener('change',renderContracts);
    $('allContractMonths').addEventListener('click',()=>{$('contractMonth').value='';renderContracts();});
    $('includeCancelled').addEventListener('change',renderContracts);
    $('instructorList').addEventListener('click',async event=>{
        const button = event.target.closest('[data-instructor]'); if (!button) return;
        const item = data.instructors.find(item=>item.id===button.dataset.id); if (!item) return;
        if (button.dataset.instructor==='edit') openInstructor(item.id);
        else if (button.dataset.instructor==='contract') openContract({instructorId:item.id});
        else { const next=clone(data); next.instructors.find(person=>person.id===item.id).active=!item.active; if(await commit(next)) notify(item.active?'Instrutor desativado. Os contratos foram preservados.':'Instrutor reativado.'); }
    });
    $('selectAllContracts').addEventListener('change',()=>{
        if(saving || role !== 'gestora')return;
        selectedContracts.clear();
        if($('selectAllContracts').checked)for(const item of selectableContracts)selectedContracts.add(item.id);
        renderContracts();
    });
    $('contractList').addEventListener('change',event=>{
        const checkbox=event.target.closest('[data-select-contract]');
        if(!checkbox || saving || role !== 'gestora')return;
        const id=checkbox.dataset.selectContract;
        if(!selectableContracts.some(item=>item.id===id))return;
        if(checkbox.checked)selectedContracts.add(id);else selectedContracts.delete(id);
        updateBulkApproval();
    });
    $('approveSelected').addEventListener('click',async()=>{
        if(saving || !readable || role !== 'gestora' || !selectedContracts.size)return;
        const ids=[...selectedContracts];
        saving=true;renderContracts();
        try{
            const result=await Auth.api('/api/contracts/approval/batch',{method:'POST',data:{ids,revision}});
            data=result.data;revision=result.revision;selectedContracts.clear();render();
            notify(`${result.approvedCount} contrato(s) aprovado(s) e incluído(s) no orçamento.`);
        }catch(error){notify(error.message);}
        finally{saving=false;renderContracts();}
    });
    $('contractList').addEventListener('click',async event=>{
        const button=event.target.closest('[data-contract]'); if(!button)return;
        const item=data.contracts.find(item=>item.id===button.dataset.id); if(!item)return;
        if(button.dataset.contract==='pdf') showPDF(item);
        else if(button.dataset.contract==='approve') {
            if(saving)return;saving=true;
            try{const result=await Auth.api('/api/contracts/approval',{method:'POST',data:{id:item.id,status:item.approvalStatus==='approved'?'pending':'approved',revision}});data=result.data;revision=result.revision;render();notify(item.approvalStatus==='approved'?'Aprovação retirada. Contrato fora do orçamento.':'Contrato aprovado e incluído no orçamento do período de término.');}catch(error){notify(error.message);}finally{saving=false;renderContracts();}
        }
        else if(button.dataset.contract==='edit') openContract({id:item.id});
        else if(button.dataset.contract==='copy') openContract({id:item.id,copy:true});
        else { const next=clone(data); next.contracts.find(record=>record.id===item.id).cancelled=!item.cancelled; if(await commit(next))notify(item.cancelled?'Registro reativado. Aguarda aprovação para entrar no orçamento.':'Registro cancelado e retirado do orçamento. Você pode reativá-lo em Mostrar cancelados.'); }
    });
    $('contractInstructor').addEventListener('change',()=>{updateCourses();previewInstructor();});
    $('departmentFilter').addEventListener('change',()=>{
        const department=$('departmentFilter').value;
        const codes=P.roles[department]?.courses || allowedCourses;
        $('reportCourse').innerHTML='<option value="">Todos os cursos</option>'+codes.map(code=>`<option value="${code}">${code}</option>`).join('');
        render();
    });
    for(const id of ['contractHours','contractHourRate']) $(id).addEventListener('input',updateTotal);
    for(const id of ['contractEnd','contractRequestDate']) $(id).addEventListener('change',updateReference);
    $('reportCycle').addEventListener('change',()=>{try{const period=C.cycle($('reportCycle').value);$('reportStart').value=period.start;$('reportEnd').value=period.end;renderReport();}catch(error){notify(error.message);}});
    $('reportFilters').addEventListener('submit',event=>{event.preventDefault();renderReport();});
    for(const id of ['reportStart','reportEnd','reportCourse','reportGroup']) $(id).addEventListener('change',renderReport);
    $('reportExport').addEventListener('click',exportReport);
    $('pdfDownload').addEventListener('click',()=>{if(!pdfUrl)return;const link=document.createElement('a');link.href=pdfUrl;link.download=pdfName;document.body.append(link);link.click();link.remove();});
    $('pdfDialog').addEventListener('close',()=>{previewVersion++;if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}});
    $('backupExport').addEventListener('click',()=>{if(!readable){notify('Recupere os dados antes de exportar.');return;}download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`backup-instrutores-${today()}.json`);});
    $('backupPrevious').addEventListener('click',()=>{
        try { if(previousBackup)download(new Blob([JSON.stringify(previousBackup,null,2)],{type:'application/json'}),'backup-anterior-a-restauracao.json'); }
        catch { notify('Não foi possível acessar a cópia anterior.'); }
    });
    $('backupImport').addEventListener('click',()=>$('backupFile').click());
    $('backupFile').addEventListener('change',async()=>{
        const file=$('backupFile').files[0]; if(!file)return;
        try {
            if(file.size>10*1024*1024)throw new Error('O arquivo de backup excede 10 MB.');
            const imported=P.normalize(JSON.parse(await file.text()));
            $('backupSummary').textContent=`Arquivo validado: ${imported.instructors.length} instrutor(es) e ${imported.contracts.length} contrato(s).`;
            const dialog=$('backupDialog');dialog.returnValue='cancel';
            dialog.addEventListener('close',async()=>{if(dialog.returnValue==='restore'&&await commit(imported,{restore:true}))notify('Backup restaurado.');},{once:true});
            dialog.showModal();
        } catch(error){notify('Backup não importado: '+error.message);}
        finally{$('backupFile').value='';}
    });
    await load();
    $('reportCycle').value=C.currentCycle(today());
    const initial=C.cycle($('reportCycle').value);$('reportStart').value=initial.start;$('reportEnd').value=initial.end;
    render();
})().catch(error => { console.error('Falha ao iniciar módulo:', error); });

