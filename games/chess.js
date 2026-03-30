(() => {
  const db = window.supabase.createClient(
    "https://iehauyofnfshyusjbkvn.supabase.co",
    "sb_publishable_1qmZEoIh-pufPGWwhMl_KA_re4u-eyp"
  );

  const SESSION_KEY = "usuarioLogado";
  const LOBBY_ID_RAW = new URLSearchParams(window.location.search).get("lobby");
  const LOBBY_ID = Number(LOBBY_ID_RAW);
  const SPRITE_URL = "./chess_pieces.png";

  const PIECE_CLASS = {
    K: "king",
    Q: "queen",
    B: "bishop",
    N: "knight",
    R: "rook",
    P: "pawn"
  };

  const VALID_PROMOTIONS = new Set(["Q", "R", "B", "N"]);

  function createInitialChessState() {
    return {
      board: [
        "bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR",
        "bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP",
        null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null,
        "wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP",
        "wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"
      ],
      turn: "w",
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      halfmove: 0,
      fullmove: 1,
      winner: null,
      lastMove: null,
      rematch: { w: false, b: false }
    };
  }

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

  function clone(obj) {
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  function isPiece(value) {
    return typeof value === "string" && /^[wb][PRNBQK]$/.test(value);
  }

  function pieceColor(piece) {
    return piece ? piece[0] : null;
  }

  function pieceType(piece) {
    return piece ? piece[1] : null;
  }

  function opposite(color) {
    return color === "w" ? "b" : "w";
  }

  function indexToRow(index) {
    return Math.floor(index / 8);
  }

  function indexToCol(index) {
    return index % 8;
  }

  function inBounds(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  function indexOf(row, col) {
    return row * 8 + col;
  }

  function kingIndex(state, color) {
    return state.board.findIndex((p) => p === `${color}K`);
  }

  function normalizeCastling(castling) {
    const fallback = { wK: true, wQ: true, bK: true, bQ: true };
    if (!castling || typeof castling !== "object") return fallback;
    return {
      wK: Boolean(castling.wK),
      wQ: Boolean(castling.wQ),
      bK: Boolean(castling.bK),
      bQ: Boolean(castling.bQ)
    };
  }

  function normalizeChessState(raw) {
    let src = raw;

    if (typeof src === "string") {
      try {
        src = JSON.parse(src);
      } catch {
        src = null;
      }
    }

    const fallback = createInitialChessState();
    if (!src || typeof src !== "object") return fallback;

    const board = Array.isArray(src.board) && src.board.length === 64
      ? src.board.map((p) => (isPiece(p) ? p : null))
      : fallback.board;

    const turnRaw = String(src.turn ?? "w").toLowerCase();
    const turn = turnRaw === "b" || turnRaw === "black" || turnRaw === "o" ? "b" : "w";

    const winnerRaw = String(src.winner ?? "").toLowerCase();
    let winner = null;
    if (winnerRaw === "w" || winnerRaw === "white" || winnerRaw === "x") winner = "W";
    else if (winnerRaw === "b" || winnerRaw === "black" || winnerRaw === "o") winner = "B";
    else if (winnerRaw === "d" || winnerRaw === "draw" || winnerRaw === "tie") winner = "D";

    const enPassant =
      Number.isInteger(src.enPassant) && src.enPassant >= 0 && src.enPassant < 64
        ? src.enPassant
        : null;

    const halfmove = Number.isFinite(src.halfmove) ? Number(src.halfmove) : 0;
    const fullmove = Number.isFinite(src.fullmove) && src.fullmove > 0 ? Number(src.fullmove) : 1;

    const lastMove =
      src.lastMove && Number.isInteger(src.lastMove.from) && Number.isInteger(src.lastMove.to)
        ? { from: src.lastMove.from, to: src.lastMove.to }
        : null;

    const rematch = {
      w: Boolean(src.rematch?.w),
      b: Boolean(src.rematch?.b)
    };

    return {
      board,
      turn,
      castling: normalizeCastling(src.castling),
      enPassant,
      halfmove,
      fullmove,
      winner,
      lastMove,
      rematch
    };
  }

  function isValidChessState(raw) {
    const parsed = normalizeChessState(raw);
    return Array.isArray(parsed.board) && parsed.board.length === 64;
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
  const chessBoard = document.getElementById("chessBoard");
  const btnBackGames = document.getElementById("btnBackGames");
  const btnLeaveLobby = document.getElementById("btnLeaveLobby");
  const btnRematch = document.getElementById("btnRematch");
  const btnRefresh = document.getElementById("btnRefresh");

  let lobbyRow = null;
  let chessState = createInitialChessState();
  let myColor = null;
  let whitePlayer = null;
  let blackPlayer = null;
  let busy = false;
  let channel = null;
  let appReady = false;
  let selectedSquare = null;
  let selectedMoves = [];
  let boardSide = 760;

  function syncBoardSizing() {
    boardSide = Math.max(
      320,
      Math.min(
        Math.floor(window.innerWidth * 0.78),
        Math.floor(window.innerHeight * 0.66),
        900
      )
    );
    document.documentElement.style.setProperty("--board-side", `${boardSide}px`);
  }

  function initials(name) {
    const n = (name || "").trim();
    if (!n) return "?";
    const parts = n.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
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

  function isMemberOfLobby(lobby) {
    const players = normalizePlayers(lobby?.players);
    return players.some((p) => Number(p.user_id) === USER_ID);
  }

  function colorLabel(color) {
    return color === "w" ? "Brancas" : "Pretas";
  }

  function pieceSpriteNode(piece) {
    const el = document.createElement("span");
    const colorClass = pieceColor(piece) === "w" ? "white" : "black";
    const typeClass = PIECE_CLASS[pieceType(piece)] || "pawn";
    el.className = `piece-sprite ${colorClass} ${typeClass}`;
    el.style.backgroundImage = `url("${SPRITE_URL}")`;
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function isSquareAttacked(state, squareIndex, byColor) {
    const row = indexToRow(squareIndex);
    const col = indexToCol(squareIndex);
    const board = state.board;

    const pawnRow = byColor === "w" ? row + 1 : row - 1;
    if (inBounds(pawnRow, col - 1) && board[indexOf(pawnRow, col - 1)] === `${byColor}P`) return true;
    if (inBounds(pawnRow, col + 1) && board[indexOf(pawnRow, col + 1)] === `${byColor}P`) return true;

    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of knightOffsets) {
      const r = row + dr;
      const c = col + dc;
      if (inBounds(r, c) && board[indexOf(r, c)] === `${byColor}N`) return true;
    }

    const rayCheck = (dr, dc, pieces) => {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        const piece = board[indexOf(r, c)];
        if (piece) {
          if (pieceColor(piece) === byColor && pieces.includes(pieceType(piece))) return true;
          return false;
        }
        r += dr;
        c += dc;
      }
      return false;
    };

    if (
      rayCheck(-1, -1, ["B", "Q"]) ||
      rayCheck(-1, 1, ["B", "Q"]) ||
      rayCheck(1, -1, ["B", "Q"]) ||
      rayCheck(1, 1, ["B", "Q"]) ||
      rayCheck(-1, 0, ["R", "Q"]) ||
      rayCheck(1, 0, ["R", "Q"]) ||
      rayCheck(0, -1, ["R", "Q"]) ||
      rayCheck(0, 1, ["R", "Q"])
    ) {
      return true;
    }

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (inBounds(r, c) && board[indexOf(r, c)] === `${byColor}K`) return true;
      }
    }

    return false;
  }

  function isInCheck(state, color) {
    const kIndex = kingIndex(state, color);
    if (kIndex === -1) return false;
    return isSquareAttacked(state, kIndex, opposite(color));
  }

  function generatePseudoMoves(state, fromIndex) {
    const board = state.board;
    const piece = board[fromIndex];
    if (!isPiece(piece)) return [];

    const color = pieceColor(piece);
    const type = pieceType(piece);
    const row = indexToRow(fromIndex);
    const col = indexToCol(fromIndex);
    const moves = [];

    const pushMove = (to, extra = {}) => {
      moves.push({ from: fromIndex, to, piece, ...extra });
    };

    if (type === "P") {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const promotionRow = color === "w" ? 0 : 7;

      const oneRow = row + dir;
      if (inBounds(oneRow, col) && !board[indexOf(oneRow, col)]) {
        const to = indexOf(oneRow, col);
        if (oneRow === promotionRow) pushMove(to, { promotionOptions: ["Q", "R", "B", "N"] });
        else pushMove(to);

        const twoRow = row + dir * 2;
        if (row === startRow && inBounds(twoRow, col) && !board[indexOf(twoRow, col)]) {
          pushMove(indexOf(twoRow, col), { doubleStep: true });
        }
      }

      for (const dc of [-1, 1]) {
        const r = row + dir;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const to = indexOf(r, c);
        const target = board[to];

        if (target && pieceColor(target) !== color) {
          if (r === promotionRow) pushMove(to, { capture: true, promotionOptions: ["Q", "R", "B", "N"] });
          else pushMove(to, { capture: true });
        }

        if (state.enPassant === to) {
          pushMove(to, { enPassant: true, capture: true });
        }
      }

      return moves;
    }

    if (type === "N") {
      const offsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];

      for (const [dr, dc] of offsets) {
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const to = indexOf(r, c);
        const target = board[to];
        if (!target || pieceColor(target) !== color) {
          pushMove(to, { capture: Boolean(target && pieceColor(target) !== color) });
        }
      }

      return moves;
    }

    const addRay = (dr, dc) => {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        const to = indexOf(r, c);
        const target = board[to];
        if (!target) {
          pushMove(to);
        } else {
          if (pieceColor(target) !== color) pushMove(to, { capture: true });
          break;
        }
        r += dr;
        c += dc;
      }
    };

    if (type === "B" || type === "Q") {
      addRay(-1, -1);
      addRay(-1, 1);
      addRay(1, -1);
      addRay(1, 1);
    }

    if (type === "R" || type === "Q") {
      addRay(-1, 0);
      addRay(1, 0);
      addRay(0, -1);
      addRay(0, 1);
    }

    if (type === "K") {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const r = row + dr;
          const c = col + dc;
          if (!inBounds(r, c)) continue;
          const to = indexOf(r, c);
          const target = board[to];
          if (!target || pieceColor(target) !== color) {
            pushMove(to, { capture: Boolean(target && pieceColor(target) !== color) });
          }
        }
      }

      const rights = state.castling || createInitialChessState().castling;
      const enemy = opposite(color);

      if (!isInCheck(state, color)) {
        if (color === "w") {
          if (rights.wK && board[61] === null && board[62] === null && board[63] === "wR") {
            if (!isSquareAttacked(state, 61, enemy) && !isSquareAttacked(state, 62, enemy)) {
              pushMove(62, { castle: "K" });
            }
          }

          if (rights.wQ && board[59] === null && board[58] === null && board[57] === null && board[56] === "wR") {
            if (!isSquareAttacked(state, 59, enemy) && !isSquareAttacked(state, 58, enemy)) {
              pushMove(58, { castle: "Q" });
            }
          }
        } else {
          if (rights.bK && board[5] === null && board[6] === null && board[7] === "bR") {
            if (!isSquareAttacked(state, 5, enemy) && !isSquareAttacked(state, 6, enemy)) {
              pushMove(6, { castle: "K" });
            }
          }

          if (rights.bQ && board[3] === null && board[2] === null && board[1] === null && board[0] === "bR") {
            if (!isSquareAttacked(state, 3, enemy) && !isSquareAttacked(state, 2, enemy)) {
              pushMove(2, { castle: "Q" });
            }
          }
        }
      }

      return moves;
    }

    return moves;
  }

  function applyMoveLite(state, move) {
    const next = clone(state);
    const board = next.board;
    const piece = board[move.from];
    const color = pieceColor(piece);
    const type = pieceType(piece);

    const targetBeforeMove = board[move.to];
    let capturedSquare = move.to;

    if (move.enPassant) {
      capturedSquare = move.to + (color === "w" ? 8 : -8);
      board[capturedSquare] = null;
    }

    board[move.from] = null;
    board[move.to] = piece;

    if (type === "P" && move.promotionOptions) {
      const promotion = VALID_PROMOTIONS.has(move.promotion) ? move.promotion : "Q";
      board[move.to] = `${color}${promotion}`;
    }

    if (type === "K") {
      if (color === "w") {
        next.castling.wK = false;
        next.castling.wQ = false;
      } else {
        next.castling.bK = false;
        next.castling.bQ = false;
      }

      if (move.castle === "K") {
        if (color === "w") {
          board[61] = "wR";
          board[63] = null;
        } else {
          board[5] = "bR";
          board[7] = null;
        }
      }

      if (move.castle === "Q") {
        if (color === "w") {
          board[59] = "wR";
          board[56] = null;
        } else {
          board[3] = "bR";
          board[0] = null;
        }
      }
    }

    if (type === "R") {
      if (move.from === 56) next.castling.wQ = false;
      if (move.from === 63) next.castling.wK = false;
      if (move.from === 0) next.castling.bQ = false;
      if (move.from === 7) next.castling.bK = false;
    }

    if (targetBeforeMove && pieceType(targetBeforeMove) === "R") {
      if (move.to === 56) next.castling.wQ = false;
      if (move.to === 63) next.castling.wK = false;
      if (move.to === 0) next.castling.bQ = false;
      if (move.to === 7) next.castling.bK = false;
    }

    if (type === "P" && Math.abs(move.to - move.from) === 16) {
      next.enPassant = move.from + (color === "w" ? -8 : 8);
    } else {
      next.enPassant = null;
    }

    next.turn = opposite(color);
    return next;
  }

  function hasAnyLegalMove(state, color) {
    for (let i = 0; i < 64; i++) {
      const piece = state.board[i];
      if (piece && pieceColor(piece) === color) {
        if (getLegalMovesForSquare(state, i).length) return true;
      }
    }
    return false;
  }

  function applyMove(state, move) {
    const next = applyMoveLite(state, move);
    const moverPiece = state.board[move.from];
    const moverColor = pieceColor(moverPiece);
    const enemyColor = opposite(moverColor);

    const captured = move.enPassant ? true : state.board[move.to] != null;
    const moverType = pieceType(moverPiece);

    next.halfmove = moverType === "P" || captured ? 0 : Number(state.halfmove || 0) + 1;
    next.fullmove = moverColor === "b" ? Number(state.fullmove || 1) + 1 : Number(state.fullmove || 1);
    next.lastMove = { from: move.from, to: move.to };
    next.rematch = { w: false, b: false };
    next.winner = null;

    const enemyInCheck = isInCheck(next, enemyColor);
    const enemyHasMove = hasAnyLegalMove(next, enemyColor);

    if (enemyInCheck && !enemyHasMove) {
      next.winner = moverColor === "w" ? "W" : "B";
    } else if (!enemyInCheck && !enemyHasMove) {
      next.winner = "D";
    }

    return next;
  }

  function getLegalMovesForSquare(state, squareIndex) {
    const piece = state.board[squareIndex];
    if (!isPiece(piece)) return [];

    const color = pieceColor(piece);
    const pseudoMoves = generatePseudoMoves(state, squareIndex);
    const legal = [];

    for (const move of pseudoMoves) {
      const next = applyMoveLite(state, { ...move, promotion: move.promotion || "Q" });
      if (!isInCheck(next, color)) {
        legal.push(move);
      }
    }

    return legal;
  }

  function clearSelection() {
    selectedSquare = null;
    selectedMoves = [];
  }

  function updatePlayersDerived() {
    const players = normalizePlayers(lobbyRow?.players);
    const hostId = Number(lobbyRow?.creator_id);

    whitePlayer = players.find((p) => Number(p.user_id) === hostId) || null;
    blackPlayer = players.find((p) => Number(p.user_id) !== hostId) || null;

    myColor = null;
    if (!lobbyRow || !hasValidSession) return;

    if (Number(USER_ID) === hostId) {
      myColor = "w";
    } else if (players.some((p) => Number(p.user_id) === USER_ID)) {
      myColor = "b";
    }
  }

  async function persistChessState(nextState, silent = false) {
    const cleanState = normalizeChessState(nextState);

    const { error } = await db
      .from("lobbies")
      .update({ game_state: cleanState })
      .eq("id", LOBBY_ID);

    if (error) {
      console.error("Supabase update error:", error);
      throw error;
    }

    chessState = cleanState;
    if (lobbyRow) {
      lobbyRow = { ...lobbyRow, game_state: cleanState };
    }

    if (!silent) {
      renderAll();
    }
  }

  async function ensureChessState() {
    if (!lobbyRow) return;

    if (!isValidChessState(lobbyRow.game_state)) {
      const initial = createInitialChessState();
      chessState = initial;
      try {
        await persistChessState(initial, true);
      } catch (err) {
        console.warn("Falha ao inicializar state de xadrez:", err);
      }
      return;
    }

    chessState = normalizeChessState(lobbyRow.game_state);
  }

  function squareVisualClass(actualIndex) {
    const row = indexToRow(actualIndex);
    const col = indexToCol(actualIndex);
    return (row + col) % 2 === 0 ? "light" : "dark";
  }

  function actualIndexFromView(viewRow, viewCol) {
    const flipped = myColor === "b";
    const row = flipped ? 7 - viewRow : viewRow;
    const col = flipped ? 7 - viewCol : viewCol;
    return indexOf(row, col);
  }

  function selectedMoveForTarget(targetIndex) {
    return selectedMoves.find((m) => m.to === targetIndex) || null;
  }

  function selectSquare(actualIndex) {
    if (!lobbyRow || lobbyRow.status !== "started") return;
    if (chessState.winner) return;
    if (!hasValidSession || !isMemberOfLobby(lobbyRow) || !myColor) return;
    if (chessState.turn !== myColor) return;

    const piece = chessState.board[actualIndex];

    if (selectedSquare === actualIndex) {
      clearSelection();
      renderBoard();
      return;
    }

    if (piece && pieceColor(piece) === myColor) {
      selectedSquare = actualIndex;
      selectedMoves = getLegalMovesForSquare(chessState, actualIndex);
      renderBoard();
      return;
    }

    if (selectedSquare != null) {
      const move = selectedMoveForTarget(actualIndex);
      if (move) makeMove(move);
    }
  }

  function isCellPlayable(actualIndex) {
    if (!lobbyRow) return false;
    if (lobbyRow.status !== "started") return false;
    if (chessState.winner) return false;
    if (!hasValidSession || !isMemberOfLobby(lobbyRow)) return false;
    if (!myColor) return false;
    if (busy) return false;
    if (chessState.turn !== myColor) return false;

    const piece = chessState.board[actualIndex];
    if (piece && pieceColor(piece) === myColor) return true;

    if (selectedSquare != null) {
      return Boolean(selectedMoveForTarget(actualIndex));
    }

    return false;
  }

  function turnLabel() {
    if (!lobbyRow) return "Sincronizando...";
    if (!hasValidSession) return "Sessão inválida.";
    if (!isMemberOfLobby(lobbyRow)) return "Você não faz parte deste lobby.";
    if (lobbyRow.status === "waiting") return "Aguardando o segundo jogador...";
    if (!myColor) return "Você ainda não está associado a este lado.";

    if (chessState.winner) {
      if (chessState.winner === "D") return "A partida terminou empatada.";
      return `A partida terminou. Vencedor: ${chessState.winner === "W" ? "Brancas" : "Pretas"}`;
    }

    const checkText = isInCheck(chessState, chessState.turn)
      ? ` ${colorLabel(chessState.turn)} estão em xeque.`
      : "";

    if (chessState.turn === myColor) {
      return `Sua vez. Você joga de ${colorLabel(myColor)}.${checkText}`;
    }

    return `Vez das ${colorLabel(chessState.turn)}. Você joga de ${colorLabel(myColor)}.${checkText}`;
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

    if (chessState.winner === "W") {
      winnerBadge.className = "badge finished";
      winnerBadge.textContent = "Brancas venceram";
    } else if (chessState.winner === "B") {
      winnerBadge.className = "badge finished";
      winnerBadge.textContent = "Pretas venceram";
    } else if (chessState.winner === "D") {
      winnerBadge.className = "badge finished";
      winnerBadge.textContent = "Empate";
    } else {
      winnerBadge.className = "badge playing";
      winnerBadge.textContent = "Em jogo";
    }
  }

  function renderPlayerCard(side, player, me) {
    const card = document.createElement("div");
    card.className = "player-card";
    if (me) card.classList.add("me");
    if (!player) card.classList.add("waiting");

    const miniAvatar = document.createElement("div");
    miniAvatar.className = "mini-avatar";

    if (player?.avatar_url && String(player.avatar_url).trim()) {
      const img = document.createElement("img");
      img.src = String(player.avatar_url).trim();
      img.alt = player.nome || "avatar";
      img.onerror = () => {
        miniAvatar.textContent = initials(player.nome);
      };
      miniAvatar.appendChild(img);
    } else {
      miniAvatar.textContent = player ? initials(player.nome) : side;
    }

    const meta = document.createElement("div");
    meta.className = "player-meta";

    const name = document.createElement("p");
    name.className = "player-name";
    name.textContent = player ? `${player.nome || "Jogador"} (${side})` : `${side} - aguardando jogador`;

    const role = document.createElement("p");
    role.className = "player-role";
    role.textContent = player
      ? (side === "Brancas" ? "Criador do lobby" : "Segundo jogador")
      : "Aguardando o segundo jogador";

    meta.appendChild(name);
    meta.appendChild(role);

    card.appendChild(miniAvatar);
    card.appendChild(meta);
    return card;
  }

  function renderPlayers() {
    playersList.innerHTML = "";
    playersList.appendChild(renderPlayerCard("Brancas", whitePlayer, myColor === "w"));
    playersList.appendChild(renderPlayerCard("Pretas", blackPlayer, myColor === "b"));
  }

  function renderBoard() {
    chessBoard.innerHTML = "";

    const lastMove = chessState.lastMove;
    const checkSquare = isInCheck(chessState, chessState.turn) ? kingIndex(chessState, chessState.turn) : -1;
    const targetSet = new Map(selectedMoves.map((m) => [m.to, m]));

    for (let viewRow = 0; viewRow < 8; viewRow++) {
      for (let viewCol = 0; viewCol < 8; viewCol++) {
        const actualIndex = actualIndexFromView(viewRow, viewCol);
        const piece = chessState.board[actualIndex];
        const move = targetSet.get(actualIndex) || null;

        const square = document.createElement("button");
        square.type = "button";
        square.className = `square ${squareVisualClass(actualIndex)}`;

        if (selectedSquare === actualIndex) square.classList.add("selected");
        if (lastMove && lastMove.from === actualIndex) square.classList.add("last-from");
        if (lastMove && lastMove.to === actualIndex) square.classList.add("last-to");
        if (actualIndex === checkSquare) square.classList.add("check");

        if (move) {
          if (move.capture || move.enPassant || (piece && pieceColor(piece) !== myColor)) {
            square.classList.add("capture");
          } else {
            square.classList.add("legal");
          }
        }

        if (piece) {
          square.appendChild(pieceSpriteNode(piece));
        }

        square.addEventListener("click", () => {
          if (busy) return;
          if (!hasValidSession || !isMemberOfLobby(lobbyRow)) return;
          if (!isCellPlayable(actualIndex) && !selectedMoveForTarget(actualIndex)) return;
          selectSquare(actualIndex);
        });

        chessBoard.appendChild(square);
      }
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

    const whiteName = whitePlayer?.nome || lobbyRow.creator_name || "Jogador Brancas";
    const blackName = blackPlayer?.nome || "Jogador Pretas";

    if (!hasValidSession) {
      stateLine.textContent = "Sessão inválida.";
    } else if (!isMemberOfLobby(lobbyRow)) {
      stateLine.textContent = "Você não faz parte deste lobby.";
    } else if (lobbyRow.status === "waiting") {
      stateLine.textContent = `Lobby aguardando segundo jogador. Brancas: ${whiteName}.`;
    } else if (lobbyRow.status === "started") {
      const checkText = isInCheck(chessState, chessState.turn)
        ? ` ${colorLabel(chessState.turn)} estão em xeque.`
        : "";
      stateLine.textContent = `Partida ativa entre ${whiteName} (Brancas) e ${blackName} (Pretas).${checkText}`;
    } else {
      stateLine.textContent = `Partida finalizada entre ${whiteName} e ${blackName}.`;
    }

    const rematchW = Boolean(chessState.rematch?.w);
    const rematchB = Boolean(chessState.rematch?.b);

    if (chessState.winner) {
      rematchLine.textContent = `Revanche: Brancas=${rematchW ? "pedido" : "aguardando"} · Pretas=${rematchB ? "pedido" : "aguardando"}`;
    } else {
      rematchLine.textContent = "Revanche disponível após o fim da partida.";
    }

    if (!hasValidSession || !isMemberOfLobby(lobbyRow) || !chessState.winner) {
      btnRematch.disabled = true;
      btnRematch.textContent = "Pedir revanche";
    } else if (myColor === "w") {
      btnRematch.textContent = rematchW ? "Revanche enviada" : "Pedir revanche";
      btnRematch.disabled = busy;
    } else if (myColor === "b") {
      btnRematch.textContent = rematchB ? "Revanche enviada" : "Pedir revanche";
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

    lobbyTitle.textContent = lobbyRow?.lobby_name || "Xadrez";
    lobbySubtitle.textContent = lobbyRow ? `Lobby #${lobbyRow.id} · ${lobbyRow.status}` : "Lobby não carregado";

    if (hasValidSession) {
      currentName.textContent = userData.nome;
      currentSub.textContent = myColor ? `Conectado · ${colorLabel(myColor)}` : "Conectado";
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
    await ensureChessState();
    renderAll();
  }

  function canSubmitMove() {
    if (!appReady) return false;
    if (!lobbyRow) return false;
    if (busy) return false;
    if (lobbyRow.status !== "started") return false;
    if (chessState.winner) return false;
    if (!hasValidSession) return false;
    if (!isMemberOfLobby(lobbyRow)) return false;
    if (!myColor) return false;
    if (chessState.turn !== myColor) return false;
    return true;
  }

  function promptPromotion() {
    const raw = window.prompt("Promover para (Q, R, B, N)", "Q");
    const value = String(raw || "Q").trim().toUpperCase();
    return VALID_PROMOTIONS.has(value) ? value : "Q";
  }

  async function refreshLobbyRow() {
    const { data, error } = await db
      .from("lobbies")
      .select("*")
      .eq("id", LOBBY_ID)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      lobbyRow = data;
      chessState = normalizeChessState(lobbyRow.game_state);
      updatePlayersDerived();
    }

    return lobbyRow;
  }

  async function commitMoveOnServer(localState, move) {
    const { data, error } = await db.rpc("chess_commit_move", {
      p_lobby_id: LOBBY_ID,
      p_user_id: USER_ID,
      p_from: move.from,
      p_to: move.to,
      p_promotion: move.promotion || null,
      p_local_state: localState,
      p_winner: localState.winner || null
    });

    if (error) throw error;
    if (!data || typeof data !== "object") {
      throw new Error("O backend não retornou o lobby atualizado.");
    }

    return data;
  }

  async function makeMove(move) {
    if (!canSubmitMove()) return;

    busy = true;
    setControlsDisabled(true);

    try {
      await refreshLobbyRow();

      const currentState = normalizeChessState(lobbyRow?.game_state);
      chessState = currentState;

      if (currentState.winner || currentState.turn !== myColor) {
        setStatus("O estado da partida mudou. Tente novamente.");
        renderAll();
        return;
      }

      const legalMoves = getLegalMovesForSquare(currentState, move.from);
      const legal = legalMoves.find((m) => m.to === move.to);
      if (!legal) {
        setStatus("Movimento inválido no estado atual do lobby.");
        renderAll();
        return;
      }

      const nextMove = { ...legal };
      if (legal.promotionOptions) {
        nextMove.promotion = promptPromotion();
      }

      const localNextState = applyMove(currentState, nextMove);
      const updatedLobby = await commitMoveOnServer(localNextState, nextMove);

      lobbyRow = updatedLobby;
      chessState = normalizeChessState(updatedLobby.game_state);
      clearSelection();
      renderAll();
      setStatus("");
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
    if (!chessState.winner) return;
    if (!myColor) return;

    busy = true;
    setControlsDisabled(true);

    try {
      const { data, error } = await db.rpc("chess_request_rematch", {
        p_lobby_id: LOBBY_ID,
        p_user_id: USER_ID
      });

      if (error) throw error;
      lobbyRow = data || lobbyRow;
      chessState = normalizeChessState(lobbyRow.game_state);
      renderAll();
      setStatus(chessState.winner ? "Pedido de revanche enviado." : "Nova partida iniciada.");
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

    channel = db.channel(`chess-lobby-${LOBBY_ID}`);

    channel
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "lobbies",
        filter: `id=eq.${LOBBY_ID}`
      }, (payload) => {
        if (!payload?.new) return;

        lobbyRow = payload.new;
        chessState = normalizeChessState(lobbyRow.game_state);

        if (selectedSquare != null) {
          const piece = chessState.board[selectedSquare];
          if (!piece || pieceColor(piece) !== myColor || chessState.turn !== myColor || chessState.winner) {
            clearSelection();
          }
        }

        renderAll();
      })
      .subscribe((status) => {
        console.log("Chess realtime status:", status);
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

  window.addEventListener("resize", syncBoardSizing);
  window.addEventListener("orientationchange", syncBoardSizing);

  function init() {
    appReady = true;
    syncBoardSizing();

    if (!hasValidSession) {
      currentName.textContent = "Sessão inválida";
      currentSub.textContent = "Faça login novamente";
      setAvatar(headerAvatar, "?", null);
      setStatus("Sessão inválida. Faça login novamente.");
      setControlsDisabled(false);
      lobbyTitle.textContent = "Xadrez";
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
      lobbyTitle.textContent = "Xadrez";
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
