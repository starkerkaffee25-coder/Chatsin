const db = window.supabase.createClient(
  "https://iehauyofnfshyusjbkvn.supabase.co",
  "sb_publishable_1qmZEoIh-pufPGWwhMl_KA_re4u-eyp"
);

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
    img.onerror = () => { el.textContent = initials(name); };
    el.appendChild(img);
  } else {
    el.textContent = initials(name);
  }
}

const rawUser = localStorage.getItem("usuarioLogado");
if (!rawUser) {
  window.location.href = "login.html";
}

let userData;
try {
  userData = JSON.parse(rawUser);
} catch {
  localStorage.removeItem("usuarioLogado");
  window.location.href = "login.html";
}

if (!userData?.id || !userData?.nome) {
  localStorage.removeItem("usuarioLogado");
  window.location.href = "login.html";
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

currentName.textContent = usuarioLogado;
setAvatar(headerAvatar, usuarioLogado, avatarLogado);

btnLogout.onclick = () => {
  localStorage.removeItem("usuarioLogado");
  window.location.href = "login.html";
};

function isNearBottom(el) {
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < 60;
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight;
}

function buildMessageNode(nome, texto, avatar_url) {
  const li = document.createElement("li");
  li.className = "chat-item";

  const row = document.createElement("div");
  row.className = "chat-row";

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";

  if (avatar_url && avatar_url.trim()) {
    const img = document.createElement("img");
    img.src = avatar_url.trim();
    img.alt = nome || "avatar";
    img.onerror = () => { avatar.textContent = initials(nome); };
    avatar.appendChild(img);
  } else {
    avatar.textContent = initials(nome);
  }

  const body = document.createElement("div");
  body.className = "chat-body";
  body.innerHTML = `<span class="chat-name">${escapeHtml(nome)}:</span> ${escapeHtml(texto)}`;

  row.appendChild(avatar);
  row.appendChild(body);
  li.appendChild(row);

  return li;
}

let oldestLoadedId = null;
let loadingOlder = false;
const PAGE_SIZE = 25;

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
  ordered.forEach(m => {
    chat.appendChild(buildMessageNode(m.nome, m.texto, m.avatar_url));
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

    ordered.forEach(m => {
      chat.prepend(buildMessageNode(m.nome, m.texto, m.avatar_url));
    });

    oldestLoadedId = ordered[0].id;
    chatFeed.scrollTop = chatFeed.scrollHeight - previousScrollHeight + previousScrollTop;
  }

  loadingOlder = false;
}

btnEnviar.onclick = async () => {
  const texto = msgInput.value.trim();
  if (!texto) return;

  const { error } = await db.from("mensagens").insert({
    usuario_id: usuarioLogadoId,
    nome: usuarioLogado,
    avatar_url: avatarLogado,
    texto
  });

  if (error) {
    console.error(error);
    return;
  }

  msgInput.value = "";
};

db.channel("chat")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, payload => {
    const shouldScroll = isNearBottom(chatFeed);

    chat.appendChild(
      buildMessageNode(payload.new.nome, payload.new.texto, payload.new.avatar_url)
    );

    if (shouldScroll) {
      scrollToBottom(chatFeed);
    }
  })
  .subscribe(status => {
    console.log("Realtime status:", status);
  });

chatFeed.addEventListener("scroll", async () => {
  if (chatFeed.scrollTop <= 0) {
    await carregarMaisAntigas();
  }
});

carregarHistoricoInicial();
