const db = window.supabase.createClient(
  "https://iehauyofnfshyusjbkvn.supabase.co",
  "sb_publishable_1qmZEoIh-pufPGWwhMl_KA_re4u-eyp"
);

const SESSION_KEY = "usuarioLogado";
const IMAGE_BUCKET = "chat-media";

function initials(name) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

const usuarioLogado = userData.nome;
const usuarioLogadoId = userData.id;
const avatarLogado = userData.avatar_url || null;

const headerAvatar = document.getElementById("headerAvatar");
const currentName = document.getElementById("currentName");
const chat = document.getElementById("chat");
const chatFeed = document.getElementById("chatFeed");
const msgInput = document.getElementById("msg");
const btnEnviar = document.getElementById("btnEnviar");
const btnLogout = document.getElementById("btnLogout");
const composer = document.querySelector(".composer");

currentName.textContent = usuarioLogado;
setAvatar(headerAvatar, usuarioLogado, avatarLogado);

btnLogout.onclick = () => {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
};

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

let oldestLoadedId = null;
let loadingOlder = false;
let busy = false;
const PAGE_SIZE = 25;

const uploadBtn = document.createElement("button");
uploadBtn.type = "button";
uploadBtn.textContent = "Imagem";
uploadBtn.style.width = "auto";
uploadBtn.style.padding = "14px 16px";
uploadBtn.style.background = "#263143";
uploadBtn.style.color = "#fff";
uploadBtn.style.border = "1px solid #334155";

const hiddenFileInput = document.createElement("input");
hiddenFileInput.type = "file";
hiddenFileInput.accept = "image/*";
hiddenFileInput.style.display = "none";
document.body.appendChild(hiddenFileInput);

composer.style.gridTemplateColumns = "1fr auto auto";
composer.insertBefore(uploadBtn, btnEnviar);

function setBusy(state) {
  busy = state;
  btnEnviar.disabled = state;
  uploadBtn.disabled = state;
}

function getExtFromMime(type) {
  const raw = (type || "").split("/")[1] || "png";
  if (raw === "jpeg") return "jpg";
  if (raw === "svg+xml") return "svg";
  return raw;
}

async function sendTextMessage() {
  if (busy) return;

  const texto = msgInput.value.trim();
  if (!texto) return;

  setBusy(true);
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
}

async function sendImageFile(file) {
  if (busy) return;

  if (!file || !file.type || !file.type.startsWith("image/")) {
    alert("O arquivo selecionado não é uma imagem.");
    return;
  }

  setBusy(true);
  try {
    const safeId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ext = getExtFromMime(file.type);
    const path = `${usuarioLogadoId}/${Date.now()}-${safeId}.${ext}`;

    const { error: uploadError } = await db.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: "3600"
      });

    if (uploadError) {
      alert("Erro ao enviar imagem: " + uploadError.message);
      return;
    }

    const { data: publicData } = db.storage
      .from(IMAGE_BUCKET)
      .getPublicUrl(path);

    const publicUrl = publicData?.publicUrl;

    const { error: insertError } = await db.from("mensagens").insert({
      usuario_id: usuarioLogadoId,
      nome: usuarioLogado,
      avatar_url: avatarLogado,
      texto: "",
      message_kind: "image",
      image_url: publicUrl,
      image_path: path,
      image_size_bytes: file.size,
      image_mime: file.type
    });

    if (insertError) {
      await db.storage.from(IMAGE_BUCKET).remove([path]);
      alert("Erro ao registrar imagem: " + insertError.message);
      return;
    }
  } catch (err) {
    alert("Erro ao enviar imagem: " + (err?.message || err));
  } finally {
    setBusy(false);
    msgInput.focus();
    hiddenFileInput.value = "";
  }
}

uploadBtn.onclick = () => hiddenFileInput.click();

hiddenFileInput.onchange = async () => {
  const file = hiddenFileInput.files?.[0];
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

btnEnviar.onclick = sendTextMessage;

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
  }, (payload) => {
    if (payload?.old?.id != null) {
      removeMessageNode(payload.old.id);
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
