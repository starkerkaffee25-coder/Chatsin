const db = window.supabase.createClient(
  "https://iehauyofnfshyusjbkvn.supabase.co",
  "sb_publishable_1qmZEoIh-pufPGWwhMl_KA_re4u-eyp"
);

const SESSION_KEY = "usuarioLogado";
const IMAGE_BUCKET = "chat-media";
const PAGE_SIZE = 25;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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

async function uploadPublicImage(file, folderPrefix) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    throw new Error("O arquivo selecionado não é uma imagem.");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Imagem maior que 10 MB.");
  }

  const safeId = getSafeId();
  const ext = getExtFromMime(file.type);
  const path = `${folderPrefix}/${Date.now()}-${safeId}.${ext}`;

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
    console.warn("Falha ao remover arquivo:", err);
  }
}

const rawUser = sessionStorage.getItem(SESSION_KEY);
if (!rawUser) {
  window.location.href = "index.html";
}

let userData;
try {
  userData = JSON.parse(rawUser);
} catch {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
}

if (!userData?.id || !userData?.nome) {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
}

let usuarioLogado = userData.nome;
let usuarioLogadoId = userData.id;
let avatarLogado = userData.avatar_url || null;
let avatarPathLogado = userData.avatar_path || null;

const headerAvatar = document.getElementById("headerAvatar");
const currentName = document.getElementById("currentName");
const chat = document.getElementById("chat");
const chatFeed = document.getElementById("chatFeed");
const msgInput = document.getElementById("msg");
const btnEnviar = document.getElementById("btnEnviar");
const btnPickImage = document.getElementById("btnPickImage");
const chatImageFile = document.getElementById("chatImageFile");
const btnLogout = document.getElementById("btnLogout");
const btnProfile = document.getElementById("btnProfile");
const profileModal = document.getElementById("profileModal");
const profileModalBackdrop = document.getElementById("profileModalBackdrop");
const btnCloseProfile = document.getElementById("btnCloseProfile");
const profileAvatarPreview = document.getElementById("profileAvatarPreview");
const profileAvatarUrlInput = document.getElementById("profileAvatarUrl");
const profileAvatarFileInput = document.getElementById("profileAvatarFile");
const btnPickProfileAvatar = document.getElementById("btnPickProfileAvatar");
const btnClearProfileAvatar = document.getElementById("btnClearProfileAvatar");
const btnSaveProfileAvatar = document.getElementById("btnSaveProfileAvatar");
const profileCurrentPassword = document.getElementById("profileCurrentPassword");
const profileNewPassword = document.getElementById("profileNewPassword");
const profileConfirmPassword = document.getElementById("profileConfirmPassword");
const btnChangePassword = document.getElementById("btnChangePassword");
const profileStatus = document.getElementById("profileStatus");

currentName.textContent = usuarioLogado;
setAvatar(headerAvatar, usuarioLogado, avatarLogado);

let oldestLoadedId = null;
let loadingOlder = false;
let busy = false;
let profileAvatarFile = null;
let profileAvatarObjectUrl = null;

function setBusy(state) {
  busy = state;
  btnEnviar.disabled = state;
  btnPickImage.disabled = state;
  chatImageFile.disabled = state;
  btnLogout.disabled = state;
  btnProfile.disabled = state;
  btnSaveProfileAvatar.disabled = state;
  btnChangePassword.disabled = state;
  btnPickProfileAvatar.disabled = state;
  btnClearProfileAvatar.disabled = state;
}

function showProfileStatus(msg) {
  profileStatus.textContent = msg || "";
}

function isNearBottom(el) {
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < 60;
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight;
}

