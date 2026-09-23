(function (root, factory) {
    const core = typeof module === 'object' && module.exports ? require('./contracts-core.js') : root.ContractsCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AccessPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
    'use strict';
    const roles = {
        gestora: { label: 'Gestora', courses: [...C.courses] },
        exatas: { label: 'Coordenação de Exatas', courses: ['ADM', 'ELT', 'STB', 'DSI', 'ELP', 'BCV'] },
        saude: { label: 'Coordenação de Saúde', courses: ['RAD', 'ENF', 'EIC', 'FLB'] },
    };
    const departments = ['exatas', 'saude'];
    const clone = data => JSON.parse(JSON.stringify(data));
    function courseDepartment(course) {
        if (course === 'GERAL') return 'unassigned';
        if (roles.exatas.courses.includes(course)) return 'exatas';
        if (roles.saude.courses.includes(course)) return 'saude';
        throw new Error('Curso inválido.');
    }
    function canSee(role, department) { return !!roles[role] && (role === 'gestora' || role === department); }
    function normalize(input) {
        const data = clone(C.validateStore(input));
        const instructors = [];
        for (const original of data.instructors) {
            if (departments.includes(original.department) || original.department === 'unassigned') {
                instructors.push(original);
                continue;
            }
            const owned = [...new Set(data.contracts.filter(item => item.instructorId === original.id).map(item => courseDepartment(item.course)))];
            if (!owned.length) owned.push('unassigned');
            for (const department of owned) {
                const id = owned.length > 1 ? `${original.id}--${department}` : original.id;
                instructors.push({ ...clone(original), id, department });
                for (const item of data.contracts.filter(item => item.instructorId === original.id && courseDepartment(item.course) === department)) {
                    item.instructorId = id;
                    item.instructorSnapshot.id = id;
                }
            }
        }
        data.instructors = instructors;
        for (const item of data.contracts) {
            item.department = courseDepartment(item.course);
            item.instructorSnapshot.department = item.department;
        }
        data.settingsByRole ||= {};
        for (const role of Object.keys(roles)) data.settingsByRole[role] ||= clone(data.settings);
        validate(data);
        return data;
    }
    function validate(data) {
        C.validateStore(data);
        const byId = new Map(data.instructors.map(item => [item.id, item]));
        for (const item of data.instructors) {
            if (![...departments, 'unassigned'].includes(item.department)) throw new Error('Selecione a coordenação do instrutor.');
        }
        for (const item of data.contracts) {
            const department = courseDepartment(item.course);
            if (item.department !== department || item.instructorSnapshot.department !== department || byId.get(item.instructorId)?.department !== department) {
                throw new Error('O curso e o instrutor devem pertencer à mesma coordenação.');
            }
        }
        return data;
    }
    function select(data, role) {
        if (!roles[role]) throw new Error('Perfil inválido.');
        return {
            version: 1,
            instructors: clone(data.instructors.filter(item => canSee(role, item.department))),
            contracts: clone(data.contracts.filter(item => canSee(role, item.department))),
            settings: clone(data.settingsByRole?.[role] || data.settings),
        };
    }
    function merge(current, incoming, role) {
        if (!roles[role]) throw new Error('Perfil inválido.');
        validate(incoming);
        if (role !== 'gestora') {
            if (incoming.instructors.some(item => item.department !== role) || incoming.contracts.some(item => item.department !== role)) {
                throw new Error('Este acesso permite somente os dados da sua coordenação.');
            }
            const hiddenIds = new Set([...current.instructors, ...current.contracts].filter(item => !canSee(role,item.department)).map(item=>item.id));
            if ([...incoming.instructors,...incoming.contracts].some(item=>hiddenIds.has(item.id))) throw new Error('Identificador indisponível. Atualize a página.');
        }
        const next = clone(current);
        next.instructors = [...current.instructors.filter(item => !canSee(role,item.department)), ...clone(incoming.instructors)];
        next.contracts = [...current.contracts.filter(item => !canSee(role,item.department)), ...clone(incoming.contracts)];
        next.settingsByRole ||= {};
        next.settingsByRole[role] = clone(incoming.settings);
        if (role === 'gestora') next.settings = clone(incoming.settings);
        validate(next);
        return next;
    }
    return { roles, departments, courseDepartment, canSee, normalize, validate, select, merge };
});
