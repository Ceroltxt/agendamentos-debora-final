const SCHOOL_STORAGE_KEY = "etec_escola_ativa";
const USER_SCHOOLS_KEY = "etec_usuario_escolas";
const USER_PROFILE_KEY = "etec_usuario_perfil";

const DEFAULT_SCHOOL_CATALOG = [
  {
    id: "furlan",
    name: "ETEC Antônio Furlan",
    code: "ETEC-AF2026-8392",
    aliases: ["ETEC-AF2026-8392", "ETEC-AB12CD", "AF2026-8392"],
    city: "Barueri - SP",
    description: "Sistema de agendamento de espaços"
  }
];

function getSchoolBuildingSVG() {
  return `
    <svg viewBox="0 0 80 70" fill="none" xmlns="http://www.w3.org/2000/svg" class="school-building-svg">
      <line x1="40" y1="2" x2="40" y2="18" stroke="#15131c" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M40 3L54 7L40 12Z" fill="#f43f5e" stroke="#15131c" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="40,16 64,30 16,30" fill="#f43f5e" stroke="#15131c" stroke-width="2.5" stroke-linejoin="round"/>
      <rect x="22" y="30" width="36" height="34" rx="2" fill="#e0e7ff" stroke="#15131c" stroke-width="2.5"/>
      <rect x="6" y="34" width="16" height="30" rx="2" fill="#3b82f6" stroke="#15131c" stroke-width="2.5"/>
      <rect x="10" y="42" width="8" height="12" rx="1.5" fill="#fef08a" stroke="#15131c" stroke-width="2"/>
      <line x1="14" y1="42" x2="14" y2="54" stroke="#15131c" stroke-width="1.5"/>
      <rect x="58" y="34" width="16" height="30" rx="2" fill="#3b82f6" stroke="#15131c" stroke-width="2.5"/>
      <rect x="62" y="42" width="8" height="12" rx="1.5" fill="#fef08a" stroke="#15131c" stroke-width="2"/>
      <line x1="66" y1="42" x2="66" y2="54" stroke="#15131c" stroke-width="1.5"/>
      <circle cx="40" cy="38" r="5" fill="#ffffff" stroke="#15131c" stroke-width="2"/>
      <line x1="40" y1="35.5" x2="40" y2="38" stroke="#15131c" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="40" y1="38" x2="42.5" y2="38" stroke="#15131c" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M34 64V51C34 47.7 36.7 45 40 45C43.3 45 46 47.7 46 51V64H34Z" fill="#fb7185" stroke="#15131c" stroke-width="2.2"/>
    </svg>
  `;
}

