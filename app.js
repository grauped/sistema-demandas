/* =====================================================
   SISTEMA DE DEMANDAS
   V1
===================================================== */


/* =====================================================
   CONFIGURAÇÕES
===================================================== */

const STORAGE_KEY = "sistema_demandas_v1";

let tasks = [];
let savedTasksSnapshot = "[]";
let storageLoadFailed = false;
let taskRevision = 0;
let taskSaving = false;
let modalReturnFocus;

let calendarDate = new Date();


/* =====================================================
   ELEMENTOS
===================================================== */

const modal = document.getElementById("taskModal");

const taskForm = document.getElementById("taskForm");

const toast = document.getElementById("toast");


/* =====================================================
   INICIALIZAÇÃO
===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
    try { if (window.Auth) await Auth.requireSession("gestora"); } catch { return; }

    await loadTasks();

    initializeDates();

    initializeNavigation();

    initializeModal();

    initializeFilters();

    initializeCalendar();

    initializeSettings();

    renderAll();

    // A permissão é solicitada apenas ao ativar as notificações.

});


/* =====================================================
   STORAGE
===================================================== */

async function loadTasks() {
    try {
        let parsed;
        if (window.Auth) { const result = await Auth.api("/api/tasks"); parsed = result.data; taskRevision = result.revision; }
        else { const saved = localStorage.getItem(STORAGE_KEY); parsed = saved ? JSON.parse(saved) : []; }
        if (!Array.isArray(parsed) || parsed.some(task => !task ||
            typeof task.id !== "string" || typeof task.title !== "string" ||
            typeof task.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(task.date) ||
            !Number.isFinite(new Date(task.date + "T00:00:00").getTime()))) {
            throw new Error("Formato inválido dos dados salvos");
        }
        tasks = parsed.map(task => ({ ...task,
            description: typeof task.description === "string" ? task.description : "",
            category: typeof task.category === "string" ? task.category : "Trabalho",
            time: typeof task.time === "string" && /^\d{2}:\d{2}$/.test(task.time) ? task.time : "",
            recurrence: ["none", "daily", "weekly", "monthly"].includes(task.recurrence) ? task.recurrence : "none",
            completed: task.completed === true
        }));
        savedTasksSnapshot = JSON.stringify(tasks);
        storageLoadFailed = false;
    } catch (error) {
        console.error("Erro ao carregar demandas:", error);
        tasks = [];
        storageLoadFailed = true;
        showToast("Não foi possível carregar os dados. Os dados originais foram preservados.");
    }
}


async function saveTasks() {
    taskSaving = true;
    try {
        if (storageLoadFailed) throw new Error("Armazenamento não carregado");
        const serialized = JSON.stringify(tasks);
        if (window.Auth) { const result = await Auth.api("/api/tasks", {method:"PUT",data:{data:JSON.parse(serialized),revision:taskRevision}}); taskRevision = result.revision; }
        else localStorage.setItem(STORAGE_KEY, serialized);
        savedTasksSnapshot = serialized;
        return true;
    } catch (error) {
        tasks = JSON.parse(savedTasksSnapshot);
        renderAll();
        showToast("Não foi possível salvar. Verifique se o servidor está aberto e recarregue a página antes de tentar novamente.");
        return false;
    } finally { taskSaving = false; }
}


/* =====================================================
   DATAS
===================================================== */

function getTodayString() {

    const now = new Date();

    const year =
        now.getFullYear();

    const month =
        String(now.getMonth() + 1)
        .padStart(2, "0");

    const day =
        String(now.getDate())
        .padStart(2, "0");

    return `${year}-${month}-${day}`;

}


function initializeDates() {

    const now = new Date();

    const formatted =
        now.toLocaleDateString(
            "pt-BR",
            {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric"
            }
        );

    document.getElementById(
        "currentDate"
    ).textContent = formatted;

    document.getElementById(
        "todayDate"
    ).textContent =
        now.toLocaleDateString(
            "pt-BR",
            {
                day: "2-digit",
                month: "long",
                year: "numeric"
            }
        );

}


