(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ContractsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const courses = ['ADM', 'STB', 'ELT', 'DSI', 'ELP', 'BCV', 'ENF', 'RAD', 'EIC', 'FLB'];
    const empty = () => ({ version: 1, instructors: [], contracts: [], settings: { requester: '', budgetBasis: 'endDate' } });
    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(value + 'T12:00:00Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    function cycle(month) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Selecione um mês válido.');
        const [year, number] = month.split('-').map(Number);
        const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
        return { start: `${month}-07`, end: `${next}-06` };
    }
    function currentCycle(today) {
        if (!validDate(today)) throw new Error('Data inválida.');
        const [year, month, day] = today.split('-').map(Number);
        if (day >= 7) return today.slice(0, 7);
        return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
    }
    function cents(value) {
        const clean = String(value).trim().replace(',', '.');
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) throw new Error('Informe um valor válido, com até duas casas decimais.');
        const [whole, fraction = ''] = clean.split('.');
        return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    }
    function validateInstructor(instructor) {
        if (!instructor || typeof instructor.id !== 'string' || !instructor.id ||
            typeof instructor.name !== 'string' || !instructor.name.trim() ||
            typeof instructor.active !== 'boolean') throw new Error('Cadastro de instrutor inválido.');
        for (const key of ['document', 'contact', 'address', 'number', 'complement', 'neighborhood', 'city', 'state', 'postalCode', 'pix', 'pixType']) {
            if (typeof instructor[key] !== 'string') throw new Error('Dados do instrutor inválidos.');
        }
        if (!instructor.documents || ['rg', 'cpf', 'residence', 'degree', 'other'].some(key => typeof instructor.documents[key] !== 'boolean')) throw new Error('Checklist de documentos inválido.');
    }
    function validateContract(contract) {
        if (!contract || typeof contract.id !== 'string' || !contract.id ||
            typeof contract.number !== 'string' || !/^SC-\d{4}-\d+$/.test(contract.number) ||
            typeof contract.instructorId !== 'string' || !courses.includes(contract.course) ||
            typeof contract.group !== 'string' || !/^\d+$/.test(contract.group) ||
            !validDate(contract.referenceDate) || !validDate(contract.startDate) || !validDate(contract.endDate) ||
            !validDate(contract.requestDate) || contract.startDate > contract.endDate || contract.referenceDate !== contract.endDate ||
            typeof contract.discipline !== 'string' || !contract.discipline.trim() ||
            typeof contract.requester !== 'string' || !contract.requester.trim() ||
            !['theory', 'practice', 'both'].includes(contract.type) ||
            !['', 'M', 'T', 'N', 'I'].includes(contract.shift) ||
            !Number.isSafeInteger(contract.hoursUnits) || contract.hoursUnits <= 0 ||
            !Number.isSafeInteger(contract.hourRateCents) || contract.hourRateCents <= 0 ||
            !Number.isSafeInteger(contract.amountCents) || contract.amountCents !== total(contract.hoursUnits, contract.hourRateCents) ||
            contract.amountCents < 0 || typeof contract.cancelled !== 'boolean' ||
            typeof contract.notes !== 'string') throw new Error('Registro de contrato inválido.');
        if (contract.lessonCount != null && (!Number.isSafeInteger(contract.lessonCount) || contract.lessonCount <= 0)) throw new Error('Quantidade de aulas inválida.');
        if (contract.approvalStatus !== undefined && !['pending','approved'].includes(contract.approvalStatus)) throw new Error('Situação de aprovação inválida.');
        validateInstructor(contract.instructorSnapshot);
        if (contract.instructorSnapshot.id !== contract.instructorId) throw new Error('Instrutor do contrato inválido.');
    }
    function validateStore(data) {
        if (!data || data.version !== 1 || !Array.isArray(data.instructors) || !Array.isArray(data.contracts)) {
            throw new Error('Arquivo de dados incompatível.');
        }
        data.instructors.forEach(validateInstructor);
        data.contracts.forEach(validateContract);
        if (!data.settings || typeof data.settings.requester !== 'string' || data.settings.budgetBasis !== 'endDate') throw new Error('Preferências inválidas.');
        for (const list of [data.instructors, data.contracts]) {
            if (new Set(list.map(item => item.id)).size !== list.length) throw new Error('Identificadores duplicados.');
        }
        const ids = new Set(data.instructors.map(item => item.id));
        if (data.contracts.some(item => !ids.has(item.instructorId))) throw new Error('Contrato sem cadastro de instrutor.');
        return data;
    }
    function total(hoursUnits, hourRateCents) {
        const product = hoursUnits * hourRateCents;
        if (!Number.isSafeInteger(product)) throw new Error('Valor excede o limite suportado.');
        return Math.round(product / 100);
    }
    function groupLabel(contract) {
        return contract.course + contract.group + (contract.shift ? '-' + contract.shift : '');
    }
    function report(contracts, { start, end, course = '', group = '' }) {
        if (!validDate(start) || !validDate(end) || start > end) throw new Error('Informe um período válido: a data final deve ser igual ou posterior à inicial.');
        if (course && !courses.includes(course)) throw new Error('Curso inválido.');
        const rows = contracts.filter(item => !item.cancelled && item.approvalStatus === 'approved' && item.referenceDate >= start && item.referenceDate <= end &&
            (!course || item.course === course) && (!group || item.group === group.trim()));
        rows.sort((a, b) => a.referenceDate.localeCompare(b.referenceDate) || a.id.localeCompare(b.id));
        return { rows, total: rows.reduce((sum, item) => sum + item.amountCents, 0),
            byCourse: courses.map(code => ({ course: code,
                total: rows.filter(item => item.course === code).reduce((sum, item) => sum + item.amountCents, 0),
                count: rows.filter(item => item.course === code).length })).filter(item => item.count) };
    }
    function csv(rows) {
        const cell = value => {
            let text = String(value);
            if (/^[=+@\-\t\r\n]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
        };
        return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
    }
    return { courses, empty, validDate, cycle, currentCycle, cents, total, groupLabel, validateStore, validateContract, report, csv };
});
