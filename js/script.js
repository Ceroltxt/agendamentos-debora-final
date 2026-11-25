const AUTH_TOKEN_KEY = "aplika_auth_token";
const USER_PROFILE_KEY = "etec_usuario_perfil";

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    return {
      error: res.status === 404
        ? "Rota da API não encontrada. Reinicie o servidor (Ctrl+C e npm start)."
        : `Resposta inesperada do servidor (${res.status}).`
    };
  }
}

function saveSessionProfile(user, token = "") {
  if (!user) return;
  const p = {
    name: user.name || "Docente",
    role: user.role || "Docente CPS",
    email: user.email || "",
    userId: user.userId || user.id || ""
  };
  try {
    sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(p));
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(p));
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch (e) {
    console.warn("Não foi possível salvar perfil local:", e);
  }
}

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const authForm = document.getElementById("auth-form");
const nameContainer = document.getElementById("name-container");
const nameInput = document.getElementById("register-name");
const roleContainer = document.getElementById("role-container");
const roleInput = document.getElementById("register-role");
const emailInput = document.getElementById("email");
const emailLabel = document.getElementById("email-label");
const passwordInput = document.getElementById("password");
const passwordLabel = document.getElementById("password-label");
const forgotLink = document.getElementById("forgot-link");
const confirmContainer = document.getElementById("confirm-password-container");
const confirmPasswordInput = document.getElementById("confirm-password");
const submitBtn = document.getElementById("submit-btn");
const submitText = document.getElementById("submit-text");
const termsCheckbox = document.getElementById("terms-checkbox");

let currentMode = "login";

function setMode(mode) {
  currentMode = mode;
  if (mode === "login") {
    tabLogin.classList.add("active");
    tabLogin.setAttribute("aria-selected", "true");
    tabRegister.classList.remove("active");
    tabRegister.setAttribute("aria-selected", "false");
    if (nameContainer) nameContainer.style.display = "none";
    if (nameInput) nameInput.removeAttribute("required");
    if (roleContainer) roleContainer.style.display = "none";
    if (roleInput) roleInput.removeAttribute("required");
    emailLabel.textContent = "E-MAIL INSTITUCIONAL";
    emailInput.placeholder = "@professor.cps.sp.gov.br";
    passwordLabel.textContent = "SENHA DO ALUNO / PROFESSOR";
    passwordInput.placeholder = "Senha do aluno/professor";
    forgotLink.style.display = "inline";
    confirmContainer.style.display = "none";
    confirmPasswordInput.removeAttribute("required");
    submitText.textContent = "Entrar";
  } else {
    tabRegister.classList.add("active");
    tabRegister.setAttribute("aria-selected", "true");
    tabLogin.classList.remove("active");
    tabLogin.setAttribute("aria-selected", "false");
    if (nameContainer) nameContainer.style.display = "flex";
    if (nameInput) nameInput.setAttribute("required", "true");
    if (roleContainer) roleContainer.style.display = "flex";
    if (roleInput) roleInput.setAttribute("required", "true");
    emailLabel.textContent = "E-MAIL INSTITUCIONAL";
    emailInput.placeholder = "@aluno/professor.cps.sp.gov.br";
    passwordLabel.textContent = "SENHA";
    passwordInput.placeholder = "Mínimo 6 dígitos";
    forgotLink.style.display = "none";
    confirmContainer.style.display = "flex";
    confirmPasswordInput.setAttribute("required", "true");
    submitText.textContent = "Criar Conta";
  }
}

window.setMode = setMode;
tabLogin.addEventListener("click", () => setMode("login"));
tabRegister.addEventListener("click", () => setMode("register"));

try {
  const urlParams = new URLSearchParams(window.location.search);
  const paramMode = urlParams.get("mode");
  if (paramMode === "register" || paramMode === "cadastro") {
    setMode("register");
  } else if (paramMode === "login" || paramMode === "entrar") {
    setMode("login");
  }
} catch (e) {}

if (forgotLink) {
  forgotLink.addEventListener("click", (e) => {
    e.preventDefault();
    alert("Para contas de demonstração use o Acesso Rápido abaixo ou entre em contato com a coordenação para redefinir sua senha.");
  });
}

document.querySelectorAll(".eye-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const inputId = btn.getAttribute("data-input");
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === "password") {
      input.type = "text";
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-label", "Ocultar senha");
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
    } else {
      input.type = "password";
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Mostrar senha");
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
    }
  });
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!termsCheckbox.checked) {
    alert("Aceite os termos para prosseguir.");
    return;
  }

  if (currentMode === "register") {
    const name = nameInput ? nameInput.value.trim() : "";
    const role = roleInput ? roleInput.value.trim() : "Docente CPS";
    const confirmPassword = confirmPasswordInput.value;

    if (!name) {
      alert("Informe seu nome completo.");
      if (nameInput) nameInput.focus();
      return;
    }
    if (password.length < 6) {
      alert("A senha deve ter no mínimo 6 dígitos.");
      return;
    }
    if (password !== confirmPassword) {
      alert("As senhas não coincidem.");
      return;
    }

    submitBtn.disabled = true;
    submitText.textContent = "Cadastrando...";
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, role })
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        alert(data.error || "Erro ao criar conta.");
        return;
      }
      saveSessionProfile(data.user, data.token);
      window.location.href = "escolas.html";
    } catch (err) {
      alert("Erro de conexão ao cadastrar: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = "Criar Conta";
    }
  } else {
    submitBtn.disabled = true;
    submitText.textContent = "Entrando...";
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        alert(data.error || "E-mail ou senha incorretos.");
        return;
      }
      saveSessionProfile(data.user, data.token);
      window.location.href = "escolas.html";
    } catch (err) {
      alert("Erro de conexão ao entrar: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = "Entrar";
    }
  }
});

async function handleQuickAccess(btn, profileKey) {
  btn.style.pointerEvents = "none";
  btn.style.opacity = "0.7";
  btn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
    <span>Acessando...</span>
  `;
  try {
    const res = await fetch("/api/auth/quick-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileKey })
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.user) {
      saveSessionProfile(data.user, data.token);
      window.location.href = "escolas.html";
      return;
    }
  } catch (err) {}
  // Fallback local se servidor indisponível
  if (profileKey === "anacarol") {
    saveSessionProfile({ name: "Ana Carol", role: "Docente CPS", email: "anacarol.docente@gmail.com", userId: "user_anacarol" });
  } else {
    saveSessionProfile({ name: "Dimitri", role: "Docente CPS", email: "dguerrask@gmail.com", userId: "user_dimitri" });
  }
  window.location.href = "escolas.html";
}

const btnQuickAccess = document.getElementById("btn-quick-access");
if (btnQuickAccess) {
  btnQuickAccess.addEventListener("click", () => handleQuickAccess(btnQuickAccess, "dimitri"));
}

const btnQuickAccessAna = document.getElementById("btn-quick-access-ana");
if (btnQuickAccessAna) {
  btnQuickAccessAna.addEventListener("click", () => handleQuickAccess(btnQuickAccessAna, "anacarol"));
}
