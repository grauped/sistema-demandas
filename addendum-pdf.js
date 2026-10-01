(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./assets/vendor/pdf-lib.min.js'),require('./assets/addendum-template.js'),require('./contracts-core.js'));else root.AddendumPDF=factory(root.PDFLib,root.AddendumTemplate,root.ContractsCore);})(globalThis,function(PDFLib,template,C){
 const names={ADM:'Técnico em Administração',ELT:'Técnico em Eletrotécnica',STB:'Técnico em Segurança no Trabalho',DSI:'Técnico em Desenvolvimento de Sistemas',ELP:'Eletricista predial',BCV:'Bombeiro Civil',ENF:'Técnico em Enfermagem',RAD:'Técnico em Radiologia',EIC:'Especialização Técnica em Instrumentação Cirúrgica',FLB:'Balconista de Farmácia',GERAL:'Geral'};
 const br=d=>d.split('-').reverse().join('/'),hours=n=>(n/100).toLocaleString('pt-BR');
 async function generate(record){
  const a=record.substitution;if(!a)throw new Error('Este contrato não possui adendo.');
  const original=a.original,old=original.instructorSnapshot,person=record.instructorSnapshot;
  if(!old.document.trim()||!person.document.trim())throw new Error('Preencha o CPF/CNPJ dos dois instrutores antes de gerar o adendo.');
  const pdf=await PDFLib.PDFDocument.load(template),page=pdf.getPages()[0],font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica),bold=await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  page.drawRectangle({x:45,y:80,width:510,height:670,color:PDFLib.rgb(1,1,1)});
  const clean=s=>String(s).replace(/\s+/g,' ').trim();
  const draw=(text,x,y,size=11,f=font)=>page.drawText(clean(text),{x,y,size,font:f});
  const wrap=(text,size=11)=>{const lines=[];let line='';for(const word of clean(text).split(' ')){if(font.widthOfTextAtSize(word,size)>425)throw new Error('Um campo do adendo é longo demais. Revise os dados.');if(font.widthOfTextAtSize(line?line+' '+word:word,size)>425){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
  const title='ADENDO AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS';draw(title,(page.getWidth()-bold.widthOfTextAtSize(title,11))/2,729,11,bold);
  const date=new Date(a.signDate+'T12:00:00Z').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  draw(a.city+', '+date,85,682);
  const paragraphs=[`Venho por meio deste informar que o contrato ${original.number}, referente ao curso ${names[original.course]}, ${C.groupLabel(original)}, da disciplina ${original.discipline}, tendo como instrutor(a) ${old.name}, portador(a) do CPF/CNPJ ${old.document}, carga horária prevista de ${hours(original.hoursUnits)} horas/aula, com início em ${br(original.startDate)} e término em ${br(original.endDate)}, não será concluído pelo próprio. Motivo da substituição: ${a.reason}. ${a.fulfilledHoursUnits ? `A carga horária cumprida será de ${hours(a.fulfilledHoursUnits)} horas/aula, iniciando no dia ${br(original.startDate)} e comparecendo pela última vez no dia ${br(a.lastDate)}.` : 'O instrutor original não cumpriu carga horária nesta disciplina.'}`, `A partir do dia ${br(record.startDate)} até ${br(record.endDate)}, término da disciplina, as aulas serão ministradas pelo instrutor(a) ${person.name}, portador(a) do CPF/CNPJ ${person.document}, totalizando uma carga horária de ${hours(record.hoursUnits)} horas/aula.`];
  const lines=paragraphs.map(p=>wrap(p));const lineCount=lines.reduce((n,l)=>n+l.length,0);
  if(lineCount>26)throw new Error('O texto excede uma página do modelo. Reduza o motivo ou abrevie os campos longos.');
  let y=620;for(const paragraph of lines){for(const line of paragraph){draw(line,85,y);y-=17;}y-=12;}
  y-=22;draw('Por ser verdade, firmo o presente,',85,y);y-=54;
  page.drawLine({start:{x:225,y},end:{x:405,y},thickness:.5});
  const label=original.department==='exatas'?'Coordenação de Exatas':original.department==='saude'?'Coordenação de Saúde':'Gestora';draw(label,315-font.widthOfTextAtSize(label,10)/2,y-12,10);
  draw('Avenida Presidente Dutra, 890 – Ilha de Santa Luzia – Mossoró/RN',186,43,7);
  draw('CEP 59625-000 – Fone: (84) 2142-1039 – www.grautecnico.com.br',186,33,7);
  pdf.setTitle('Adendo de substituição - '+original.number);pdf.setAuthor('Minhas Demandas');return pdf.save();
 }
 return {generate};
});
