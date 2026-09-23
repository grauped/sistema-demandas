const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const R=require('./cost-report.js');const C=require('./contracts-core.js');
test('relatório Excel reproduz dez colunas com instrutor e tipo, datas numéricas, fórmulas e texto seguro',()=>{
 const item={instructorSnapshot:{name:'Instrutora Exemplo'},type:'theory',id:'1',approvalStatus:'approved',course:'ADM',group:'10',shift:'M',discipline:'=2+2 & texto',startDate:'2026-09-10',endDate:'2026-10-05',referenceDate:'2026-10-05',lessonCount:13,hoursUnits:5200,hourRateCents:1470,amountCents:76440,cancelled:false};
 const report=C.report([item,{...item,id:'2',approvalStatus:'pending'}],C.cycle('2026-09'));
 assert.equal(report.total,76440);assert.equal(report.rows.length,1);assert.equal(R.values(item).length,10);
 assert.equal(R.values(item)[3],'Instrutora Exemplo');assert.equal(R.values(item)[4],'Teórica');assert.equal(R.values({...item,type:'practice'})[4],'Prática');assert.equal(R.values({...item,type:'both'})[4],'Teórica e prática');assert.ok(!R.headers.includes('QUANTIDADE DE AULAS'));
 const bytes=R.xlsx(report,{title:'RELATÓRIO DE DESPESAS COM DISCIPLINAS EXATAS',...C.cycle('2026-09')});
 const text=new TextDecoder().decode(bytes);assert.match(text,/<f>ROUND\(I4\*H4,2\)<\/f><v>764.4<\/v>/);assert.match(text,/t="inlineStr"><is><t xml:space="preserve">=2\+2 &amp; texto/);assert.match(text,/<f>SUM\(J4:J4\)<\/f>/);
 fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync('tmp/relatorio-teste.xlsx',bytes);
 const empty=new TextDecoder().decode(R.xlsx({rows:[],total:0},{title:'Sem dados',...C.cycle('2026-09')}));assert.match(empty,/<f>0<\/f><v>0<\/v>/);
});
