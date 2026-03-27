const nomeInput = document.getElementById("nome");
const senhaInput = document.getElementById("senha");
const avatarUrlInput = document.getElementById("avatarUrl");
const avatarPreview = document.getElementById("avatarPreview");
const systemFeed = document.getElementById("systemFeed");

const db = window.supabase.createClient(
  "https://iehauyofnfshyusjbkvn.supabase.co",
  "sb_publishable_1qmZEoIh-pufPGWwhMl_KA_re4u-eyp"
);

const SESSION_KEY = "usuarioLogado";

if (sessionStorage.getItem(SESSION_KEY)) {
  sessionStorage.removeItem(SESSION_KEY);
}

function initials(name) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}

function setAvatar(el, name, url) {
  el.innerHTML = "";
  if (url && url.trim()) {
    const img = document.createElement("img");
    img.src = url.trim();
    img.alt = name || "avatar";
    img.onerror = () => { el.textContent = initials(name); };
    el.appendChild(img);
  } else {
    el.textContent = initials(name);
  }
}

function showSystemMessage(msg){
  const li = document.createElement("li");
  li.textContent = msg;
  systemFeed.appendChild(li);
  systemFeed.scrollTop = systemFeed.scrollHeight;
}

avatarUrlInput.addEventListener("input", () =>
  setAvatar(avatarPreview, nomeInput.value.trim(), avatarUrlInput.value)
);

nomeInput.addEventListener("input", () =>
  setAvatar(avatarPreview, nomeInput.value.trim(), avatarUrlInput.value)
);

document.getElementById("btnReg").onclick = async () => {
  const nome = nomeInput.value.trim();
  const senha = senhaInput.value.trim();
  const avatar_url = avatarUrlInput.value.trim() || null;

  if (!nome || !senha) {
    showSystemMessage("Nome e senha são obrigatórios.");
    return;
  }

  if (nome.length > 150) {
    showSystemMessage("Nome muito longo. Máximo de 150 caracteres.");
    return;
  }

  if (senha.length > 100) {
    showSystemMessage("Senha muito longa. Máximo de 100 caracteres.");
    return;
  }

  const { error } = await db.from("usuarios").insert({
    nome,
    senha,
    avatar_url
  });

  if (error) {
    showSystemMessage("Erro ao registrar: " + error.message);
  } else {
    showSystemMessage("Registrado com sucesso! Agora faça login.");
  }
};

document.getElementById("btnLogin").onclick = async () => {
  const nome = nomeInput.value.trim();
  const senha = senhaInput.value.trim();

  if (!nome || !senha) {
    showSystemMessage("Preencha os campos.");
    return;
  }

  const { data, error } = await db
    .from("usuarios")
    .select("id, nome, senha, avatar_url")
    .eq("nome", nome)
    .maybeSingle();

  if (error || !data) {
    showSystemMessage("Login inválido.");
    return;
  }

  if (data.senha !== senha) {
    showSystemMessage("Senha incorreta.");
    return;
  }

  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    id: data.id,
    nome: data.nome,
    avatar_url: data.avatar_url || null
  }));

  window.location.href = "chat.html";
};

setAvatar(avatarPreview, nomeInput.value.trim(), avatarUrlInput.value);