/* =====================================================
   NAVEGAÇÃO
===================================================== */

function initializeNavigation() {

    document
        .querySelectorAll(".menu-item[data-section]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const section =
                        button.dataset.section;

                    showSection(section);

                }
            );

        });


    document
        .getElementById("verTodas")
        .addEventListener(
            "click",
            () => showSection("demandas")
        );


    document
        .getElementById("quickCalendar")
        .addEventListener(
            "click",
            () => showSection("calendario")
        );


    document
        .getElementById("quickAdd")
        .addEventListener(
            "click",
            openNewTaskModal
        );


    document
        .getElementById("btnNovaDemanda")
        .addEventListener(
            "click",
            openNewTaskModal
        );

}


function showSection(sectionId) {

    document
        .querySelectorAll(".section")
        .forEach(section => {

            section.classList.remove("active");

        });


    const target =
        document.getElementById(sectionId);

    if (target) {

        target.classList.add("active");

    }


    document
        .querySelectorAll(".menu-item")
        .forEach(item => {

            item.classList.toggle(
                "active",
                item.dataset.section === sectionId
            );

        });


    const titles = {

        dashboard: "Dashboard",

        demandas: "Demandas",

        calendario: "Calendário",

        historico: "Histórico",

        configuracoes: "Configurações"

    };


    document.getElementById(
        "pageTitle"
    ).textContent =
        titles[sectionId] || "Dashboard";


    renderAll();

}


/* =====================================================
   MODAL
===================================================== */

function initializeModal() {
    document.addEventListener("keydown", event => {
        if (!modal.classList.contains("active")) return;
        if (event.key === "Escape") closeModal();
        if (event.key === "Tab") {
            const controls = [...modal.querySelectorAll("button, input:not([type='hidden']), textarea, select")];
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        }
    });

    document
        .getElementById("closeModal")
        .addEventListener(
            "click",
            closeModal
        );


    document
        .getElementById("cancelModal")
        .addEventListener(
            "click",
            closeModal
        );


    modal.addEventListener(
        "click",
        event => {

            if (event.target === modal) {

                closeModal();

            }

        }
    );


    taskForm.addEventListener(
        "submit",
        saveTaskFromForm
    );

}


function openNewTaskModal() {

    taskForm.reset();

    document.getElementById(
        "taskId"
    ).value = "";


    document.getElementById(
        "taskDate"
    ).value = getTodayString();


    document.getElementById(
        "taskPriority"
    ).value = "medium";


    document.getElementById(
        "taskRecurrence"
    ).value = "none";


    document.getElementById(
        "modalTitle"
    ).textContent =
        "Adicionar demanda";


    showTaskModal();

}


function closeModal() {
    modal.classList.remove("active");
    document.querySelector(".main").inert = false;
    document.querySelector(".sidebar").inert = false;
    document.body.style.overflow = "";
    if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
    else document.getElementById("btnNovaDemanda").focus();
}

function showTaskModal() {
    modalReturnFocus = document.activeElement;
    modal.classList.add("active");
    document.querySelector(".main").inert = true;
    document.querySelector(".sidebar").inert = true;
    document.body.style.overflow = "hidden";
    document.getElementById("modalEyebrow").textContent =
        document.getElementById("taskId").value ? "EDITAR DEMANDA" : "NOVA DEMANDA";
    document.getElementById("taskTitle").focus();
}


/* =====================================================
   SALVAR DEMANDA
===================================================== */