function buildMessageNode(row) {
  const li = document.createElement("li");
  li.className = "chat-item";
  li.dataset.messageId = String(row.id);

  const wrap = document.createElement("div");
  wrap.className = "chat-row";

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";

  if (row.avatar_url && row.avatar_url.trim()) {
    const img = document.createElement("img");
    img.src = row.avatar_url.trim();
    img.alt = row.nome || "avatar";
    img.onerror = () => {
      avatar.textContent = initials(row.nome);
    };
    avatar.appendChild(img);
  } else {
    avatar.textContent = initials(row.nome);
  }

  const body = document.createElement("div");
  body.className = "chat-body";

  const nameLine = document.createElement("div");
  const nameSpan = document.createElement("span");
  nameSpan.className = "chat-name";
  nameSpan.textContent = `${row.nome}:`;
  nameLine.appendChild(nameSpan);
  body.appendChild(nameLine);

  const isImage = row.message_kind === "image" || !!row.image_url;

  if (isImage && row.image_url) {
    const image = document.createElement("img");
    image.src = row.image_url;
    image.alt = `${row.nome} enviou uma imagem`;
    image.loading = "lazy";
    image.style.display = "block";
    image.style.maxWidth = "260px";
    image.style.maxHeight = "260px";
    image.style.marginTop = "8px";
    image.style.borderRadius = "14px";
    image.style.border = "1px solid rgba(255,255,255,.08)";

    body.appendChild(image);

    const caption = (row.texto || "").trim();
    if (caption) {
      const captionEl = document.createElement("div");
      captionEl.style.marginTop = "8px";
      captionEl.textContent = caption;
      body.appendChild(captionEl);
    }
  } else {
    const text = document.createElement("div");
    text.style.marginTop = "4px";
    text.textContent = row.texto || "";
    body.appendChild(text);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(body);
  li.appendChild(wrap);

  return li;
}

function removeMessageNode(id) {
  const node = chat.querySelector(`[data-message-id="${id}"]`);
  if (node) node.remove();
}

function clearProfileAvatarSelection() {
  profileAvatarFile = null;
  if (profileAvatarObjectUrl) {
    URL.revokeObjectURL(profileAvatarObjectUrl);
    profileAvatarObjectUrl = null;
  }
  profileAvatarFileInput.value = "";
}

function renderProfileAvatarPreview() {
  const source = profileAvatarObjectUrl
    || profileAvatarUrlInput.value.trim()
    || avatarLogado
    || "";

  setAvatar(profileAvatarPreview, usuarioLogado, source);
}

function setProfileAvatarFile(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    return false;
  }

  clearProfileAvatarSelection();
  profileAvatarFile = file;
  profileAvatarObjectUrl = URL.createObjectURL(file);
  profileAvatarUrlInput.value = "";
  renderProfileAvatarPreview();
  return true;
}

function openProfileModal() {
  showProfileStatus("");
  clearProfileAvatarSelection();

  profileAvatarUrlInput.value = avatarLogado || "";
  profileCurrentPassword.value = "";
  profileNewPassword.value = "";
  profileConfirmPassword.value = "";

  renderProfileAvatarPreview();

  profileModal.classList.remove("hidden");
  profileModal.setAttribute("aria-hidden", "false");
}

function closeProfileModal() {
  clearProfileAvatarSelection();
  profileModal.classList.add("hidden");
  profileModal.setAttribute("aria-hidden", "true");
}

btnLogout.onclick = () => {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
};

btnProfile.onclick = openProfileModal;
btnCloseProfile.onclick = closeProfileModal;
profileModalBackdrop.onclick = closeProfileModal;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !profileModal.classList.contains("hidden")) {
    closeProfileModal();
  }
});

btnPickProfileAvatar.onclick = () => profileAvatarFileInput.click();

btnClearProfileAvatar.onclick = () => {
  clearProfileAvatarSelection();
  profileAvatarUrlInput.value = "";
  renderProfileAvatarPreview();
};

profileAvatarFileInput.addEventListener("change", () => {
  const file = profileAvatarFileInput.files?.[0];
  if (!file) return;
  setProfileAvatarFile(file);
});

profileAvatarUrlInput.addEventListener("input", () => {
  if (profileAvatarUrlInput.value.trim()) {
    clearProfileAvatarSelection();
  }
  renderProfileAvatarPreview();
});

const profilePasteHandler = (e) => {
  const items = Array.from(e.clipboardData?.items || []);
  const imageItem = items.find(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  );

  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (!file) return;

  e.preventDefault();
  setProfileAvatarFile(file);
};

profileAvatarUrlInput.addEventListener("paste", profilePasteHandler);
profileAvatarPreview.addEventListener("paste", profilePasteHandler);
profileAvatarPreview.addEventListener("click", () => profileAvatarFileInput.click());
profileAvatarPreview.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    profileAvatarFileInput.click();
  }
});

