(() => {
  const db = window.supabase.createClient(
    "https://iehauyofnfshyusjbkvn.supabase.co",
    "sb_publishable_1qmZEoIh-pufPGWwhMl_KA_re4u-eyp"
  );

  const SESSION_KEY = "usuarioLogado";
  const LOBBY_ID_RAW = new URLSearchParams(window.location.search).get("lobby");
  const LOBBY_ID = Number(LOBBY_ID_RAW);

  const EMPTY_SMALL = "---------";

  const DEFAULT_STATE = () => ({
    boards: Array(9).fill(EMPTY_SMALL),
    bigBoard: EMPTY_SMALL,
    turn: "X",
    forcedBoard: -1,
    winner: null,
    rematch: { x: false, o: false }
  });

  function normalizeStoredUser(raw) {
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

  function safeParseUser() {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    const user = normalizeStoredUser(raw);
    if (!user) return null;

    const payload = JSON.stringify(user);
    localStorage.setItem(SESSION_KEY, payload);
    sessionStorage.setItem(SESSION_KEY, payload);

    return user;
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

  function normalizeState(stateField) {
    let src = stateField;

    if (typeof src === "string") {
      try {
        src = JSON.parse(src);
      } catch {
        src = null;
      }
    }

    const fallback = DEFAULT_STATE();
    if (!src || typeof src !== "object") return fallback;

    const boards = Array.isArray(src.boards) && src.boards.length === 9
      ? src.boards.map((b) => (typeof b === "string" && b.length === 9 ? b : EMPTY_SMALL))
      : fallback.boards;

    const bigBoard = typeof src.bigBoard === "string" && src.bigBoard.length === 9
      ? src.bigBoard
      : fallback.bigBoard;

    const turn = src.turn === "O" ? "O" : "X";

    const forcedBoard =
      Number.isInteger(src.forcedBoard) && src.forcedBoard >= -1 && src.forcedBoard <= 8
        ? src.forcedBoard
        : -1;

    const winner = src.winner === "X" || src.winner === "O" || src.winner === "D" ? src.winner : null;

    const rematch = {
      x: Boolean(src.rematch?.x),
      o: Boolean(src.rematch?.o)
    };

    return { boards, bigBoard, turn, forcedBoard, winner, rematch };
  }

  const userData = safeParseUser();
  const USER_ID = userData ? Number(userData.id) : NaN;
  const hasValidSession = Boolean(userData && Number.isFinite(USER_ID));

  const headerAvatar = document.getElementById("headerAvatar");
  const currentName = document.getElementById("currentName");
  const currentSub = document.getElementById("currentSub");
  const lobbyTitle = document.getElementById("lobbyTitle");
  const lobbySubtitle = document.getElementById("lobbySubtitle");
  const lobbyBadge = document.getElementById("lobbyBadge");
  const winnerBadge = document.getElementById("winnerBadge");
  const turnInfo = document.getElementById("turnInfo");
  const stateLine = document.getElementById("stateLine");
  const rematchLine = document.getElementById("rematchLine");
  const statusBox = document.getElementById("statusBox");
  const playersList = document.getElementById("playersList");
  const bigBoard = document.getElementById("bigBoard");
  const btnBackGames = document.getElementById("btnBackGames");
  const btnLeaveLobby = document.getElementById("btnLeaveLobby");
  const btnRematch = document.getElementById("btnRematch");
  const btnRefresh = document.getElementById("btnRefresh");

  let lobbyRow = null;
  let gameState = DEFAULT_STATE();
  let mySymbol = null;
  let myPlayer = null;
  let opponentPlayer = null;
  let busy = false;
  let channel = null;
  let appReady = false;

  function syncBoardSizing() {
    const side = Math.max(
      280,
      Math.min(
        Math.floor(window.innerWidth * 0.78),
        Math.floor(window.innerHeight * 0.64),
        880
      )
    );

    document.documentElement.style.setProperty("--board-side", `${side}px`);
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
    statusBox.textContent = message || "";
  }

  function setControlsDisabled(state) {
    btnRefresh.disabled = state;
    btnLeaveLobby.disabled = state;
    btnRematch.disabled = state;
  }

  function currentForcedBoard() {
    const idx = Number.isInteger(gameState.forcedBoard) ? gameState.forcedBoard : -1;
    if (idx < 0 || idx > 8) return -1;
    if (gameState.bigBoard[idx] !== "-") return -1;
    return idx;
  }

  function isBoardLocked(bigIndex) {
    return gameState.bigBoard[bigIndex] !== "-";
  }

  function isMemberOfLobby(lobby) {
    const players = normalizePlayers(lobby?.players);
    return players.some((p) => Number(p.user_id) === USER_ID);
  }

  function updatePlayersDerived() {
    const players = normalizePlayers(lobbyRow?.players);

    myPlayer = players.find((p) => Number(p.user_id) === USER_ID) || null;
    opponentPlayer = players.find((p) => Number(p.user_id) !== USER_ID) || null;

    mySymbol = null;
    if (lobbyRow && Number(lobbyRow.creator_id) === USER_ID) {
      mySymbol = "X";
    } else if (myPlayer) {
      mySymbol = "O";
    }
  }

  function isCellPlayable(bigIndex, smallIndex) {
    if (!lobbyRow) return false;
    if (lobbyRow.status !== "started") return false;
    if (gameState.winner) return false;
    if (!mySymbol || gameState.turn !== mySymbol) return false;

    const forced = currentForcedBoard();
    if (forced !== -1 && forced !== bigIndex) return false;

    if (isBoardLocked(bigIndex)) return false;
    if (gameState.boards[bigIndex][smallIndex] !== "-") return false;

    return true;
  }

  function turnLabel() {
    if (!lobbyRow) return "Sincronizando...";
    if (!hasValidSession) return "Sessão inválida.";
    if (!isMemberOfLobby(lobbyRow)) return "Você não faz parte deste lobby.";
    if (lobbyRow.status === "waiting") return "Aguardando o segundo jogador...";

    if (gameState.winner) {
      if (gameState.winner === "D") return "A partida terminou empatada.";
      return `A partida terminou. Vencedor: ${gameState.winner}`;
    }

    const forced = currentForcedBoard();
    const forcedText = forced === -1 ? "qualquer tabuleiro livre" : `tabuleiro obrigatório ${forced + 1}`;
    const symbolText = `Seu símbolo: ${mySymbol || "?"}`;
    const turnText = gameState.turn === mySymbol ? "Sua vez." : `Vez de ${gameState.turn}.`;

    return `${turnText} ${symbolText} Próxima jogada em ${forcedText}.`;
  }

  function updateBadges() {
    if (!lobbyRow) {
      lobbyBadge.className = "badge waiting";
      lobbyBadge.textContent = "Carregando";
      winnerBadge.className = "badge waiting";
      winnerBadge.textContent = "Carregando";
      return;
    }

    if (lobbyRow.status === "waiting") {
      lobbyBadge.className = "badge waiting";
      lobbyBadge.textContent = "Aguardando";
    } else if (lobbyRow.status === "started") {
      lobbyBadge.className = "badge playing";
      lobbyBadge.textContent = "Jogando";
    } else {
      lobbyBadge.className = "badge finished";
      lobbyBadge.textContent = "Finalizado";
    }

    if (gameState.winner === "X") {
      winnerBadge.className = "badge finished";
      winnerBadge.textContent = "X venceu";
    } else if (gameState.winner === "O") {
      winnerBadge.className = "badge finished";
      winnerBadge.textContent = "O venceu";
    } else if (gameState.winner === "D") {
      winnerBadge.className = "badge finished";
      winnerBadge.textContent = "Empate";
    } else {
      winnerBadge.className = "badge playing";
      winnerBadge.textContent = "Em jogo";
    }
  }

  function renderPlayers() {
    const players = normalizePlayers(lobbyRow?.players);
    playersList.innerHTML = "";

    if (!players.length) {
      const empty = document.createElement("div");
      empty.className = "section-note";
      empty.textContent = "Nenhum jogador carregado.";
      playersList.appendChild(empty);
      return;
    }

    players.forEach((player) => {
      const card = document.createElement("div");
      card.className = "player-card";
      if (Number(player.user_id) === USER_ID) card.classList.add("me");

      const av = document.createElement("div");
      av.className = "mini-avatar";

      if (player.avatar_url && String(player.avatar_url).trim()) {
        const img = document.createElement("img");
        img.src = String(player.avatar_url).trim();
        img.alt = player.nome || "avatar";
        img.onerror = () => {
          av.textContent = initials(player.nome);
        };
        av.appendChild(img);
      } else {
        av.textContent = initials(player.nome);
      }

      const meta = document.createElement("div");
      meta.className = "player-meta";

      const name = document.createElement("p");
      name.className = "player-name";
      const role = document.createElement("p");
      role.className = "player-role";

      if (Number(player.user_id) === Number(lobbyRow.creator_id)) {
        name.textContent = `${player.nome || "Jogador"} (X)`;
        role.textContent = "Criador do lobby";
      } else {
        name.textContent = `${player.nome || "Jogador"} (O)`;
        role.textContent = "Segundo jogador";
      }

      meta.appendChild(name);
      meta.appendChild(role);

      card.appendChild(av);
      card.appendChild(meta);
      playersList.appendChild(card);
    });
  }

  function renderBoard() {
    bigBoard.innerHTML = "";

    const forced = currentForcedBoard();

    for (let bigIndex = 0; bigIndex < 9; bigIndex++) {
      const smallState = gameState.boards[bigIndex] || EMPTY_SMALL;
      const boardState = gameState.bigBoard[bigIndex] || "-";
      const active = forced === -1 || forced === bigIndex;
      const boardLocked = boardState !== "-";

      const small = document.createElement("section");
      small.className = "small-board";

      if (
        active &&
        !boardLocked &&
        lobbyRow?.status === "started" &&
        !gameState.winner &&
        hasValidSession &&
        isMemberOfLobby(lobbyRow)
      ) {
        small.classList.add("active");
      }

      if (boardLocked) {
        small.classList.add("finished");
      }

      const head = document.createElement("div");
      head.className = "small-board-head";

      const label = document.createElement("span");
      label.textContent = `Tab. ${bigIndex + 1}`;

      const hint = document.createElement("span");
      if (boardState === "X") hint.textContent = "X ganhou";
      else if (boardState === "O") hint.textContent = "O ganhou";
      else if (boardState === "D") hint.textContent = "Empate";
      else if (forced === bigIndex) hint.textContent = "Obrigatório";
      else hint.textContent = "";

      head.appendChild(label);
      head.appendChild(hint);

      const grid = document.createElement("div");
      grid.className = "cells";

      for (let smallIndex = 0; smallIndex < 9; smallIndex++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";

        const value = smallState[smallIndex] || "-";
        if (value === "X") cell.classList.add("x");
        if (value === "O") cell.classList.add("o");

        cell.textContent = value === "-" ? "" : value;
        cell.disabled = !isCellPlayable(bigIndex, smallIndex);

        cell.addEventListener("click", () => {
          makeMove(bigIndex, smallIndex);
        });

        grid.appendChild(cell);
      }

      const resultOverlay = document.createElement("div");
      resultOverlay.className = "board-result";

      if (boardState === "X") {
        resultOverlay.textContent = "X";
        resultOverlay.classList.add("x");
      } else if (boardState === "O") {
        resultOverlay.textContent = "O";
        resultOverlay.classList.add("o");
      } else if (boardState === "D") {
        resultOverlay.textContent = "D";
        resultOverlay.classList.add("d");
      }

      small.appendChild(head);
      small.appendChild(grid);

      if (boardState !== "-") {
        small.appendChild(resultOverlay);
      }

      bigBoard.appendChild(small);
    }
  }

  function renderStateText() {
    turnInfo.textContent = turnLabel();

    if (!lobbyRow) {
      stateLine.textContent = "Carregando...";
      rematchLine.textContent = "Revanche: aguardando dados.";
      btnRematch.disabled = true;
      return;
    }

    const players = normalizePlayers(lobbyRow.players);
    const host = players.find((p) => Number(p.user_id) === Number(lobbyRow.creator_id)) || null;
    const guest = players.find((p) => Number(p.user_id) !== Number(lobbyRow.creator_id)) || null;

    const hostName = host?.nome || lobbyRow.creator_name || "Jogador X";
    const guestName = guest?.nome || "Jogador O";

    if (!hasValidSession) {
      stateLine.textContent = "Sessão inválida.";
    } else if (!isMemberOfLobby(lobbyRow)) {
      stateLine.textContent = "Você não faz parte deste lobby.";
    } else if (lobbyRow.status === "waiting") {
      stateLine.textContent = `Lobby aguardando segundo jogador. Host: ${hostName}.`;
    } else if (lobbyRow.status === "started") {
      stateLine.textContent = `Partida ativa entre ${hostName} (X) e ${guestName} (O).`;
    } else {
      stateLine.textContent = `Partida finalizada entre ${hostName} e ${guestName}.`;
    }

    const rematchX = Boolean(gameState.rematch?.x);
    const rematchO = Boolean(gameState.rematch?.o);

    if (gameState.winner) {
      rematchLine.textContent = `Revanche: X=${rematchX ? "pedido" : "aguardando"} · O=${rematchO ? "pedido" : "aguardando"}`;
    } else {
      rematchLine.textContent = "Revanche disponível após o fim da partida.";
    }

    if (!hasValidSession || !isMemberOfLobby(lobbyRow) || gameState.winner == null) {
      btnRematch.disabled = true;
      btnRematch.textContent = "Pedir revanche";
    } else if (mySymbol === "X") {
      btnRematch.textContent = rematchX ? "Revanche enviada" : "Pedir revanche";
      btnRematch.disabled = busy;
    } else if (mySymbol === "O") {
      btnRematch.textContent = rematchO ? "Revanche enviada" : "Pedir revanche";
      btnRematch.disabled = busy;
    } else {
      btnRematch.textContent = "Pedir revanche";
      btnRematch.disabled = true;
    }
  }

  function renderAll() {
    updatePlayersDerived();
    updateBadges();
    renderPlayers();
    renderBoard();
    renderStateText();

    lobbyTitle.textContent = lobbyRow?.lobby_name || "Ultimate Tic Tac Toe";
    lobbySubtitle.textContent = lobbyRow ? `Lobby #${lobbyRow.id} · ${lobbyRow.status}` : "Lobby não carregado";

    if (hasValidSession) {
      currentName.textContent = userData.nome;
      currentSub.textContent = mySymbol ? `Conectado · ${mySymbol}` : "Conectado";
      setAvatar(headerAvatar, userData.nome, userData.avatar_url || null);
    } else {
      currentName.textContent = "Sessão inválida";
      currentSub.textContent = "Faça login novamente";
      setAvatar(headerAvatar, "?", null);
    }

    if (!lobbyRow) {
      setStatus("Lobby não carregado.");
      setControlsDisabled(false);
      return;
    }

    if (!hasValidSession) {
      setStatus("Sessão inválida. Faça login novamente.");
      setControlsDisabled(false);
      return;
    }

    if (!isMemberOfLobby(lobbyRow)) {
      setStatus("Você não faz parte deste lobby.");
      setControlsDisabled(false);
      return;
    }

    if (lobbyRow.status === "waiting") {
      setStatus("Aguardando o início do lobby.");
    } else if (lobbyRow.status === "started") {
      setStatus("");
    } else if (lobbyRow.status === "finished") {
      setStatus("Partida encerrada.");
    }

    syncBoardSizing();
  }

  async function loadLobby() {
    const { data, error } = await db
      .from("lobbies")
      .select("*")
      .eq("id", LOBBY_ID)
      .maybeSingle();

    if (error) {
      setStatus("Erro ao carregar lobby: " + error.message);
      lobbyRow = null;
      renderAll();
      return;
    }

    if (!data) {
      setStatus("Lobby não encontrado.");
      lobbyRow = null;
      renderAll();
      return;
    }

    lobbyRow = data;
    gameState = normalizeState(lobbyRow.game_state);
    renderAll();
  }

  function canSubmitMove() {
    if (!appReady) return false;
    if (!lobbyRow) return false;
    if (busy) return false;
    if (lobbyRow.status !== "started") return false;
    if (gameState.winner) return false;
    if (!hasValidSession) return false;
    if (!isMemberOfLobby(lobbyRow)) return false;
    if (!mySymbol) return false;
    return true;
  }

  async function makeMove(bigIndex, smallIndex) {
    if (!canSubmitMove()) return;
    if (!isCellPlayable(bigIndex, smallIndex)) return;

    busy = true;
    setControlsDisabled(true);

    try {
      const { error } = await db.rpc("ultimate_make_move", {
        p_lobby_id: LOBBY_ID,
        p_user_id: USER_ID,
        p_big_index: bigIndex,
        p_small_index: smallIndex
      });

      if (error) {
        setStatus("Erro ao jogar: " + error.message);
        return;
      }

      setStatus("");
      await loadLobby();
    } catch (err) {
      setStatus("Erro ao jogar: " + (err?.message || err));
    } finally {
      busy = false;
      setControlsDisabled(false);
      renderStateText();
    }
  }

  async function requestRematch() {
    if (!lobbyRow || busy) return;
    if (!hasValidSession) return;
    if (!isMemberOfLobby(lobbyRow)) return;
    if (gameState.winner == null) return;
    if (!mySymbol) return;

    busy = true;
    setControlsDisabled(true);

    try {
      const { error } = await db.rpc("ultimate_request_rematch", {
        p_lobby_id: LOBBY_ID,
        p_user_id: USER_ID
      });

      if (error) {
        setStatus("Erro ao pedir revanche: " + error.message);
        return;
      }

      setStatus("Pedido de revanche enviado.");
      await loadLobby();
    } catch (err) {
      setStatus("Erro ao pedir revanche: " + (err?.message || err));
    } finally {
      busy = false;
      setControlsDisabled(false);
      renderStateText();
    }
  }

  async function leaveLobby() {
    if (busy) return;

    busy = true;
    setControlsDisabled(true);

    try {
      const { error } = await db.rpc("leave_lobby", {
        p_lobby_id: LOBBY_ID,
        p_user_id: USER_ID
      });

      if (error) {
        setStatus("Erro ao sair do lobby: " + error.message);
        return;
      }

      window.location.href = new URL("games.html", window.location.href).toString();
    } catch (err) {
      setStatus("Erro ao sair do lobby: " + (err?.message || err));
    } finally {
      busy = false;
      setControlsDisabled(false);
    }
  }

  function subscribeLobby() {
    if (channel) {
      db.removeChannel(channel);
      channel = null;
    }

    channel = db.channel(`lobby-${LOBBY_ID}`);

    channel
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "lobbies",
        filter: `id=eq.${LOBBY_ID}`
      }, (payload) => {
        if (!payload?.new) return;

        lobbyRow = payload.new;
        gameState = normalizeState(lobbyRow.game_state);
        renderAll();
      })
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });
  }

  btnBackGames.onclick = () => {
    window.location.href = new URL("games.html", window.location.href).toString();
  };

  btnLeaveLobby.onclick = leaveLobby;
  btnRematch.onclick = requestRematch;
  btnRefresh.onclick = loadLobby;

  window.addEventListener("beforeunload", () => {
    if (channel) {
      db.removeChannel(channel);
      channel = null;
    }
  });

  window.addEventListener("resize", () => {
    syncBoardSizing();
  });

  window.addEventListener("orientationchange", () => {
    syncBoardSizing();
  });

  function init() {
    appReady = true;
    syncBoardSizing();

    if (!hasValidSession) {
      currentName.textContent = "Sessão inválida";
      currentSub.textContent = "Faça login novamente";
      setAvatar(headerAvatar, "?", null);
      setStatus("Sessão inválida. Faça login novamente.");
      setControlsDisabled(false);
      lobbyTitle.textContent = "Ultimate Tic Tac Toe";
      lobbySubtitle.textContent = "Sessão inválida";
      turnInfo.textContent = "Sessão inválida.";
      stateLine.textContent = "Faça login novamente.";
      rematchLine.textContent = "Revanche indisponível.";
      return;
    }

    currentName.textContent = userData.nome;
    currentSub.textContent = "Conectado";
    setAvatar(headerAvatar, userData.nome, userData.avatar_url || null);

    if (!Number.isFinite(LOBBY_ID) || LOBBY_ID <= 0) {
      setStatus("Lobby inválido.");
      lobbyTitle.textContent = "Ultimate Tic Tac Toe";
      lobbySubtitle.textContent = "Lobby inválido";
      setControlsDisabled(false);
      return;
    }

    loadLobby().then(() => {
      subscribeLobby();
      syncBoardSizing();
    });
  }

  init();
})();