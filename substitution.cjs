const C=require('./contracts-core.js');
const P=require('./access-policy.js');
const {isDeepStrictEqual}=require('node:util');
function apply(data,input,{id,number}){
 const next=structuredClone(data),parent=next.contracts.find(c=>c.id===input.id);
 if(!parent||parent.cancelled||parent.substitution)throw new Error('Selecione um contrato original ativo.');
 const previous=parent.replacementId?next.contracts.find(c=>c.id===parent.replacementId):null;
 if(previous?.cancelled)throw new Error('O adendo está cancelado.');
 const original=previous?previous.substitution.original:structuredClone(parent);
 const originalPerson=next.instructors.find(i=>i.id===original.instructorId);
 for(const field of ['document','contact','address','number','complement','neighborhood','city','state','postalCode','pix','pixType'])if(!original.instructorSnapshot[field]&&originalPerson?.[field])original.instructorSnapshot[field]=originalPerson[field];
 const person=next.instructors.find(i=>i.id===input.instructorId);
 if(!person||!person.active||person.id===parent.instructorId||person.department!==parent.department)throw new Error('Selecione outro instrutor ativo da mesma coordenação.');
 const fulfilled=input.fulfilledHoursUnits,remaining=input.remainingHoursUnits;
 if(!Number.isSafeInteger(fulfilled)||fulfilled<0||!Number.isSafeInteger(remaining)||remaining<=0||fulfilled+remaining!==original.hoursUnits)throw new Error('As horas cumpridas e as horas do substituto devem somar a carga horária original.');
 if(fulfilled===0)input={...input,lastDate:original.startDate};
 for(const field of ['lastDate','startDate','signDate'])if(!C.validDate(input[field]))throw new Error('Preencha as datas do adendo.');
 if(input.lastDate<original.startDate||input.lastDate>original.endDate||(fulfilled>0?input.startDate<=input.lastDate:input.startDate<original.startDate)||input.startDate>original.endDate)throw new Error('O substituto deve iniciar após o último dia do instrutor, dentro do período original.');
 if(!Number.isSafeInteger(input.hourRateCents)||input.hourRateCents<=0)throw new Error('Informe o valor da hora-aula do substituto.');
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>500||typeof input.city!=='string'||!input.city.trim()||input.city.length>80)throw new Error('Informe a cidade e o motivo da substituição.');
 const snapshot=structuredClone(previous?.instructorId===person.id?previous.instructorSnapshot:person);
 for(const field of ['document','contact','address','number','complement','neighborhood','city','state','postalCode','pix','pixType'])if(!snapshot[field]&&person[field])snapshot[field]=person[field];
 const child={...structuredClone(original),id:previous?.id||id,number:previous?.number||number,instructorId:person.id,instructorSnapshot:snapshot,hoursUnits:remaining,hourRateCents:input.hourRateCents,amountCents:C.total(remaining,input.hourRateCents),startDate:input.startDate,requestDate:input.signDate,lessonCount:null,substitution:{original,fulfilledHoursUnits:fulfilled,lastDate:input.lastDate,signDate:input.signDate,city:input.city.trim(),reason:input.reason.trim()}};
 // Preserve the initial agreement in the adendo; budget only the hours actually allocated.
 parent.hoursUnits=fulfilled;parent.amountCents=C.total(fulfilled,parent.hourRateCents);parent.endDate=input.lastDate;parent.referenceDate=original.endDate;parent.lessonCount=null;parent.replacementId=child.id;
 for(const item of [parent,child]){item.approvalStatus='pending';item.approvedBy=null;item.approvedAt=null;}
 if(previous)next.contracts[next.contracts.findIndex(c=>c.id===previous.id)]=child;else next.contracts.push(child);
 P.validate(next);return {next,id:child.id};
}
function protect(current,next){
 const comparable=item=>{const c=structuredClone(item);delete c.approvalStatus;delete c.approvedBy;delete c.approvedAt;return c;};
 for(const item of next.contracts){const old=current.contracts.find(c=>c.id===item.id);if(item.substitution||item.replacementId||old?.substitution||old?.replacementId)if(!old||!isDeepStrictEqual(comparable(item),comparable(old)))throw new Error('Edite este registro pela opção de substituição.');}
 for(const old of current.contracts)if((old.substitution||old.replacementId)&&!next.contracts.some(c=>c.id===old.id))throw new Error('O contrato possui um adendo vinculado e não pode ser removido.');
}
module.exports={apply,protect};
