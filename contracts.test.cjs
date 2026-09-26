const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./contracts-core.js');
const PDF = require('./contract-pdf.js');
const { PDFDocument } = require('./assets/vendor/pdf-lib.min.js');
const fs = require('node:fs');

const instructor = { id: 'qa', name: 'Instrutora Exemplo de Validação', document: '000.000.000-00',
    active: true, contact: 'exemplo@example.com', address: 'Rua de Exemplo', number: '100',
    complement: 'Sala 2', neighborhood: 'Centro', city: 'Mossoró', state: 'RN', postalCode: '00000-000',
    pixType: 'email', pix: 'exemplo@example.com', documents: { rg: true, cpf: true, residence: true, degree: true, other: false } };
const contract = { approvalStatus: 'approved', id: 'qa-contract', number: 'SC-2026-0001', instructorId: instructor.id,
    instructorSnapshot: structuredClone(instructor), discipline: 'Estatística Básica', type: 'theory',
    course: 'ADM', group: '10', shift: 'M', hoursUnits: 5200, hourRateCents: 1470, amountCents: 76440,
    startDate: '2026-09-10', endDate: '2026-10-05', referenceDate: '2026-10-05',
    requestDate: '2026-09-17', requester: 'Solicitante de Exemplo', notes: '', cancelled: false };

test('valor do modelo: 52 horas x R$ 14,70 = R$ 764,40, sem erro de ponto flutuante', () => {
    assert.equal(C.total(C.cents('52'),C.cents('14,70')),76440);
    assert.equal(C.total(C.cents('1,50'),C.cents('10,01')),1502);
    for (const invalid of ['-1','NaN','1.000,00','2,345','']) assert.throws(()=>C.cents(invalid));
});
test('ciclos incluem virada de ano e distinguem dias 6 e 7', () => {
    assert.deepEqual(C.cycle('2026-09'),{start:'2026-09-07',end:'2026-10-06'});
    assert.deepEqual(C.cycle('2026-12'),{start:'2026-12-07',end:'2027-01-06'});
    assert.equal(C.currentCycle('2027-01-06'),'2026-12');
    assert.equal(C.currentCycle('2027-01-07'),'2027-01');
    assert.equal(C.validDate('2026-02-30'),false);
    assert.equal(C.validDate('2028-02-29'),true);
});
test('cursos novos ficam disponíveis no núcleo do sistema', () => {
    for (const course of ['ELP', 'BCV', 'EIC', 'FLB']) assert.ok(C.courses.includes(course));
});
test('contrato entre meses entra integralmente no ciclo do término, nunca da solicitação',()=>{
    C.validateContract(contract);
    assert.equal(C.report([contract],C.cycle('2026-08')).total,0);
    assert.equal(C.report([contract],C.cycle('2026-09')).total,76440);
    assert.equal(C.report([contract],C.cycle('2026-10')).total,0);
    assert.throws(()=>C.validateContract({...contract,referenceDate:contract.requestDate}));
});
test('limites inclusivos, curso, turma e cancelamentos no orçamento',()=>{
    const rows=[contract,{...contract,id:'2',course:'ENF',group:'2',referenceDate:'2026-09-07',endDate:'2026-09-07'},
        {...contract,id:'3',referenceDate:'2026-10-06',endDate:'2026-10-06'},
        {...contract,id:'4',referenceDate:'2026-10-07',endDate:'2026-10-07'}, {...contract,id:'5',cancelled:true}];
    assert.equal(C.report(rows,C.cycle('2026-09')).total,76440*3);
    assert.equal(C.report(rows,{...C.cycle('2026-09'),course:'ENF'}).rows.length,1);
    assert.equal(C.report(rows,{...C.cycle('2026-09'),course:'ADM',group:'10'}).rows.length,2);
    assert.throws(()=>C.report(rows,{start:'2026-10-06',end:'2026-09-07'}));
});
test('backup rejeita registros inconsistentes e mantém snapshots anteriores independentes',()=>{
    const store={...C.empty(),instructors:[structuredClone(instructor)],contracts:[structuredClone(contract)]};
    C.validateStore(store);
    store.instructors[0].pix='novo@example.com';
    assert.equal(store.contracts[0].instructorSnapshot.pix,'exemplo@example.com');
    assert.throws(()=>C.validateStore({...store,instructors:[]}));
    assert.throws(()=>C.validateStore({...store,contracts:[{...contract,amountCents:1}]}));
    assert.throws(()=>C.validateStore({...store,instructors:[instructor,instructor]}));
    assert.throws(()=>C.validateStore({...store,contracts:[{...contract,number:undefined}]}));
});
test('CSV preserva acentos e protege células interpretadas como fórmulas',()=>{
    const text=C.csv([['=1+1','Nome; "Teste"','Estatística']]);
    assert.ok(text.startsWith('\uFEFF'));
    assert.ok(text.includes("'=1+1"));
    assert.ok(text.includes('"Nome; ""Teste"""'));
});
test('PDF gera uma página A4 e recusa campos que seriam cortados',async()=>{
    const bytes=await PDF.generate(contract);
    const result=await PDFDocument.load(bytes);
    assert.equal(result.getPageCount(),1);
    assert.ok(Math.abs(result.getPage(0).getWidth()-595.28)<1);
    fs.mkdirSync('output/pdf',{recursive:true});
    fs.writeFileSync('output/pdf/contrato-exemplo.pdf',bytes);
    await assert.rejects(()=>PDF.generate({...contract,discipline:'X'.repeat(500)}),/longo demais/);
});