async function saveTaskFromForm(event) {

    event.preventDefault();
    if (taskSaving) return;


    const id =
        document.getElementById(
            "taskId"
        ).value;


    const taskData = {

        title:
            document.getElementById(
                "taskTitle"
            ).value.trim(),

        description:
            document.getElementById(
                "taskDescription"
            ).value.trim(),

        date:
            document.getElementById(
                "taskDate"
            ).value,

        time:
            document.getElementById(
                "taskTime"
            ).value,

        priority:
            document.getElementById(
                "taskPriority"
            ).value,

        category:
            document.getElementById(
                "taskCategory"
            ).value,

        recurrence:
            document.getElementById(
                "taskRecurrence"
            ).value

    };


    if (!taskData.title) {

        showToast(
            "Digite o título da demanda."
        );

        return;

    }


    if (!taskData.date) {

        showToast(
            "Informe a data da demanda."
        );

        return;

    }


    if (id) {

        const index =
            tasks.findIndex(
                task =>
                    task.id === id
            );


        if (index !== -1) {
            const previous = tasks[index];

            tasks[index] = {

                ...tasks[index],

                ...taskData

            };
            if (previous.recurrence !== taskData.recurrence) {
                const updated = tasks[index];
                tasks = tasks.filter(task => task.parentId !== id || task.completed);
                createRecurringTasks(updated);
            }

        }




    } else {

        const newTask = {

            id:
                generateId(),

            ...taskData,

            completed: false,

            completedAt: null,

            createdAt:
                new Date().toISOString()

        };


        tasks.push(newTask);


        createRecurringTasks(
            newTask
        );




    }


    if (!await saveTasks()) return;
    showToast(id ? "Demanda atualizada!" : "Demanda criada com sucesso!");

    closeModal();

    renderAll();

}


/* =====================================================
   ID
===================================================== */

function generateId() {

    return Date.now().toString(36)
        + Math.random()
            .toString(36)
            .substring(2);

}


/* =====================================================
   RECORRÊNCIA
===================================================== */

function createRecurringTasks(task) {
    if (!["daily", "weekly", "monthly"].includes(task.recurrence)) return;
    const base = new Date(task.date + "T00:00:00");
    for (let i = 1; i <= 30; i++) {
        const date = new Date(base);
        if (task.recurrence === "monthly") {
            date.setDate(1);
            date.setMonth(base.getMonth() + i);
            const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
            date.setDate(Math.min(base.getDate(), lastDay));
        } else {
            date.setDate(base.getDate() + i * (task.recurrence === "weekly" ? 7 : 1));
        }
        const nextDate = formatDate(date);
        if (tasks.some(item => item.parentId === task.id && item.date === nextDate)) continue;
        tasks.push({ ...task, id: generateId(), date: nextDate, completed: false,
            completedAt: null, createdAt: new Date().toISOString(), parentId: task.id });
    }
}


/* =====================================================
   CONCLUIR
===================================================== */

async function toggleTask(id) {
    if (taskSaving) return;

    const task =
        tasks.find(
            item => item.id === id
        );


    if (!task) {

        return;

    }


    task.completed =
        !task.completed;


    task.completedAt =
        task.completed
            ? new Date().toISOString()
            : null;


    if (!await saveTasks()) return;

    renderAll();


    if (task.completed) {

        showToast(
            "Demanda concluída! ✓"
        );

    } else {

        showToast(
            "Demanda reaberta."
        );

    }

}


/* =====================================================
   EDITAR
===================================================== */

function editTask(id) {

    const task =
        tasks.find(
            item => item.id === id
        );


    if (!task) {

        return;

    }


    document.getElementById(
        "taskId"
    ).value = task.id;


    document.getElementById(
        "taskTitle"
    ).value = task.title;


    document.getElementById(
        "taskDescription"
    ).value = task.description;


    document.getElementById(
        "taskDate"
    ).value = task.date;


    document.getElementById(
        "taskTime"
    ).value = task.time;


    document.getElementById(
        "taskPriority"
    ).value = task.priority;


    document.getElementById(
        "taskCategory"
    ).value = task.category;


    document.getElementById(
        "taskRecurrence"
    ).value = task.recurrence;


    document.getElementById(
        "modalTitle"
    ).textContent =
        "Editar demanda";


    showTaskModal();

}


/* =====================================================
   EXCLUIR
===================================================== */