function getUser() {
  try {
    const raw = sessionStorage.getItem(USER_PROFILE_KEY) || localStorage.getItem(USER_PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { name: "Docente", role: "Docente CPS", email: "" };
}

function getUserSchoolsLocal() {
  const user = getUser();
  const userKey = user && user.userId ? `etec_escolas_${user.userId}` : USER_SCHOOLS_KEY;
  try {
    const raw = localStorage.getItem(userKey);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (e) {}
  if (user && (user.userId === "user_dimitri" || user.userId === "user_anacarol")) {
    return [DEFAULT_SCHOOL_CATALOG[0]];
  }
  return [];
}

function saveUserSchools(list) {
  const user = getUser();
  const userKey = user && user.userId ? `etec_escolas_${user.userId}` : USER_SCHOOLS_KEY;
  try {
    localStorage.setItem(userKey, JSON.stringify(list));
    localStorage.setItem(USER_SCHOOLS_KEY, JSON.stringify(list));
  } catch (e) {}
}

function selectSchoolAndEnter(school) {
  if (!school || !school.id) return;
  try {
    sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(school));
    localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(school));
  } catch (e) {}
  window.location.href = "app.html";
}

function renderUserSchools(schoolsList) {
  const container = document.getElementById("user-schools-container");
  if (!container) return;
  const schools = Array.isArray(schoolsList) ? schoolsList : getUserSchoolsLocal();
  container.innerHTML = "";
  if (schools.length === 0) {
    container.innerHTML = `
      <div class="no-schools-box">
        <p><strong>Nenhuma escola vinculada no momento.</strong></p>
        <p style="font-size: 12px; color: #433f4e; margin-top: 5px;">
          Digite o código de acesso fornecido pela secretaria da sua escola no campo abaixo para liberar o sistema.
        </p>
      </div>
    `;
    return;
  }
  schools.forEach((school) => {
    const row = document.createElement("div");
    row.className = "school-item-row";
    row.innerHTML = `
      <div class="school-item-left">
        <div class="school-icon-wrapper">
          ${getSchoolBuildingSVG()}
        </div>
        <div class="school-info-col">
          <span class="school-name">${school.name}</span>
          <span class="school-desc">${school.description || "Sistema de agendamento de espaços"}</span>
        </div>
      </div>
      <button type="button" class="btn-enter-school" data-school-id="${school.id}">
        <span>Entrar na escola</span>
        <span>→</span>
      </button>
    `;
    const enterBtn = row.querySelector(".btn-enter-school");
    enterBtn.addEventListener("click", () => {
      enterBtn.disabled = true;
      enterBtn.innerHTML = `<span>Entrando...</span>`;
      selectSchoolAndEnter(school);
    });
    container.appendChild(row);
  });
}

async function loadSchoolsFromServer() {
  const user = getUser();
  const query = user && user.userId ? `?userId=${encodeURIComponent(user.userId)}` : "";
  try {
    const res = await fetch(`/api/schools${query}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.userSchools) ? data.userSchools : [];
      saveUserSchools(list);
      renderUserSchools(list);
      return;
    }
  } catch (e) {}
  renderUserSchools(getUserSchoolsLocal());
}

async function findAndJoinSchoolByCode(rawCode) {
  if (!rawCode || !rawCode.trim()) {
    alert("Digite o código da escola.");
    return;
  }
  const user = getUser();
  try {
    const res = await fetch("/api/schools/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: rawCode.trim(),
        userId: user && user.userId ? user.userId : null
      })
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { error: "Resposta inválida do servidor. Reinicie o backend com npm start." };
    }
    if (!res.ok) {
      alert(data.error || "Código de escola inválido.");
      return;
    }
    const updatedList = Array.isArray(data.userSchools) && data.userSchools.length > 0
      ? data.userSchools
      : [data.school];
    saveUserSchools(updatedList);
    renderUserSchools(updatedList);
    selectSchoolAndEnter(data.school);
  } catch (err) {
    alert("Erro de conexão ao validar código da escola.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getUser();
  const userNameEl = document.getElementById("top-user-name");
  if (userNameEl && user.name) {
    userNameEl.textContent = user.name;
  }
  renderUserSchools(getUserSchoolsLocal());
  loadSchoolsFromServer();

  const logoutBtn = document.querySelector(".logout-action");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        sessionStorage.removeItem(USER_PROFILE_KEY);
        sessionStorage.removeItem(SCHOOL_STORAGE_KEY);
        localStorage.removeItem(USER_PROFILE_KEY);
        localStorage.removeItem(SCHOOL_STORAGE_KEY);
        localStorage.removeItem("aplika_auth_token");
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (err) {}
      window.location.href = "login.html";
    });
  }

  const searchForm = document.getElementById("search-school-form");
  const codeInput = document.getElementById("school-code-input");
  if (searchForm && codeInput) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      findAndJoinSchoolByCode(codeInput.value);
    });
  }

  const inviteBtn = document.getElementById("btn-invite-access");
  const inviteModal = document.getElementById("invite-modal");
  const cancelInviteBtn = document.getElementById("btn-cancel-invite");
  const confirmInviteBtn = document.getElementById("btn-confirm-invite");
  const inviteCodeInput = document.getElementById("invite-code-input");

  if (inviteBtn && inviteModal) {
    const closeInviteModal = () => {
      inviteModal.classList.remove("active");
      inviteBtn.focus();
    };
    inviteBtn.addEventListener("click", () => {
      inviteModal.classList.add("active");
      if (inviteCodeInput) {
        inviteCodeInput.value = "";
        inviteCodeInput.focus();
      }
    });
    if (cancelInviteBtn) {
      cancelInviteBtn.addEventListener("click", closeInviteModal);
    }
    if (confirmInviteBtn && inviteCodeInput) {
      confirmInviteBtn.addEventListener("click", () => {
        let code = inviteCodeInput.value.trim();
        if (code.includes("/")) {
          const parts = code.split("/");
          code = parts[parts.length - 1];
        }
        if (code) {
          inviteModal.classList.remove("active");
          findAndJoinSchoolByCode(code);
        } else {
          alert("Cole o código ou link de convite.");
        }
      });
    }
    inviteModal.addEventListener("click", (e) => {
      if (e.target === inviteModal) {
        closeInviteModal();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && inviteModal.classList.contains("active")) {
        closeInviteModal();
      }
    });
  }
});
