
(() => {
  const db = window.supabase.createClient(
    "https://iehauyofnfshyusjbkvn.supabase.co",
    "sb_publishable_1qmZEoIh-pufPGWwhMl_KA_re4u-eyp"
  );

  const SESSION_KEY = "usuarioLogado";
  const ACTIVE_GAME_PARAM = new URLSearchParams(window.location.search).get("game");

  const GAME_CONFIGS = {
    ultimate: {
      label: "Ultimate Tic Tac Toe",
      description: "Partida modular, com lobby global e abertura direta do jogo quando a partida começa.",
      launchPath: "ultimate.html",
      defaultMaxPlayers: 2,
      maxPlayersOptions: [2]
    },
    chess: {
      label: "Xadrez",
      description: "Lobby 1x1 pronto para receber a futura engine de xadrez.",
      launchPath: "chess.html",
      defaultMaxPlayers: 2,
      maxPlayersOptions: [2]
    },
    checkers: {
      label: "Dama",
      description: "Lobby 1x1 pronto para a futura engine de dama.",
      launchPath: "checkers.html",
      defaultMaxPlayers: 2,
      maxPlayersOptions: [2]
    }
  };

  const GAME_ALIASES = {
    uttt: "ultimate"
  };

  function goto(path) {
    window.location.href = new URL(path, window.location.href).toString();
  }

  function normalizeGameKey(key) {
    const raw = String(key || "").trim().toLowerCase();
    return GAME_ALIASES[raw] || raw || "ultimate";
  }

  function getGameConfig(key) {
    return GAME_CONFIGS[normalizeGameKey(key)] || GAME_CONFIGS.ultimate;
  }

  function getAllowedKeysForQuery(key) {
    const normalized = normalizeGameKey(key);
    if (normalized === "ultimate") return ["ultimate", "uttt"];
    return [normalized];
  }

  function normalizeUser(raw) {
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.id == null || !parsed.nome) return null;

      return {
        id: Number(parsed.id),
        nome: String(parsed.nome),
        avatar_url: parsed.avatar_url ?? null,
        avatar_path: parsed.avatar_path ?? null
      };
    } catch {
      return null;
    }
  }

  function syncUserContext() {
    const raw = localStorage.getItem(SESSION_KEY);

    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);

      if (parsed.id == null || !parsed.nome) {
        return null;
      }

      return {
        id: Number(parsed.id),
        nome: String(parsed.nome),
        avatar_url: parsed.avatar_url ?? null,
        avatar_path: parsed.avatar_path ?? null
      };

    } catch (e) {
      console.error("Erro ao ler usuário:", e);
      return null;
    }
  }

  const userData = syncUserContext();

  if (!userData) {
    goto("../index.html");
    return;
  }

  const USER_ID = Number(userData.id);
  const USER_NAME = userData.nome;
  const USER_AVATAR = userData.avatar_url || null;

  const headerAvatar = document.getElementById("headerAvatar");
  const currentName = document.getElementById("currentName");
  const currentSub = document.getElementById("currentSub");
  const btnBackChat = document.getElementById("btnBackChat");
  const gamesTabs = document.getElementById("gamesTabs");
  const selectedGameTitle = document.getElementById("selectedGameTitle");
  const selectedGameDescription = document.getElementById("selectedGameDescription");
  const selectedGameBadge = document.getElementById("selectedGameBadge");
  const lobbyNameInput = document.getElementById("lobbyName");
  const lobbyMaxPlayersSelect = document.getElementById("lobbyMaxPlayers");
  const btnCreateLobby = document.getElementById("btnCreateLobby");
  const btnRefreshLobbies = document.getElementById("btnRefreshLobbies");
  const gamesStatus = document.getElementById("gamesStatus");
  const lobbyHint = document.getElementById("lobbyHint");
  const lobbyList = document.getElementById("lobbyList");

  let activeGameKey = normalizeGameKey(ACTIVE_GAME_PARAM) || "ultimate";
  if (!GAME_CONFIGS[activeGameKey]) activeGameKey = "ultimate";

  let busy = false;
  let activeLobbyRedirectId = null;

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
    if (url && String(url).trim()) {
      const img = document.createElement("img");
      img.src = String(url).trim();
      img.alt = name || "avatar";
      img.onerror = () => {
        el.textContent = initials(name);
      };
      el.appendChild(img);
    } else {
      el.textContent = initials(name);
    }
  }

  function setStatus(message) {
    gamesStatus.textContent = message || "";
  }

  function setBusy(state) {
    busy = state;
    btnCreateLobby.disabled = state;
    btnRefreshLobbies.disabled = state;
    lobbyNameInput.disabled = state;
    lobbyMaxPlayersSelect.disabled = state;
    gamesTabs.style.pointerEvents = state ? "none" : "";
  }

  function updateUrlGameParam(gameKey) {
    const url = new URL(window.location.href);
    url.searchParams.set("game", gameKey);
    history.replaceState({}, "", url.toString());
  }

  function renderTabs() {
    gamesTabs.innerHTML = "";

    Object.entries(GAME_CONFIGS).forEach(([key, config]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-secondary game-tab" + (key === activeGameKey ? " active" : "");
      btn.textContent = config.label;
      btn.onclick = () => selectGame(key);
      gamesTabs.appendChild(btn);
    });
  }

  function renderSelectedGameInfo() {
    const config = getGameConfig(activeGameKey);
    selectedGameTitle.textContent = config.label;
    selectedGameDescription.textContent = config.description;
    selectedGameBadge.textContent = `${config.defaultMaxPlayers} jogador${config.defaultMaxPlayers > 1 ? "es" : ""}`;
    lobbyHint.textContent = `Lobbys aguardando para ${config.label}.`;
    lobbyNameInput.placeholder = `Ex.: Lobby de ${config.label}`;
    populateMaxPlayersSelect(config);
  }

  function populateMaxPlayersSelect(config) {
    lobbyMaxPlayersSelect.innerHTML = "";

    const values = Array.isArray(config.maxPlayersOptions) && config.maxPlayersOptions.length
      ? config.maxPlayersOptions
      : [config.defaultMaxPlayers || 2];

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value} jogador${value > 1 ? "es" : ""}`;
      lobbyMaxPlayersSelect.appendChild(option);
    });
  }

  function renderEmptyState(message) {
    lobbyList.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    lobbyList.appendChild(empty);
  }

  function renderPlayerChip(player) {
    const chip = document.createElement("div");
    chip.className = "player-chip";

    const miniAvatar = document.createElement("div");
    miniAvatar.className = "mini-avatar";

    if (player.avatar_url && String(player.avatar_url).trim()) {
      const img = document.createElement("img");
      img.src = String(player.avatar_url).trim();
      img.alt = player.nome || "avatar";
      img.onerror = () => {
        miniAvatar.textContent = initials(player.nome);
      };
      miniAvatar.appendChild(img);
    } else {
      miniAvatar.textContent = initials(player.nome);
    }

    const name = document.createElement("span");
    name.textContent = player.nome || "Jogador";

    chip.appendChild(miniAvatar);
    chip.appendChild(name);
    return chip;
  }

  function normalizePlayers(playersField) {
    let src = playersField;

    if (typeof src === "string") {
      try {
        src = JSON.parse(src);
      } catch {
        return [];
      }
    }

    if (!Array.isArray(src)) return [];

    return src
      .map((p) => ({
        ...p,
        user_id: p?.user_id ?? p?.id ?? null,
        nome: p?.nome ?? "",
        avatar_url: p?.avatar_url ?? null
      }))
      .filter((p) => p.user_id != null);
  }

  function getLobbyUrl(lobby) {
    const config = getGameConfig(lobby.game_key);
    const basePath = lobby.launch_path || config.launchPath || "ultimate.html";
    const url = new URL(basePath, window.location.href);
    url.searchParams.set("lobby", lobby.id);
    url.searchParams.set("game", normalizeGameKey(lobby.game_key));
    return url.toString();
  }

  function isMemberOfLobby(lobby) {
    const players = normalizePlayers(lobby.players);
    return players.some((p) => Number(p.user_id) === USER_ID);
  }

  function renderLobbyCard(lobby) {
    const players = normalizePlayers(lobby.players);
    const meInLobby = players.some((p) => Number(p.user_id) === USER_ID);
    const isCreator = Number(lobby.creator_id) === USER_ID;
    const isFull = players.length >= Number(lobby.max_players || 2);

    const card = document.createElement("div");
    card.className = "lobby-card";

    const top = document.createElement("div");
    top.className = "lobby-top";

    const left = document.createElement("div");

    const title = document.createElement("div");
    title.className = "lobby-title";
    title.textContent = lobby.lobby_name || "Lobby sem nome";

    const meta = document.createElement("div");
    meta.className = "lobby-meta";
    meta.textContent = `Criador: ${lobby.creator_name || "Desconhecido"} · ${players.length}/${lobby.max_players} jogador${Number(lobby.max_players) > 1 ? "es" : ""}`;

    left.appendChild(title);
    left.appendChild(meta);

    const badge = document.createElement("div");
    badge.className = "badge " + (lobby.status || "waiting");
    badge.textContent =
      lobby.status === "started" ? "Jogando" :
      lobby.status === "finished" ? "Finalizado" : "Aguardando";

    top.appendChild(left);
    top.appendChild(badge);

    const playersRow = document.createElement("div");
    playersRow.className = "players-row";
    players.forEach((player) => playersRow.appendChild(renderPlayerChip(player)));

    const actions = document.createElement("div");
    actions.className = "lobby-actions";

    if (!meInLobby) {
      const joinButton = document.createElement("button");
      joinButton.type = "button";
      joinButton.className = "btn-primary";
      joinButton.textContent = isFull ? "Lobby cheio" : "Entrar";
      joinButton.disabled = isFull || lobby.status !== "waiting";
      joinButton.onclick = () => joinLobby(lobby.id);
      actions.appendChild(joinButton);
    } else {
      const leaveButton = document.createElement("button");
      leaveButton.type = "button";
      leaveButton.className = "btn-secondary";
      leaveButton.textContent = "Sair do lobby";
      leaveButton.onclick = () => leaveLobby(lobby.id);
      actions.appendChild(leaveButton);
    }

    if (isCreator && lobby.status === "waiting") {
      const startButton = document.createElement("button");
      startButton.type = "button";
      startButton.className = "btn-primary";
      startButton.textContent = "Iniciar partida";
      startButton.disabled = !isFull;
      startButton.onclick = () => startLobby(lobby.id);
      actions.appendChild(startButton);
    }

    if (lobby.status === "started" && meInLobby) {
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "btn-primary";
      openButton.textContent = "Abrir partida";
      openButton.onclick = () => goto(getLobbyUrl(lobby));
      actions.appendChild(openButton);
    }

    card.appendChild(top);
    card.appendChild(playersRow);
    card.appendChild(actions);
    return card;
  }

  function renderLobbyList(lobbies) {
    lobbyList.innerHTML = "";

    if (!lobbies.length) {
      renderEmptyState(`Nenhum lobby aguardando em ${getGameConfig(activeGameKey).label} no momento.`);
      return;
    }

    lobbies.forEach((lobby) => lobbyList.appendChild(renderLobbyCard(lobby)));
  }

  async function redirectIfUserHasActiveLobby() {
    const { data, error } = await db
      .from("lobbies")
      .select("*")
      .eq("status", "started")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(error);
      return false;
    }

    const active = (data || []).find((row) => isMemberOfLobby(row));

    if (active && activeLobbyRedirectId !== Number(active.id)) {
      activeLobbyRedirectId = Number(active.id);
      goto(getLobbyUrl(active));
      return true;
    }

    return false;
  }

  async function loadLobbies() {
    const config = getGameConfig(activeGameKey);
    setStatus(`Carregando lobbys de ${config.label}...`);

    if (await redirectIfUserHasActiveLobby()) {
      return;
    }

    const allowedKeys = getAllowedKeysForQuery(activeGameKey);

    const { data, error } = await db
      .from("lobbies")
      .select("*")
      .in("game_key", allowedKeys)
      .eq("status", "waiting")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setStatus("Erro ao carregar lobbys: " + error.message);
      renderEmptyState("Erro ao carregar lobbys.");
      return;
    }

    const lobbies = Array.isArray(data) ? data : [];
    renderLobbyList(lobbies);

    if (!lobbies.length) {
      setStatus(`Nenhum lobby aguardando em ${config.label}.`);
    } else {
      setStatus(`${lobbies.length} lobby(s) aguardando em ${config.label}.`);
    }
  }

  async function selectGame(gameKey) {
    activeGameKey = normalizeGameKey(gameKey);
    if (!GAME_CONFIGS[activeGameKey]) activeGameKey = "ultimate";
    renderTabs();
    renderSelectedGameInfo();
    updateUrlGameParam(activeGameKey);
    await loadLobbies();
  }

  btnBackChat.onclick = () => {
    goto("../chat.html");
  };

  btnRefreshLobbies.onclick = async () => {
    if (busy) return;
    await loadLobbies();
  };

  btnCreateLobby.onclick = async () => {
    if (busy) return;

    const config = getGameConfig(activeGameKey);
    const lobbyName = lobbyNameInput.value.trim() || `${config.label} de ${USER_NAME}`;
    const maxPlayers = Number(lobbyMaxPlayersSelect.value || config.defaultMaxPlayers || 2);

    setBusy(true);
    setStatus("Criando lobby...");

    try {
      const { error } = await db.rpc("create_lobby", {
        p_game_type: activeGameKey,
        p_lobby_name: lobbyName,
        p_host_id: USER_ID,
        p_host_name: USER_NAME,
        p_host_avatar: USER_AVATAR,
        p_data: {}
      });

      if (error) {
        setStatus("Erro ao criar lobby: " + error.message);
        return;
      }

      lobbyNameInput.value = "";
      setStatus("Lobby criado com sucesso.");
      await loadLobbies();
    } catch (err) {
      setStatus("Erro ao criar lobby: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };
  
  async function joinLobby(lobbyId) {
    if (busy) return;

    setBusy(true);
    setStatus("Entrando no lobby...");

    try {
      const { data: lobby, error } = await db
        .from("lobbies")
        .select("*")
        .eq("id", lobbyId)
        .maybeSingle();

      if (error || !lobby) {
        setStatus("Lobby não encontrado.");
        return;
      }

      console.log("PLAYERS RAW:", lobby.players);
      console.log("PLAYERS NORMALIZED:", normalizePlayers(lobby.players));

      if (lobby.status !== "waiting") {
        setStatus("Este lobby já começou.");
        await loadLobbies();
        return;
      }

      const players = normalizePlayers(lobby.players);
      if (players.some((p) => Number(p.user_id) === USER_ID)) {
        setStatus("Você já está neste lobby.");
        await loadLobbies();
        return;
      }

      if (players.length >= Number(lobby.max_players || 2)) {
        setStatus("Este lobby está cheio.");
        await loadLobbies();
        return;
      }

      const { error: rpcError } = await db.rpc("join_lobby", {
        p_lobby_id: lobbyId,
        p_guest_id: USER_ID,
        p_guest_name: USER_NAME,
        p_guest_avatar: USER_AVATAR
      });

      if (rpcError) {
        setStatus("Erro ao entrar no lobby: " + rpcError.message);
        return;
      }

      setStatus("Você entrou no lobby.");
      await loadLobbies();
    } catch (err) {
      setStatus("Erro ao entrar no lobby: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function leaveLobby(lobbyId) {
    if (busy) return;

    setBusy(true);
    setStatus("Saindo do lobby...");

    try {
      const { error: rpcError } = await db.rpc("leave_lobby", {
        p_lobby_id: lobbyId,
        p_user_id: USER_ID
      });

      if (rpcError) {
        setStatus("Erro ao sair do lobby: " + rpcError.message);
        return;
      }

      setStatus("Você saiu do lobby.");
      await loadLobbies();
    } catch (err) {
      setStatus("Erro ao sair do lobby: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function startLobby(lobbyId) {
    if (busy) return;

    setBusy(true);
    setStatus("Iniciando partida...");

    try {
      const { data: lobby, error } = await db
        .from("lobbies")
        .select("*")
        .eq("id", lobbyId)
        .maybeSingle();

      if (error || !lobby) {
        setStatus("Lobby não encontrado.");
        return;
      }

      if (Number(lobby.creator_id) !== USER_ID) {
        setStatus("Somente o criador pode iniciar a partida.");
        return;
      }

      const players = normalizePlayers(lobby.players);
      if (players.length < Number(lobby.max_players || 2)) {
        setStatus("O lobby ainda não está cheio.");
        return;
      }

      const { error: rpcError } = await db.rpc("start_lobby", {
        p_lobby_id: lobbyId,
        p_user_id: USER_ID
      });

      if (rpcError) {
        setStatus("Erro ao iniciar a partida: " + rpcError.message);
        return;
      }

      goto(getLobbyUrl(lobby));
    } catch (err) {
      setStatus("Erro ao iniciar a partida: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  function handleRealtimeChange(payload) {
    const row = payload.new || payload.old;
    if (!row) return;

    const rowGameKey = normalizeGameKey(row.game_key);
    const activeKey = normalizeGameKey(activeGameKey);

    if (rowGameKey !== activeKey && row.status === "waiting") return;

    if (payload.eventType === "UPDATE" && row.status === "started") {
      const players = normalizePlayers(row.players);
      const isMember = players.some((p) => Number(p.user_id) === USER_ID);

      if (isMember && activeLobbyRedirectId !== Number(row.id)) {
        activeLobbyRedirectId = Number(row.id);
        goto(getLobbyUrl(row));
        return;
      }
    }

    loadLobbies();
  }

  function subscribeToLobbies() {
    db.channel("lobbies-global")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "lobbies"
      }, handleRealtimeChange)
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });
  }

  function init() {
    currentName.textContent = USER_NAME;
    currentSub.textContent = "Conectado · Jogos";
    setAvatar(headerAvatar, USER_NAME, USER_AVATAR);

    renderTabs();
    renderSelectedGameInfo();
    setBusy(false);
    loadLobbies();
    subscribeToLobbies();
  }

  init();
})();