function confirmAction(message) {
    const dialog = document.getElementById("confirmDialog");
    document.getElementById("confirmMessage").textContent = message;
    dialog.returnValue = "cancel";
    return new Promise(resolve => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
        dialog.showModal();
        document.getElementById("cancelConfirm").focus();
    });
}

async function deleteTask(id) {
    if (taskSaving) return;

    const task =
        tasks.find(
            item => item.id === id
        );


    if (!task) {

        return;

    }


    const confirmed =
        await confirmAction(
            `Deseja realmente excluir "${task.title}"?`
        );


    if (!confirmed) {

        return;

    }


    tasks =
        tasks.filter(
            item => item.id !== id
        );


    if (!await saveTasks()) return;

    renderAll();

    showToast(
        "Demanda excluída."
    );

}


/* =====================================================
   STATUS
===================================================== */

function isOverdue(task) {

    if (task.completed) {

        return false;

    }


    const now =
        new Date();


    const taskDate =
        new Date(
            `${task.date}T${task.time || "23:59:59.999"}`
        );


    return taskDate < now;

}


/* =====================================================
   FORMATAÇÃO
===================================================== */

function formatDate(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");


    return `${year}-${month}-${day}`;

}


function formatDateBR(dateString) {

    if (!dateString) {

        return "";

    }


    const parts =
        dateString.split("-");


    if (parts.length !== 3) {

        return dateString;

    }


    return `${parts[2]}/${parts[1]}/${parts[0]}`;

}


/* =====================================================
   PRIORIDADE
===================================================== */

function priorityLabel(priority) {

    const labels = {

        high: {
            text: "Alta",
            class: "badge-high"
        },

        medium: {
            text: "Média",
            class: "badge-medium"
        },

        low: {
            text: "Baixa",
            class: "badge-low"
        }

    };


    return labels[priority]
        || labels.medium;

}


/* =====================================================
   RENDERIZAÇÃO GERAL
===================================================== */

function renderAll() {

    renderStats();

    renderTodayTasks();

    renderAllTasks();

    renderHistory();

    renderCalendar();

}


/* =====================================================
   ESTATÍSTICAS
===================================================== */

function renderStats() {

    const today =
        getTodayString();


    const todayTasks =
        tasks.filter(
            task =>
                task.date === today &&
                !task.completed
        );


    const overdue =
        tasks.filter(
            task =>
                isOverdue(task)
        );


    const pending =
        tasks.filter(
            task =>
                !task.completed
        );


    const completed =
        tasks.filter(
            task =>
                task.completed
        );


    document.getElementById(
        "statToday"
    ).textContent =
        todayTasks.length;


    document.getElementById(
        "statOverdue"
    ).textContent =
        overdue.length;


    document.getElementById(
        "statPending"
    ).textContent =
        pending.length;


    document.getElementById(
        "statCompleted"
    ).textContent =
        completed.length;

}


/* =====================================================
   DEMANDAS DE HOJE
===================================================== */

function renderTodayTasks() {

    const container =
        document.getElementById(
            "todayTasks"
        );


    const today =
        getTodayString();


    let todayTasks =
        tasks.filter(
            task =>
                task.date === today
        );


    todayTasks =
        sortTasks(todayTasks);


    renderTaskList(
        container,
        todayTasks,
        "Nenhuma demanda para hoje."
    );

}


/* =====================================================
   TODAS AS DEMANDAS
===================================================== */