function sendTextMessage() {
  if (busy) return;

  const texto = msgInput.value.trim();
  if (!texto) return;

  setBusy(true);

  (async () => {
    try {
      const { error } = await db.from("mensagens").insert({
        usuario_id: usuarioLogadoId,
        nome: usuarioLogado,
        avatar_url: avatarLogado,
        texto,
        message_kind: "text",
        image_url: null,
        image_path: null,
        image_size_bytes: null,
        image_mime: null
      });

      if (error) {
        alert("Erro ao enviar mensagem: " + error.message);
        return;
      }

      msgInput.value = "";
    } finally {
      setBusy(false);
      msgInput.focus();
    }
  })();
}

async function sendImageFile(file) {
  if (busy) return;

  if (!file || !file.type || !file.type.startsWith("image/")) {
    alert("O arquivo selecionado não é uma imagem.");
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    alert("Imagem maior que 10 MB.");
    return;
  }

  setBusy(true);

  try {
    const uploaded = await uploadPublicImage(file, `messages/${usuarioLogadoId}`);

    const { error: insertError } = await db.from("mensagens").insert({
      usuario_id: usuarioLogadoId,
      nome: usuarioLogado,
      avatar_url: avatarLogado,
      texto: "",
      message_kind: "image",
      image_url: uploaded.url,
      image_path: uploaded.path,
      image_size_bytes: file.size,
      image_mime: file.type
    });

    if (insertError) {
      await removeStorageObject(uploaded.path);
      alert("Erro ao registrar imagem: " + insertError.message);
      return;
    }
  } catch (err) {
    alert("Erro ao enviar imagem: " + (err?.message || err));
  } finally {
    setBusy(false);
    msgInput.focus();
    chatImageFile.value = "";
  }
}

async function saveProfileAvatar() {
  if (busy) return;

  showProfileStatus("");
  setBusy(true);

  const oldAvatarPath = avatarPathLogado;
  let newlyUploadedPath = null;

  try {
    let avatar_url = profileAvatarUrlInput.value.trim() || null;
    let avatar_path = null;

    if (profileAvatarFile) {
      const uploaded = await uploadPublicImage(profileAvatarFile, `avatars/${usuarioLogadoId}`);
      avatar_url = uploaded.url || null;
      avatar_path = uploaded.path;
      newlyUploadedPath = uploaded.path;
    }

    const { error } = await db
      .from("usuarios")
      .update({
        avatar_url,
        avatar_path
      })
      .eq("id", usuarioLogadoId);

    if (error) {
      if (newlyUploadedPath) {
        await removeStorageObject(newlyUploadedPath);
      }
      showProfileStatus("Erro ao atualizar foto: " + error.message);
      return;
    }

    avatarLogado = avatar_url;
    avatarPathLogado = avatar_path;

    userData.avatar_url = avatarLogado;
    userData.avatar_path = avatarPathLogado;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(userData));

    if (oldAvatarPath && oldAvatarPath !== avatarPathLogado) {
      await removeStorageObject(oldAvatarPath);
    }

    setAvatar(headerAvatar, usuarioLogado, avatarLogado);
    setAvatar(profileAvatarPreview, usuarioLogado, avatarLogado);

    profileAvatarUrlInput.value = avatarLogado || "";
    showProfileStatus("Foto atualizada com sucesso.");
    clearProfileAvatarSelection();
  } catch (err) {
    if (newlyUploadedPath) {
      await removeStorageObject(newlyUploadedPath);
    }
    showProfileStatus("Erro ao atualizar foto: " + (err?.message || err));
  } finally {
    setBusy(false);
  }
}

