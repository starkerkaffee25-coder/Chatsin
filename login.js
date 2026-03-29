const nomeInput = document.getElementById("nome");
const senhaInput = document.getElementById("senha");
const avatarUrlInput = document.getElementById("avatarUrl");
const avatarFileInput = document.getElementById("avatarFile");
const btnPickAvatar = document.getElementById("btnPickAvatar");
const btnClearAvatar = document.getElementById("btnClearAvatar");
const avatarPreview = document.getElementById("avatarPreview");
const systemFeed = document.getElementById("systemFeed");

const db = window.supabase.createClient(
  "https://iehauyofnfshyusjbkvn.supabase.co",
  "sb_publishable_1qmZEoIh-pufPGWwhMl_KA_re4u-eyp"
);

const SESSION_KEY = "usuarioLogado";
const IMAGE_BUCKET = "chat-media";
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

function syncUserStorage(user) {
  const payload = JSON.stringify(user);
  localStorage.setItem(SESSION_KEY, payload);
  sessionStorage.setItem(SESSION_KEY, payload);
}

function getStoredUser() {
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.id == null || !parsed.nome) return null;
    return parsed;
  } catch {
    return null;
  }
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
    img.onerror = () => {
      el.textContent = initials(name);
    };
    el.appendChild(img);
  } else {
    el.textContent = initials(name);
  }
}

function showSystemMessage(msg) {
  const li = document.createElement("li");
  li.textContent = msg;
  systemFeed.appendChild(li);
  systemFeed.scrollTop = systemFeed.scrollHeight;
}

function getSafeId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getExtFromMime(type) {
  const raw = (type || "").split("/")[1] || "png";
  if (raw === "jpeg") return "jpg";
  if (raw === "svg+xml") return "svg";
  return raw;
}

async function uploadAvatarFile(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    throw new Error("O arquivo selecionado não é uma imagem.");
  }

  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Avatar maior que 10 MB.");
  }

  const safeId = getSafeId();
  const ext = getExtFromMime(file.type);
  const path = `avatars/${Date.now()}-${safeId}.${ext}`;

  const { error: uploadError } = await db.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600"
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicData } = db.storage
    .from(IMAGE_BUCKET)
    .getPublicUrl(path);

  return {
    path,
    url: publicData?.publicUrl || ""
  };
}

async function removeStorageObject(path) {
  if (!path) return;
  try {
    await db.storage.from(IMAGE_BUCKET).remove([path]);
  } catch (err) {
    console.warn("Não foi possível remover arquivo:", err);
  }
}

function setupExclusiveAvatarPicker({
  nameInput,
  urlInput,
  fileInput,
  pickButton,
  clearButton,
  previewEl
}) {
  let selectedFile = null;
  let objectUrl = null;

  function cleanupObjectUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function renderPreview() {
    const name = nameInput.value.trim();

    if (selectedFile && objectUrl) {
      setAvatar(previewEl, name, objectUrl);
      return;
    }

    const url = urlInput.value.trim();
    if (url) {
      setAvatar(previewEl, name, url);
      return;
    }

    setAvatar(previewEl, name, "");
  }

  function clearSelectedFile() {
    selectedFile = null;
    cleanupObjectUrl();
    fileInput.value = "";
  }

  function setFile(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      return false;
    }

    clearSelectedFile();
    selectedFile = file;
    objectUrl = URL.createObjectURL(file);
    urlInput.value = "";
    renderPreview();
    return true;
  }

  function clearAll() {
    clearSelectedFile();
    urlInput.value = "";
    renderPreview();
  }

  pickButton.onclick = () => fileInput.click();
  clearButton.onclick = clearAll;
  previewEl.onclick = () => fileInput.click();

  nameInput.addEventListener("input", renderPreview);

  urlInput.addEventListener("input", () => {
    if (urlInput.value.trim()) {
      clearSelectedFile();
    }
    renderPreview();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    setFile(file);
  });

  const handlePaste = (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    );

    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    event.preventDefault();
    setFile(file);
  };

  urlInput.addEventListener("paste", handlePaste);
  previewEl.addEventListener("paste", handlePaste);

  renderPreview();

  return {
    getSelectedFile: () => selectedFile,
    clearAll,
    renderPreview
  };
}

const avatarPicker = setupExclusiveAvatarPicker({
  nameInput: nomeInput,
  urlInput: avatarUrlInput,
  fileInput: avatarFileInput,
  pickButton: btnPickAvatar,
  clearButton: btnClearAvatar,
  previewEl: avatarPreview
});

const storedUser = getStoredUser();
if (storedUser) {
  nomeInput.value = storedUser.nome || "";
  setAvatar(avatarPreview, storedUser.nome || "", storedUser.avatar_url || "");
}

document.getElementById("btnReg").onclick = async () => {
  const nome = nomeInput.value.trim();
  const senha = senhaInput.value.trim();
  const avatarUrlDigitada = avatarUrlInput.value.trim() || null;

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

  let avatar_url = avatarUrlDigitada;
  let avatar_path = null;

  try {
    const selectedAvatarFile = avatarPicker.getSelectedFile();

    if (selectedAvatarFile) {
      const uploaded = await uploadAvatarFile(selectedAvatarFile);
      avatar_url = uploaded.url || null;
      avatar_path = uploaded.path;
    }

    const { error } = await db.from("usuarios").insert({
      nome,
      senha,
      avatar_url,
      avatar_path
    });

    if (error) {
      if (avatar_path) {
        await removeStorageObject(avatar_path);
      }
      showSystemMessage("Erro ao registrar: " + error.message);
      return;
    }

    showSystemMessage("Registrado com sucesso! Agora faça login.");
  } catch (err) {
    showSystemMessage("Erro ao registrar: " + (err?.message || err));
    if (avatar_path) {
      await removeStorageObject(avatar_path);
    }
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
    .select("id, nome, senha, avatar_url, avatar_path")
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

  const userData = {
    id: Number(data.id),
    nome: data.nome,
    avatar_url: data.avatar_url || null,
    avatar_path: data.avatar_path || null
  };

  syncUserStorage(userData);
  window.location.href = "./chat.html";
};

avatarPreview.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    avatarFileInput.click();
  }
});

avatarPreview.focus?.();
avatarPicker.renderPreview();