function renderAllTasks() {

    const container =
        document.getElementById(
            "allTasks"
        );


    const search =
        document.getElementById(
            "searchInput"
        ).value
            .toLowerCase()
            .trim();


    const status =
        document.getElementById(
            "filterStatus"
        ).value;


    const priority =
        document.getElementById(
            "filterPriority"
        ).value;


    let filtered =
        [...tasks];


    const month = document.getElementById("filterMonth")?.value;
    if (month) filtered = filtered.filter(task => task.date.startsWith(month));

    if (search) {

        filtered =
            filtered.filter(
                task =>
                    task.title
                        .toLowerCase()
                        .includes(search)
                    ||
                    task.description
                        .toLowerCase()
                        .includes(search)
            );

    }


    if (status === "pending") {

        filtered =
            filtered.filter(
                task =>
                    !task.completed
            );

    }


    if (status === "completed") {

        filtered =
            filtered.filter(
                task =>
                    task.completed
            );

    }


    if (status === "overdue") {

        filtered =
            filtered.filter(
                task =>
                    isOverdue(task)
            );

    }


    if (priority !== "all") {

        filtered =
            filtered.filter(
                task =>
                    task.priority === priority
            );

    }


    filtered =
        sortTasks(filtered);


    renderTaskList(
        container,
        filtered,
        "Nenhuma demanda encontrada."
    );

}


/* =====================================================
   HISTÓRICO
===================================================== */

function renderHistory() {

    const container =
        document.getElementById(
            "historyTasks"
        );


    const completed =
        tasks
            .filter(
                task =>
                    task.completed
            )
            .sort(
                (a, b) =>
                    new Date(
                        b.completedAt
                    )
                    -
                    new Date(
                        a.completedAt
                    )
            );


    renderTaskList(
        container,
        completed,
        "Nenhuma demanda concluída ainda."
    );

}


/* =====================================================
   ORDENAR
===================================================== */

function sortTasks(taskList) {

    const priorityOrder = {

        high: 1,

        medium: 2,

        low: 3

    };


    return taskList.sort(
        (a, b) => {

            if (
                a.completed !==
                b.completed
            ) {

                return a.completed
                    ? 1
                    : -1;

            }


            const dateCompare =
                a.date.localeCompare(
                    b.date
                );


            if (
                dateCompare !== 0
            ) {

                return dateCompare;

            }


            const timeA =
                a.time || "23:59";


            const timeB =
                b.time || "23:59";


            if (
                timeA !== timeB
            ) {

                return timeA.localeCompare(
                    timeB
                );

            }


            return (
                priorityOrder[a.priority]
                -
                priorityOrder[b.priority]
            );

        }
    );

}


/* =====================================================
   HTML DA DEMANDA
===================================================== */

function renderTaskList(
    container,
    taskList,
    emptyMessage
) {

    if (!taskList.length) {

        container.innerHTML = `

            <div class="empty-state">

                <div style="font-size:35px;margin-bottom:10px;">
                    📭
                </div>

                <strong>
                    ${emptyMessage}
                </strong>

                <span>
                    Você está em dia!
                </span>

            </div>

        `;

        return;

    }


    container.innerHTML =
        taskList
            .map(
                task =>
                    createTaskHTML(task)
            )
            .join("");


    container
        .querySelectorAll(
            "[data-action='complete']"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () =>
                    toggleTask(
                        button.dataset.id
                    )
            );

        });


    container
        .querySelectorAll(
            "[data-action='edit']"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () =>
                    editTask(
                        button.dataset.id
                    )
            );

        });


    container
        .querySelectorAll(
            "[data-action='delete']"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () =>
                    deleteTask(
                        button.dataset.id
                    )
            );

        });

}


/* =====================================================
   HTML DE UMA DEMANDA
===================================================== */

