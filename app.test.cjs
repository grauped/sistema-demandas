const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');

function app(initial = null) {
    const values = new Map(initial === null ? [] : [['sistema_demandas_v1', initial]]);
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value: '', textContent: '', innerHTML: '', checked: false,
            classList: { add() {}, remove() {}, contains() { return false; } },
            listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback; },
            querySelectorAll() { return []; }, focus() {}, reset() {},
        });
        return elements.get(id);
    };
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
    const context = vm.createContext({
        document: { getElementById: element, addEventListener() {},
            querySelector: element, querySelectorAll: () => [], body: { style: {} } },
        window: {}, localStorage: storage, console: { error() {}, warn() {} },
        setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => true,
    });
    const run = code => vm.runInContext(code, context);
    run(source);
    run('loadTasks()');
    return { run, storage, values, element,
        tasks: () => JSON.parse(run('JSON.stringify(tasks)')) };
}
const seed = { id: 'root', title: 'Teste', description: '', category: 'Trabalho',
    date: '2026-01-31', time: '', recurrence: 'monthly', priority: 'medium', completed: false };

test('mensal mantém o dia original, limita fevereiro e inclui ano bissexto', async () => {
    const a = app(JSON.stringify([seed]));
    a.run('createRecurringTasks(tasks[0])');
    const dates = a.tasks().map(task => task.date);
    assert.equal(dates.length, 31);
    assert.deepEqual(dates.slice(0, 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    assert.ok(dates.includes('2028-02-29'));
    a.run('createRecurringTasks(tasks[0])');
    assert.equal(a.tasks().length, 31);
});

test('diária e semanal atravessam a virada de ano', async () => {
    for (const [recurrence, expected] of [['daily', '2027-01-01'], ['weekly', '2027-01-07']]) {
        const a = app(JSON.stringify([{ ...seed, recurrence, date: '2026-12-31' }]));
        a.run('createRecurringTasks(tasks[0])');
        assert.equal(a.tasks()[1].date, expected);
    }
});

test('calendário navega a partir do dia 31 sem pular fevereiro', async () => {
    const a = app();
    a.run('calendarDate = new Date(2026, 0, 31); initializeCalendar()');
    a.element('nextMonth').listeners.click();
    assert.equal(a.run('formatDate(calendarDate)'), '2026-02-01');
    a.element('prevMonth').listeners.click();
    assert.equal(a.run('formatDate(calendarDate)'), '2026-01-01');
});

test('editar frequência gera repetições e preserva ocorrências concluídas', async () => {
    const a = app(JSON.stringify([{ ...seed, recurrence: 'none' }]));
    const fields = { taskId: 'root', taskTitle: 'Teste', taskDescription: '', taskDate: seed.date,
        taskTime: '', taskPriority: 'medium', taskCategory: 'Trabalho', taskRecurrence: 'weekly' };
    for (const [key, value] of Object.entries(fields)) a.element(key).value = value;
    await a.run('saveTaskFromForm({ preventDefault() {} })');
    assert.equal(a.tasks().length, 31);
    await a.run('toggleTask(tasks[1].id)');
    const completedId = a.tasks()[1].id;
    a.element('taskRecurrence').value = 'none';
    await a.run('saveTaskFromForm({ preventDefault() {} })');
    assert.equal(a.tasks().length, 2);
    assert.equal(a.tasks()[1].id, completedId);
    assert.equal(a.tasks()[1].completed, true);
});

test('falha ao gravar reverte alteração e não anuncia sucesso', async () => {
    const a = app(JSON.stringify([seed]));
    a.storage.setItem = () => { throw new Error('QuotaExceededError'); };
    await a.run('toggleTask("root")');
    assert.equal(a.tasks()[0].completed, false);
    assert.match(a.element('toast').textContent, /Não foi possível salvar/);
    assert.deepEqual(JSON.parse(a.values.get('sistema_demandas_v1')), [seed]);
});

test('dados inválidos não derrubam a aplicação nem são sobrescritos', async () => {
    for (const invalid of ['{', 'null', '{}', '[null]']) {
        const a = app(invalid);
        a.run('renderAll()');
        assert.equal(await a.run('saveTasks()'), false);
        assert.equal(a.values.get('sistema_demandas_v1'), invalid);
    }
});

test('registros antigos sem descrição continuam pesquisáveis', async () => {
    const { description, ...oldTask } = seed;
    const a = app(JSON.stringify([oldTask]));
    a.element('searchInput').value = 'inexistente';
    assert.doesNotThrow(() => a.run('renderAllTasks()'));
});

test('salvamento persiste conclusão e reabertura', async () => {
    const a = app(JSON.stringify([seed]));
    await a.run('toggleTask("root")');
    assert.equal(app(a.values.get('sistema_demandas_v1')).tasks()[0].completed, true);
    await a.run('toggleTask("root")');
    assert.equal(app(a.values.get('sistema_demandas_v1')).tasks()[0].completed, false);
});

test('exclusão exige confirmação e persiste somente após aceitar', async () => {
    const a = app(JSON.stringify([seed]));
    a.run('confirmAction = async () => false');
    await a.run('deleteTask("root")');
    assert.equal(a.tasks().length, 1);
    a.run('confirmAction = async () => true');
    await a.run('deleteTask("root")');
    assert.equal(a.tasks().length, 0);
    assert.equal(a.values.get('sistema_demandas_v1'), '[]');
});

test('limpeza cancelada preserva dados; falha ao gravar também reverte limpeza', async () => {
    const a = app(JSON.stringify([seed]));
    a.run('confirmAction = async () => false');
    await a.run('clearAllData()');
    assert.equal(a.tasks().length, 1);
    a.run('confirmAction = async () => true');
    a.storage.setItem = () => { throw new Error('QuotaExceededError'); };
    await a.run('clearAllData()');
    assert.equal(a.tasks().length, 1);
    assert.match(a.element('toast').textContent, /Não foi possível salvar/);
});

test('filtro mensal de demandas diferencia mês e ano e permite limpar',()=>{
 const a=app(JSON.stringify([{...seed,title:'Janeiro atual'},{...seed,id:'next',date:'2027-01-31',title:'Janeiro seguinte'}]));
 a.element('filterPriority').value='all';a.element('filterStatus').value='all'; a.element('filterMonth').value='2026-01';a.run('renderAllTasks()');
 assert.match(a.element('allTasks').innerHTML,/Janeiro atual/);assert.doesNotMatch(a.element('allTasks').innerHTML,/Janeiro seguinte/);
 a.element('filterMonth').value='';a.run('renderAllTasks()');assert.match(a.element('allTasks').innerHTML,/Janeiro seguinte/);
});

