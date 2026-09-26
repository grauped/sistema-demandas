// Only the approval endpoint can grant approval; imports and edits cannot.
const fields=['instructorId','instructorSnapshot','department','course','group','shift','is2D','discipline','type','hoursUnits','hourRateCents','amountCents','startDate','endDate','referenceDate','requestDate','requester','notes','lessonCount','cancelled'];
function stable(value){if(value&&typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function signature(item){return JSON.stringify(fields.map(key=>stable(key==='is2D' ? item[key]===true : item[key]??null)));}
function enforce(current,next){const old=new Map(current.contracts.map(item=>[item.id,item]));for(const item of next.contracts){const previous=old.get(item.id);const unchanged=previous&&signature(previous)===signature(item);item.approvalStatus=unchanged&&previous.approvalStatus==='approved'?'approved':'pending';item.approvedBy=item.approvalStatus==='approved'?previous.approvedBy:null;item.approvedAt=item.approvalStatus==='approved'?previous.approvedAt:null;}}
module.exports={enforce};