module.exports = { instructor, contract };

test('turmas agrupadas e gerais preservam identificação e valor sem multiplicar contratos',()=>{
    const R=require('./cost-report.js'),P=require('./access-policy.js');
    const cases=[['ENF','20/23','', 'ENF20/23'],['RAD','06,08M RAD01,03,09-N','','RAD06,08M RAD01,03,09-N'],['ELT','28-N-2D','','ELT28-N-2D'],['GERAL','AÇÕES','','AÇÕES']];
    for(const [course,group,shift,label] of cases){
        const department=P.courseDepartment(course);
        const person={...instructor,department};
        const item={...contract,course,group,shift,department,instructorSnapshot:person,lessonCount:null};
        const data=P.normalize({...C.empty(),instructors:[person],contracts:[item]});
        assert.equal(C.groupLabel(item),label);assert.equal(R.values(item)[1],label);
        assert.equal(C.report([item],C.cycle('2026-09')).total,item.amountCents);
        assert.equal(P.select(data,'gestora').contracts.length,1);
        if(course==='GERAL'){
            assert.equal(P.select(data,'exatas').contracts.length,0);
            assert.equal(P.select(data,'saude').contracts.length,0);
            assert.throws(()=>P.merge(data,P.select(data,'gestora'),'exatas'));
        }
    }
});

test('turma 2D usa sufixo após turno e alteração exige nova aprovação', () => {
    const A = require('./approval.cjs');
    const R = require('./cost-report.js');
    assert.equal(C.groupLabel(contract), 'ADM10-M');
    const changed = {...structuredClone(contract), group:'13', is2D:true};
    assert.equal(C.groupLabel(changed), 'ADM13-M-2D');
    assert.equal(R.values(changed)[1], 'ADM13-M-2D');
    C.validateContract(changed);
    assert.throws(()=>C.validateContract({...changed,is2D:'true'}));
    const next={contracts:[{...structuredClone(contract),is2D:false}]};
    A.enforce({contracts:[contract]},next);
    assert.equal(next.contracts[0].approvalStatus,'approved');
    next.contracts[0].is2D=true;
    A.enforce({contracts:[contract]},next);
    assert.equal(next.contracts[0].approvalStatus,'pending');
});
