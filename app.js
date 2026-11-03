// Task Manager Application Logic with Supabase REST API
let config = {
  supabaseUrl: "",
  supabasePublishableKey: "",
  tableName: "tasks"
};

let editingTaskId = null;
let memoryTasks = []; // Offline/local fallback if Supabase URL not configured

// DOM Elements
const statusMessage = document.getElementById("status-message");
const taskForm = document.getElementById("task-form");
const taskTitleInput = document.getElementById("task-title");
const taskDescInput = document.getElementById("task-description");
const taskSubmitBtn = document.getElementById("task-submit");
const taskListContainer = document.getElementById("task-list");

// Status display helper
function showStatus(message, type = "info") {
  statusMessage.textContent = message;
  statusMessage.className = type;
  statusMessage.style.display = "block";
  if (type === "success") {
    setTimeout(() => {
      if (statusMessage.className === "success") {
        statusMessage.style.display = "none";
      }
    }, 4000);
  }
}

function clearStatus() {
  statusMessage.style.display = "none";
  statusMessage.textContent = "";
}

// Helper to escape HTML and prevent XSS
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Headers for Supabase REST API
function getHeaders() {
  return {
    "apikey": config.supabasePublishableKey,
    "Authorization": `Bearer ${config.supabasePublishableKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };
}

// Check if valid Supabase is configured
function isSupabaseConfigured() {
  return config.supabaseUrl && 
         config.supabaseUrl.startsWith("http") && 
         !config.supabaseUrl.includes("PROJECT_ID") && 
         config.supabasePublishableKey && 
         !config.supabasePublishableKey.includes("YOUR_");
}

// 1. Fetch all tasks (GET /tasks?select=*)
async function loadTasks() {
  clearStatus();
  if (!isSupabaseConfigured()) {
    showStatus("Note: Supabase credentials not yet configured in config.json. Using demonstration local storage.", "info");
    const stored = localStorage.getItem("demo_tasks");
    if (stored) {
      try { memoryTasks = JSON.parse(stored); } catch (e) { memoryTasks = []; }
    } else {
      memoryTasks = [
        { id: 1, title: "Learn Git & GitHub", description: "Practice branching, commits, and pull requests", completed: true },
        { id: 2, title: "Configure Supabase REST API", description: "Create table 'tasks' and setup RLS policies", completed: false }
      ];
      localStorage.setItem("demo_tasks", JSON.stringify(memoryTasks));
    }
    renderTasks(memoryTasks);
    return;
  }

  try {
    const url = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${config.tableName}?select=*&order=id.desc`;
    const response = await fetch(url, {
      method: "GET",
      headers: getHeaders()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const tasks = await response.json();
    renderTasks(tasks);
  } catch (err) {
    console.error("Error loading tasks:", err);
    showStatus(`Failed to load tasks from Supabase: ${err.message}`, "error");
  }
}

// Render tasks into #task-list
function renderTasks(tasks) {
  taskListContainer.innerHTML = "";

  if (!tasks || tasks.length === 0) {
    taskListContainer.innerHTML = `<div class="empty-state">No tasks available. Add your first task using the form above!</div>`;
    return;
  }

  tasks.forEach(task => {
    const item = document.createElement("div");
    item.className = `task-item ${task.completed ? "completed" : ""}`;
    item.setAttribute("data-id", task.id);

    const isDone = Boolean(task.completed);

    item.innerHTML = `
      <div class="task-header-row">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <span class="task-status ${isDone ? "completed" : "incomplete"}">${isDone ? "Completed" : "Incomplete"}</span>
      </div>
      <p class="task-description">${escapeHtml(task.description || "")}</p>
      <div class="task-actions">
        <button type="button" class="toggle-task">${isDone ? "Mark Incomplete" : "Mark Completed"}</button>
        <button type="button" class="edit-task">Edit</button>
        <button type="button" class="delete-task">Delete</button>
      </div>
    `;

    // Event listeners
    item.querySelector(".toggle-task").addEventListener("click", () => toggleTaskCompletion(task));
    item.querySelector(".edit-task").addEventListener("click", () => startEditingTask(task));
    item.querySelector(".delete-task").addEventListener("click", () => deleteTask(task.id));

    taskListContainer.appendChild(item);
  });
}

// 2. Add new task (POST /tasks)
async function createTask(title, description) {
  if (!isSupabaseConfigured()) {
    const newTask = {
      id: Date.now(),
      title: title.trim(),
      description: description.trim(),
      completed: false
    };
    memoryTasks.unshift(newTask);
    localStorage.setItem("demo_tasks", JSON.stringify(memoryTasks));
    renderTasks(memoryTasks);
    showStatus("Task added successfully!", "success");
    resetForm();
    return;
  }

  try {
    const url = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${config.tableName}`;
    const response = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        completed: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    showStatus("Task created successfully in database!", "success");
    resetForm();
    await loadTasks();
  } catch (err) {
    console.error("Error creating task:", err);
    showStatus(`Failed to create task: ${err.message}`, "error");
  }
}

// 3. Edit task (PATCH or PUT /tasks?id=eq.X)
async function updateTask(id, title, description, completed) {
  if (!isSupabaseConfigured()) {
    const idx = memoryTasks.findIndex(t => String(t.id) === String(id));
    if (idx !== -1) {
      memoryTasks[idx].title = title.trim();
      memoryTasks[idx].description = description.trim();
      if (completed !== undefined) memoryTasks[idx].completed = completed;
      localStorage.setItem("demo_tasks", JSON.stringify(memoryTasks));
      renderTasks(memoryTasks);
      showStatus("Task updated successfully!", "success");
    }
    resetForm();
    return;
  }

  try {
    const url = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${config.tableName}?id=eq.${id}`;
    const payload = {
      title: title.trim(),
      description: description.trim()
    };
    if (completed !== undefined) {
      payload.completed = completed;
    }

    const response = await fetch(url, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    showStatus("Task updated successfully!", "success");
    resetForm();
    await loadTasks();
  } catch (err) {
    console.error("Error updating task:", err);
    showStatus(`Failed to update task: ${err.message}`, "error");
  }
}

// 4. Toggle completion status
async function toggleTaskCompletion(task) {
  const newStatus = !task.completed;
  if (!isSupabaseConfigured()) {
    const idx = memoryTasks.findIndex(t => String(t.id) === String(task.id));
    if (idx !== -1) {
      memoryTasks[idx].completed = newStatus;
      localStorage.setItem("demo_tasks", JSON.stringify(memoryTasks));
      renderTasks(memoryTasks);
      showStatus(`Task marked as ${newStatus ? "completed" : "incomplete"}!`, "success");
    }
    return;
  }

  try {
    const url = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${config.tableName}?id=eq.${task.id}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ completed: newStatus })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    showStatus(`Task status updated!`, "success");
    await loadTasks();
  } catch (err) {
    console.error("Error toggling task status:", err);
    showStatus(`Failed to update task status: ${err.message}`, "error");
  }
}

// 5. Delete task (DELETE /tasks?id=eq.X)
async function deleteTask(id) {
  if (!confirm("Are you sure you want to delete this task?")) return;

  if (!isSupabaseConfigured()) {
    memoryTasks = memoryTasks.filter(t => String(t.id) !== String(id));
    localStorage.setItem("demo_tasks", JSON.stringify(memoryTasks));
    renderTasks(memoryTasks);
    showStatus("Task deleted successfully!", "success");
    return;
  }

  try {
    const url = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${config.tableName}?id=eq.${id}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: getHeaders()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    showStatus("Task deleted from database!", "success");
    await loadTasks();
  } catch (err) {
    console.error("Error deleting task:", err);
    showStatus(`Failed to delete task: ${err.message}`, "error");
  }
}

// Start editing task in the form
function startEditingTask(task) {
  editingTaskId = task.id;
  taskTitleInput.value = task.title;
  taskDescInput.value = task.description || "";
  taskSubmitBtn.textContent = "Save Changes";
  
  let cancelBtn = document.getElementById("cancel-edit");
  if (!cancelBtn) {
    cancelBtn = document.createElement("button");
    cancelBtn.id = "cancel-edit";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", resetForm);
    taskSubmitBtn.parentNode.appendChild(cancelBtn);
  }
  cancelBtn.style.display = "inline-flex";
  taskTitleInput.focus();
}

function resetForm() {
  editingTaskId = null;
  taskForm.reset();
  taskSubmitBtn.textContent = "Add Task";
  const cancelBtn = document.getElementById("cancel-edit");
  if (cancelBtn) cancelBtn.style.display = "none";
}

// Form submission handler
taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = taskTitleInput.value;
  const description = taskDescInput.value;

  if (!title.trim()) {
    showStatus("Task title is required.", "error");
    return;
  }

  if (editingTaskId !== null) {
    await updateTask(editingTaskId, title, description);
  } else {
    await createTask(title, description);
  }
});

// Initialize on page load
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("config.json");
    if (res.ok) {
      config = await res.json();
    }
  } catch (e) {
    console.warn("Could not load config.json:", e);
  }
  await loadTasks();
});