function createTaskHTML(task) {

    const priority =
        priorityLabel(
            task.priority
        );


    const overdue =
        isOverdue(task);


    let badges = `

        <span class="badge ${priority.class}">
            ${priority.text}
        </span>

    `;


    if (overdue) {

        badges += `

            <span class="badge badge-overdue">
                Atrasada
            </span>

        `;

    }


    if (
        task.recurrence !== "none"
    ) {

        badges += `

            <span class="badge badge-recurring">
                🔄 Recorrente
            </span>

        `;

    }


    const time =
        task.time
            ? ` • ${task.time}`
            : "";


    return `

        <div
            class="task ${task.completed ? "completed" : ""}"
            data-id="${escapeHTML(task.id)}"
        >

            <button
                class="task-check ${task.completed ? "completed" : ""}"
                data-action="complete"
                data-id="${escapeHTML(task.id)}"
                title="${
                    task.completed
                        ? "Reabrir"
                        : "Concluir"
                }"
            >
                ${
                    task.completed
                        ? "✓"
                        : ""
                }
            </button>


            <div class="task-info">

                <div class="task-title">
                    ${escapeHTML(task.title)}
                </div>

                ${
                    task.description
                        ? `
                            <div class="task-description">
                                ${escapeHTML(task.description)}
                            </div>
                        `
                        : ""
                }

            </div>


            <div class="task-meta">

                ${badges}

                <span class="task-date">
                    📅 ${formatDateBR(task.date)}
                    ${time}
                </span>

                <span class="task-date">
                    ${escapeHTML(task.category)}
                </span>

            </div>


            <div class="task-actions">

                <button
                    class="icon-button"
                    data-action="edit"
                    data-id="${escapeHTML(task.id)}"
                    title="Editar"
                >
                    ✏️
                </button>

                <button
                    class="icon-button"
                    data-action="delete"
                    data-id="${escapeHTML(task.id)}"
                    title="Excluir"
                >
                    🗑️
                </button>

            </div>

        </div>

    `;

}


/* =====================================================
   SEGURANÇA BÁSICA DO HTML
===================================================== */