async function changePassword() {
  if (busy) return;

  const current = profileCurrentPassword.value.trim();
  const next = profileNewPassword.value.trim();
  const confirm = profileConfirmPassword.value.trim();

  if (!current || !next || !confirm) {
    showProfileStatus("Preencha a senha antiga e a nova senha.");
    return;
  }

  if (next.length > 100) {
    showProfileStatus("A nova senha está muito longa.");
    return;
  }

  if (next !== confirm) {
    showProfileStatus("A nova senha e a confirmação não coincidem.");
    return;
  }

  setBusy(true);

  try {
    const { data, error } = await db
      .from("usuarios")
      .select("senha")
      .eq("id", usuarioLogadoId)
      .maybeSingle();

    if (error || !data) {
      showProfileStatus("Não foi possível validar a senha antiga.");
      return;
    }

    if (data.senha !== current) {
      showProfileStatus("Senha antiga incorreta.");
      return;
    }

    const { error: updateError } = await db
      .from("usuarios")
      .update({ senha: next })
      .eq("id", usuarioLogadoId);

    if (updateError) {
      showProfileStatus("Erro ao alterar senha: " + updateError.message);
      return;
    }

    profileCurrentPassword.value = "";
    profileNewPassword.value = "";
    profileConfirmPassword.value = "";
    showProfileStatus("Senha alterada com sucesso.");
  } catch (err) {
    showProfileStatus("Erro ao alterar senha: " + (err?.message || err));
  } finally {
    setBusy(false);
  }
}

btnSaveProfileAvatar.onclick = saveProfileAvatar;
btnChangePassword.onclick = changePassword;

btnEnviar.onclick = sendTextMessage;

btnPickImage.onclick = () => chatImageFile.click();
chatImageFile.onchange = async () => {
  const file = chatImageFile.files?.[0];
  if (file) {
    await sendImageFile(file);
  }
};

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage();
  }
});

msgInput.addEventListener("paste", async (e) => {
  if (busy) return;

  const items = Array.from(e.clipboardData?.items || []);
  const imageItem = items.find(item => item.kind === "file" && item.type.startsWith("image/"));

  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (!file) return;

  e.preventDefault();
  await sendImageFile(file);
});

chatFeed.addEventListener("dragover", (e) => {
  e.preventDefault();
});

chatFeed.addEventListener("drop", async (e) => {
  e.preventDefault();
  if (busy) return;

  const file = Array.from(e.dataTransfer?.files || []).find(f => f.type.startsWith("image/"));
  if (file) {
    await sendImageFile(file);
  }
});

async function carregarHistoricoInicial() {
  const { data, error } = await db
    .from("mensagens")
    .select("*")
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    console.error(error);
    return;
  }

  chat.innerHTML = "";

  if (!data || data.length === 0) {
    oldestLoadedId = null;
    return;
  }

  const ordered = data.slice().reverse();
  ordered.forEach((row) => {
    chat.appendChild(buildMessageNode(row));
  });

  oldestLoadedId = ordered[0].id;
  scrollToBottom(chatFeed);
}

async function carregarMaisAntigas() {
  if (loadingOlder || oldestLoadedId === null) return;

  loadingOlder = true;

  const previousScrollHeight = chatFeed.scrollHeight;
  const previousScrollTop = chatFeed.scrollTop;

  const { data, error } = await db
    .from("mensagens")
    .select("*")
    .lt("id", oldestLoadedId)
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);

  if (!error && data && data.length > 0) {
    const ordered = data.slice().reverse();

    ordered.forEach((row) => {
      chat.prepend(buildMessageNode(row));
    });

    oldestLoadedId = ordered[0].id;
    chatFeed.scrollTop = chatFeed.scrollHeight - previousScrollHeight + previousScrollTop;
  }

  loadingOlder = false;
}

db.channel("chat")
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "mensagens"
  }, (payload) => {
    const shouldScroll = isNearBottom(chatFeed);
    chat.appendChild(buildMessageNode(payload.new));

    if (shouldScroll) {
      scrollToBottom(chatFeed);
    }
  })
  .on("postgres_changes", {
    event: "DELETE",
    schema: "public",
    table: "mensagens"
  }, async (payload) => {
    if (payload?.old?.id != null) {
      removeMessageNode(payload.old.id);
    }

    if (payload?.old?.image_path) {
      try {
        await db.storage
          .from(IMAGE_BUCKET)
          .remove([payload.old.image_path]);
      } catch (err) {
        console.warn("Erro ao deletar imagem:", err);
      }
    }
  })
  .subscribe((status) => {
    console.log("Realtime status:", status);
  });

chatFeed.addEventListener("scroll", async () => {
  if (chatFeed.scrollTop <= 0) {
    await carregarMaisAntigas();
  }
});

carregarHistoricoInicial();