function escapeHTML(text) {

    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =====================================================
   FILTROS
===================================================== */

function initializeFilters() {

    document
        .getElementById("searchInput")
        .addEventListener(
            "input",
            renderAllTasks
        );


    document
        .getElementById("filterStatus")
        .addEventListener(
            "change",
            renderAllTasks
        );


    document
        .getElementById("filterPriority")
        .addEventListener(
            "change",
            renderAllTasks
        );

}


/* =====================================================
   CALENDÁRIO
===================================================== */

function initializeCalendar() {
    document.getElementById("filterMonth")?.addEventListener("change", renderAllTasks);
    document.getElementById("clearFilterMonth")?.addEventListener("click", () => { document.getElementById("filterMonth").value = ""; renderAllTasks(); });

    document
        .getElementById("prevMonth")
        .addEventListener(
            "click",
            () => {

                calendarDate.setMonth(
                    calendarDate.getMonth() - 1, 1
                );

                renderCalendar();

            }
        );


    document
        .getElementById("nextMonth")
        .addEventListener(
            "click",
            () => {

                calendarDate.setMonth(
                    calendarDate.getMonth() + 1, 1
                );

                renderCalendar();

            }
        );

}


function renderCalendar() {

    const calendar =
        document.getElementById(
            "calendar"
        );


    const year =
        calendarDate.getFullYear();


    const month =
        calendarDate.getMonth();


    const monthName =
        calendarDate.toLocaleDateString(
            "pt-BR",
            {
                month: "long",
                year: "numeric"
            }
        );


    document.getElementById(
        "calendarMonth"
    ).textContent =
        monthName
            .charAt(0)
            .toUpperCase()
        +
        monthName.slice(1);


    const firstDay =
        new Date(
            year,
            month,
            1
        ).getDay();


    const daysInMonth =
        new Date(
            year,
            month + 1,
            0
        ).getDate();


    const weekdays = [

        "Dom",
        "Seg",
        "Ter",
        "Qua",
        "Qui",
        "Sex",
        "Sáb"

    ];


    let html =
        weekdays
            .map(
                day =>
                    `<div class="calendar-weekday">${day}</div>`
            )
            .join("");


    for (
        let i = 0;
        i < firstDay;
        i++
    ) {

        html += `
            <div class="calendar-day empty"></div>
        `;

    }


    const today =
        getTodayString();


    for (
        let day = 1;
        day <= daysInMonth;
        day++
    ) {

        const date =
            `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;


        const dayTasks =
            tasks.filter(
                task =>
                    task.date === date
            );


        html += `

            <div
                class="calendar-day ${
                    date === today
                        ? "today"
                        : ""
                }"
            >

                <div class="day-number">
                    ${day}
                </div>

                ${

                    dayTasks
                        .slice(0, 3)
                        .map(
                            task =>
                                `
                                    <div class="calendar-task">
                                        ${escapeHTML(task.title)}
                                    </div>
                                `
                        )
                        .join("")

                }

                ${
                    dayTasks.length > 3
                        ? `
                            <div class="calendar-task">
                                +${dayTasks.length - 3} mais
                            </div>
                        `
                        : ""
                }

            </div>

        `;

    }


    calendar.innerHTML = html;

}


/* =====================================================
   CONFIGURAÇÕES
===================================================== */

function initializeSettings() {
    const toggle = document.getElementById("notificationToggle");
    const supported = "Notification" in window;
    toggle.disabled = !supported;
    try {
        toggle.checked = supported && Notification.permission === "granted" &&
            localStorage.getItem("notifications_enabled") === "true";
    } catch { toggle.checked = false; }
    toggle.addEventListener("change", async () => {
        const previous = !toggle.checked;
        toggle.disabled = true;
        try {
            if (toggle.checked && await requestNotificationPermission() !== "granted") {
                toggle.checked = false;
                showToast("Permissão para notificações não concedida.");
            }
            localStorage.setItem("notifications_enabled", String(toggle.checked));
        } catch {
            toggle.checked = previous;
            showToast("Não foi possível salvar a preferência de notificações.");
        } finally { toggle.disabled = !supported; }
    });
    document.getElementById("clearData").addEventListener("click", clearAllData);
}


/* =====================================================
   NOTIFICAÇÕES
===================================================== */

async function requestNotificationPermission() {

    if (
        !("Notification" in window)
    ) {

        return "unsupported";

    }


    if (
        Notification.permission ===
        "granted"
    ) {

        return "granted";

    }


    if (
        Notification.permission ===
        "denied"
    ) {

        return "denied";

    }


    try {

        return await Notification.requestPermission();

    } catch {

        return "denied";

    }

}


/* =====================================================
   VERIFICAR DEMANDAS
===================================================== */

function checkNotifications() {
    try {

    const enabled =
        localStorage.getItem(
            "notifications_enabled"
        ) === "true";


    if (!enabled) {

        return;

    }


    if (
        !("Notification" in window)
    ) {

        return;

    }


    if (
        Notification.permission !==
        "granted"
    ) {

        return;

    }


    const today =
        getTodayString();


    const pending =
        tasks.filter(
            task =>
                task.date === today &&
                !task.completed
        );


    if (!pending.length) {

        return;

    }


    const lastNotification =
        localStorage.getItem(
            "last_notification"
        );


    const currentHour =
        new Date()
            .getHours();


    const notificationKey =
        `${today}-${currentHour}`;


    if (
        lastNotification ===
        notificationKey
    ) {

        return;

    }


    new Notification(
        "Minhas Demandas",
        {

            body:
                `Você tem ${pending.length} demanda(s) pendente(s) para hoje.`,

            icon: ""

        }
    );


    localStorage.setItem(
        "last_notification",
        notificationKey
    );
    } catch (error) { console.warn("Notificações indisponíveis:", error); }

}


/* Verifica a cada 30 minutos */

setInterval(
    checkNotifications,
    30 * 60 * 1000
);


/* Verifica ao abrir */

setTimeout(
    checkNotifications,
    3000
);


/* =====================================================
   LIMPAR DADOS
===================================================== */

async function clearAllData() {
    if (taskSaving) return;

    const confirmed =
        await confirmAction(
            "ATENÇÃO!\n\nIsso apagará todas as suas demandas.\n\nDeseja continuar?"
        );


    if (!confirmed) {

        return;

    }


    tasks = [];


    if (!await saveTasks()) return;


    renderAll();


    showToast(
        "Todos os dados foram apagados."
    );

}


/* =====================================================
   TOAST
===================================================== */

function showToast(message) {

    toast.textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        window.toastTimeout
    );


    window.toastTimeout =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            3000
        );

}
