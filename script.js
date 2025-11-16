/* -------------- CONFIG -------------- */
const MAX_AI_THINK_MS = 1500;          // soft time limit for AI thinking (ms)
const AI_DELAY_MIN = 900, AI_DELAY_MAX = 1800; // realistic delay before AI plays
const PIECE_VALUES = { p:100, n:320, b:330, r:500, q:900, k:20000 };

/* Piece-square tables (white perspective); black is mirrored */
const PST = {
  p: [0,0,0,0,0,0,0,0,5,10,10,-20,-20,10,10,5,5,-5,-10,0,0,-10,-5,5,0,0,0,20,20,0,0,0,5,5,10,25,25,10,5,5,10,10,20,30,30,20,10,10,50,50,50,50,50,50,50,50,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,5,0,0,0,0,5,-10,-10,10,10,10,10,10,10,-10,-10,0,10,10,10,10,0,-10,-10,5,5,10,10,5,5,-10,-10,0,5,10,10,5,0,-10,-10,0,0,0,0,0,0,0,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,5,10,10,5,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,10,10,10,10,10,10,5,0,0,0,0,0,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
};

/* small opening book in UCI style */
const OPENING_BOOK = [
  ["e2e4","e7e5","g1f3","b8c6","f1c4","g8f6"], // Italian
  ["e2e4","e7e5","g1f3","b8c6","f1b5"],       // Ruy Lopez
  ["d2d4","d7d5","c2c4","e7e6"],             // QGD
  ["e2e4","c7c5"],                           // Sicilian
  ["e2e4","c7c6"],                           // Caro-Kann
];

/* -------------- GAME STATE -------------- */
let board = [];               // 8x8 board of {type:'p',color:'w'} or null
let turn = 'w';               // 'w' or 'b'
let enPassant = null;         // e.g. "e6" or null
let castling = { w:{K:true,Q:true}, b:{K:true,Q:true} };
let halfmoveClock = 0, fullmove = 1;
let moveHistory = [];         // {move, san, snapshot}
let selected = null;
let orientation = 'white';
let gameOver = false;
let mode = 'pva';             // 'pvp' or 'pva'
let aiLevel = 'medium';
let enableUndo = true, enableHints = true, enableBook = true;
let theme = 'classic';
let soundsOn = true;

/* clocks */
let whiteTime=0, blackTime=0, timerInterval=null;

/* -------------- DOM refs -------------- */
const boardEl = document.getElementById('board');
const indicatorsEl = document.getElementById('indicators');
const movesListEl = document.getElementById('movesList');
const gameStatusEl = document.getElementById('gameStatus');
const fenEl = document.getElementById('fen');
const whiteClockEl = document.getElementById('whiteClock');
const blackClockEl = document.getElementById('blackClock');

const startModal = document.getElementById('startModal');
const modeSelect = document.getElementById('modeSelect');
const aiLevelSelect = document.getElementById('aiLevel');
const timeControlSelect = document.getElementById('timeControl');
const enableUndoCheck = document.getElementById('enableUndo');
const enableHintsCheck = document.getElementById('enableHints');
const startTheme = document.getElementById('startTheme');
const enableBookCheck = document.getElementById('enableBook');

const startBtn = document.getElementById('startBtn');
const closeBtn = document.getElementById('closeBtn');
const newGameBtn = document.getElementById('newGameBtn');
const undoBtn = document.getElementById('undoBtn');
const restartBtn = document.getElementById('restartBtn');
const flipBtn = document.getElementById('flipBtn');
const themeBtn = document.getElementById('themeBtn');
const hintBtn = document.getElementById('hintBtn');
const soundToggle = document.getElementById('soundToggle');

const promotionOverlay = document.getElementById('promotionOverlay');
const promoBox = document.getElementById('promoBox');

/* sounds */
const sMove = new Audio('move.mp3');
const sCapture = new Audio('capture.mp3');
const sCheck = new Audio('check.mp3');
const sVictory = new Audio('victory.mp3');
function playSound(sound){ if(!soundsOn) return; try{ sound.currentTime = 0; sound.play(); }catch(e){} }

/* -------------- utilities -------------- */
const FILES = ['a','b','c','d','e','f','g','h'];
function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function coordToSquare(r,c){ return FILES[c] + (8 - r); }
function squareToCoord(s){ const file = s[0], rank = parseInt(s[1],10); return [8-rank, FILES.indexOf(file)]; }
function cloneBoard(b){ return b.map(row => row.map(cell => cell ? {...cell} : null)); }
function opposite(c){ return c === 'w' ? 'b' : 'w'; }
function typeName(t){ const m={k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'}; return m[t]; }

/* -------------- initialize position & rendering -------------- */
function createEmptyBoard(){ return Array.from({length:8},()=>Array(8).fill(null)); }

function setupStartPosition(){
  board = createEmptyBoard();
  const back = ['r','n','b','q','k','b','n','r'];
  for(let c=0;c<8;c++){
    board[0][c] = {type: back[c], color:'b'};
    board[1][c] = {type: 'p', color:'b'};
    board[6][c] = {type: 'p', color:'w'};
    board[7][c] = {type: back[c], color:'w'};
  }
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]) board[r][c].type = board[r][c].type.toLowerCase();
  turn='w'; enPassant=null; castling={w:{K:true,Q:true},b:{K:true,Q:true}};
  halfmoveClock=0; fullmove=1; moveHistory=[]; selected=null; gameOver=false;
  updateUI();
}

/* render board */
function renderBoard(){
  boardEl.innerHTML=''; indicatorsEl.innerHTML='';
  const rows = [...Array(8).keys()];
  const rowOrder = orientation === 'white' ? rows : rows.slice().reverse();
  for(const r of rowOrder){
    const colOrder = orientation === 'white' ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
    for(const c of colOrder){
      const sq = document.createElement('div'); sq.className = 'square ' + (((r+c)%2===0)?'light':'dark');
      sq.dataset.r = r; sq.dataset.c = c;
      const file = FILES[c], rank = 8 - r;
      const cf = document.createElement('div'); cf.className='coord-file'; cf.innerText=file; sq.appendChild(cf);
      const cr = document.createElement('div'); cr.className='coord-rank'; cr.innerText=rank; sq.appendChild(cr);
      const p = board[r][c];
      if(p){
        const img = document.createElement('img'); img.className='piece';
        const colorName = p.color==='w'?'white':'black';
        img.src = `${colorName}_${typeName(p.type)}.png`;
        img.alt = p.color + p.type; img.draggable=false;
        sq.appendChild(img);
      }
      sq.addEventListener('click', onSquareClick);
      boardEl.appendChild(sq);
    }
  }
}

/* find square element by coords*/
function findSquareEl(r,c){ return boardEl.querySelector(`.square[data-r="${r}"][data-c="${c}"]`); }

/* -------------- move generation (pseudo-legal) -------------- */
function getPseudoMovesFrom(r,c){
  const p = board[r][c];
  if(!p) return [];
  const color = p.color; const enemy = opposite(color);
  const moves = []; const dir = color==='w' ? -1 : 1;

  if(p.type === 'p'){
    const r1 = r + dir;
    if(inBounds(r1,c) && !board[r1][c]) moves.push({from:[r,c],to:[r1,c],piece:p,captured:null,promotion:isPromotionRow(r1,color)});
    const startRow = color==='w'?6:1;
    const r2 = r + 2*dir;
    if(r===startRow && inBounds(r1,c) && !board[r1][c] && inBounds(r2,c) && !board[r2][c]) moves.push({from:[r,c],to:[r2,c],piece:p,doublePush:true});
    for(const dc of [-1,1]){
      const rr=r+dir, cc=c+dc;
      if(inBounds(rr,cc) && board[rr][cc] && board[rr][cc].color===enemy) moves.push({from:[r,c],to:[rr,cc],piece:p,captured:board[rr][cc],promotion:isPromotionRow(rr,color)});
    }
    if(enPassant){
      const [er,ec] = squareToCoord(enPassant);
      if(er===r+dir && Math.abs(ec-c)===1) moves.push({from:[r,c],to:[er,ec],piece:p,captured:board[r][ec]?board[r][ec]:null,enPassant:true});
    }
  } else if(p.type==='n'){
    const deltas=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for(const d of deltas){
      const rr=r+d[0], cc=c+d[1];
      if(inBounds(rr,cc) && (!board[rr][cc] || board[rr][cc].color===enemy)) moves.push({from:[r,c],to:[rr,cc],piece:p,captured:board[rr][cc]||null});
    }
  } else if(p.type === 'b' || p.type === 'r' || p.type === 'q'){
    const dirs=[];
    if(p.type==='b' || p.type==='q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
    if(p.type==='r' || p.type==='q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    for(const d of dirs){
      let rr=r+d[0], cc=c+d[1];
      while(inBounds(rr,cc)){
        if(!board[rr][cc]) moves.push({from:[r,c],to:[rr,cc],piece:p,captured:null});
        else { if(board[rr][cc].color===enemy) moves.push({from:[r,c],to:[rr,cc],piece:p,captured:board[rr][cc]}); break; }
        rr+=d[0]; cc+=d[1];
      }
    }
  } else if(p.type==='k'){
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      if(dr===0 && dc===0) continue;
      const rr=r+dr, cc=c+dc;
      if(inBounds(rr,cc) && (!board[rr][cc] || board[rr][cc].color===enemy)) moves.push({from:[r,c],to:[rr,cc],piece:p,captured:board[rr][cc]||null});
    }
    // castling basics (full legality checked later)
    if(p.color==='w' && r===7 && c===4){
      if(castling.w.K && !board[7][5] && !board[7][6]) moves.push({from:[7,4],to:[7,6],piece:p,castling:'K'});
      if(castling.w.Q && !board[7][1] && !board[7][2] && !board[7][3]) moves.push({from:[7,4],to:[7,2],piece:p,castling:'Q'});
    }
    if(p.color==='b' && r===0 && c===4){
      if(castling.b.K && !board[0][5] && !board[0][6]) moves.push({from:[0,4],to:[0,6],piece:p,castling:'K'});
      if(castling.b.Q && !board[0][1] && !board[0][2] && !board[0][3]) moves.push({from:[0,4],to:[0,2],piece:p,castling:'Q'});
    }
  }
  return moves;
}
function isPromotionRow(r,color){ return (color==='w' && r===0) || (color==='b' && r===7); }

/* -------------- attack detection & legal filtering -------------- */
function getAttacksFrom(r,c,piece){
  const res=[];
  if(!piece) return res;
  const color = piece.color; const dir = color==='w' ? -1 : 1;
  if(piece.type==='p'){
    for(const dc of [-1,1]){
      const rr=r+dir, cc=c+dc; if(inBounds(rr,cc)) res.push([rr,cc]);
    }
  } else if(piece.type==='n'){
    const deltas=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for(const d of deltas){ const rr=r+d[0], cc=c+d[1]; if(inBounds(rr,cc)) res.push([rr,cc]); }
  } else if(piece.type==='b' || piece.type==='r' || piece.type==='q'){
    const dirs=[]; if(piece.type==='b' || piece.type==='q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]); if(piece.type==='r' || piece.type==='q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    for(const d of dirs){ let rr=r+d[0], cc=c+d[1]; while(inBounds(rr,cc)){ res.push([rr,cc]); if(board[rr][cc]) break; rr+=d[0]; cc+=d[1]; } }
  } else if(piece.type==='k'){ for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ if(dr===0 && dc===0) continue; const rr=r+dr, cc=c+dc; if(inBounds(rr,cc)) res.push([rr,cc]); } }
  return res;
}

function isSquareAttacked(r,c,byColor){
  for(let rr=0; rr<8; rr++){
    for(let cc=0; cc<8; cc++){
      const p = board[rr][cc]; if(!p || p.color !== byColor) continue;
      const attacks = getAttacksFrom(rr,cc,p);
      if(attacks.some(a => a[0]===r && a[1]===c)) return true;
    }
  }
  return false;
}

function findKing(color){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c] && board[r][c].type==='k' && board[r][c].color===color) return [r,c];
  return null;
}

/* generate all legal moves for a color */
function generateLegalMovesForColor(color){
  const moves=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c]; if(!p || p.color!==color) continue;
    const pseudo = getPseudoMovesFrom(r,c);
    for(const m of pseudo) if(isLegalMove(m)) moves.push(m);
  }
  return moves;
}

/* isLegalMove: apply temporarily and ensure own king not in check */
function isLegalMove(m){
  const snapshot = { board: cloneBoard(board), enPassant, castling: JSON.parse(JSON.stringify(castling)), halfmoveClock, fullmove, turn };
  applyMoveToBoard(m);
  const kp = findKing(m.piece.color);
  const inCheck = kp ? isSquareAttacked(kp[0], kp[1], opposite(m.piece.color)) : true;
  // revert
  board = snapshot.board; enPassant = snapshot.enPassant; castling = snapshot.castling; halfmoveClock = snapshot.halfmoveClock; fullmove = snapshot.fullmove; turn = snapshot.turn;
  return !inCheck;
}

/* -------------- apply & revert moves (board-level helpers) -------------- */
/* applyMoveToBoard(m): apply piece-level move (no history push). m has fields from,to,piece,captured,enPassant,doublePush,promotion,promoTo,castling */
function applyMoveToBoard(m){
  const [fr,fc] = m.from, [tr,tc] = m.to;
  const piece = board[fr][fc];
  const target = board[tr][tc] ? {...board[tr][tc]} : null;
  // enPassant capture
  if(m.enPassant){
    const capR = fr, capC = tc;
    board[capR][capC] = null;
  }
  board[tr][tc] = piece ? {...piece} : null;
  board[fr][fc] = null;
  // promotion
  if(m.promotion && m.promoTo) board[tr][tc].type = m.promoTo;
  // castling rook move
  if(m.castling){
    if(m.castling === 'K'){
      if(piece.color==='w'){ board[7][5]=board[7][7]; board[7][7]=null; }
      else { board[0][5]=board[0][7]; board[0][7]=null; }
    } else {
      if(piece.color==='w'){ board[7][3]=board[7][0]; board[7][0]=null; }
      else { board[0][3]=board[0][0]; board[0][0]=null; }
    }
  }
  // castling rights update
  if(piece.type === 'k'){ castling[piece.color].K=false; castling[piece.color].Q=false; }
  if(piece.type === 'r'){
    if(fr===7 && fc===0) castling.w.Q=false;
    if(fr===7 && fc===7) castling.w.K=false;
    if(fr===0 && fc===0) castling.b.Q=false;
    if(fr===0 && fc===7) castling.b.K=false;
  }
  if(target && target.type === 'r'){
    if(tr===7 && tc===0) castling.w.Q=false;
    if(tr===7 && tc===7) castling.w.K=false;
    if(tr===0 && tc===0) castling.b.Q=false;
    if(tr===0 && tc===7) castling.b.K=false;
  }
  // enPassant square set/unset
  if(m.doublePush){
    const epR = (fr+tr)/2, epC = fc;
    enPassant = coordToSquare(epR,epC);
  } else enPassant = null;
  // halfmove/fullmove
  if(piece.type === 'p' || target) halfmoveClock = 0; else halfmoveClock++;
  if(piece.color === 'b') fullmove++;
}

/* -------------- SAN generation (simplified) -------------- */
function toSAN(m){
  const piece = m.piece;
  const toSq = coordToSquare(m.to[0],m.to[1]);
  if(piece.type === 'p'){
    if(m.captured) return `${FILES[m.from[1]]}x${toSq}`;
    if(m.promotion && m.promoTo) return `${toSq}=${m.promoTo.toUpperCase()}`;
    return toSq;
  } else {
    const ch = piece.type.toUpperCase() === 'N' ? 'N' : piece.type.toUpperCase();
    const cap = m.captured ? 'x' : '';
    return `${ch}${cap}${toSq}`;
  }
}

/* -------------- make move & history (UI-level) -------------- */
async function makeMoveAndRecord(m){
  // if promotion required and no promoTo then ask
  const moving = board[m.from[0]][m.from[1]];
  if(m.promotion && !m.promoTo){
    const choice = await showPromotionPicker(moving.color);
    if(!choice) return; m.promoTo = choice;
  }

  // snapshot for undo
  const snapshot = { board: cloneBoard(board), turn, enPassant, castling: JSON.parse(JSON.stringify(castling)), halfmoveClock, fullmove };
  // captured piece for san
  const capturedPiece = board[m.to[0]][m.to[1]] ? {...board[m.to[0]][m.to[1]]} : (m.enPassant ? {...board[m.from[0]][m.to[1]]} : null);
  // apply
  applyMoveToBoard(m);
  const san = toSAN({...m, piece: moving, captured: capturedPiece});
  moveHistory.push({move:m, san, snapshot});
  // switch turn
  turn = opposite(turn);
  // sounds
  if(capturedPiece) playSound(sCapture); else playSound(sMove);
  // UI updates
  updateUI();
  checkGameState();

  // If PvA and now it's AI's turn => ask AI
  if(!gameOver && mode==='pva' && turn==='b'){
    const delay = AI_DELAY_MIN + Math.random()*(AI_DELAY_MAX - AI_DELAY_MIN);
    await new Promise(r => setTimeout(r, delay));
    const aiMove = await computeBestAIMove();
    if(aiMove) await makeMoveAndRecord(aiMove);
  }
}

/* undo */
function undoMove(){
  if(!enableUndo) return;
  if(moveHistory.length === 0) return;
  const last = moveHistory.pop();
  const snap = last.snapshot;
  board = cloneBoard(snap.board); turn = snap.turn; enPassant = snap.enPassant;
  castling = JSON.parse(JSON.stringify(snap.castling)); halfmoveClock = snap.halfmoveClock; fullmove = snap.fullmove;
  gameOver = false;
  updateUI();
}

/* promotion picker */
function showPromotionPicker(color){
  return new Promise(resolve => {
    promotionOverlay.classList.remove('hidden');
    promoBox.innerHTML = '';
    const pieces = ['q','r','b','n'];
    for(const t of pieces){
      const img = document.createElement('img');
      img.src = `${color==='w'?'white':'black'}_${typeName(t)}.png`;
      img.addEventListener('click', ()=>{ promotionOverlay.classList.add('hidden'); resolve(t); });
      promoBox.appendChild(img);
    }
    promotionOverlay.addEventListener('click', (ev)=>{ if(ev.target===promotionOverlay){ promotionOverlay.classList.add('hidden'); resolve(null); } }, {once:true});
  });
}

/* -------------- UI interactions & indicators -------------- */
function onSquareClick(e){
  if(gameOver) return;
  const el = e.currentTarget; const r = parseInt(el.dataset.r,10), c = parseInt(el.dataset.c,10);
  const piece = board[r][c];
  if(selected){
    if(selected.r===r && selected.c===c){ selected=null; clearIndicators(); return; }
    const legal = getLegalMovesFrom(selected.r, selected.c);
    const found = legal.find(m => m.to[0]===r && m.to[1]===c);
    if(found){ makeMoveAndRecord(found); selected=null; clearIndicators(); return; }
    else { if(piece && piece.color===turn){ selected={r,c}; showIndicatorsFor(r,c); } else { /* invalid click */ } }
  } else {
    if(piece && piece.color===turn){ selected={r,c}; showIndicatorsFor(r,c); }
  }
}

function getLegalMovesFrom(r,c){
  const pseudo = getPseudoMovesFrom(r,c);
  const legal = [];
  for(const m of pseudo) if(isMoveLegal(m)) legal.push(m);
  return legal;
}
function isMoveLegal(m){
  const snapshot = { board: cloneBoard(board), turn, enPassant, castling: JSON.parse(JSON.stringify(castling)), halfmoveClock, fullmove };
  applyMoveToBoard(m);
  const kp = findKing(m.piece.color);
  const inCheck = kp ? isSquareAttacked(kp[0], kp[1], opposite(m.piece.color)) : true;
  board = snapshot.board; turn = snapshot.turn; enPassant = snapshot.enPassant; castling = snapshot.castling; halfmoveClock = snapshot.halfmoveClock; fullmove = snapshot.fullmove;
  return !inCheck;
}

function clearIndicators(){ indicatorsEl.innerHTML=''; }
function showIndicatorsFor(r,c){
  clearIndicators();
  const moves = getLegalMovesFrom(r,c);
  for(const m of moves){
    const [tr,tc] = m.to;
    const destEl = findSquareEl(tr,tc);
    if(!destEl) continue;
    const dr = destEl.getBoundingClientRect(), parent = boardEl.getBoundingClientRect();
    const cx = (dr.left + dr.right)/2 - parent.left, cy = (dr.top + dr.bottom)/2 - parent.top;
    const dot = document.createElement('div'); dot.style.left = cx + 'px'; dot.style.top = cy + 'px';
    dot.className = m.captured ? 'capture-dot' : 'move-dot';
    indicatorsEl.appendChild(dot);
  }
}

/* -------------- game state checks & UI updates -------------- */
function checkGameState(){
  const inCheck = isKingInCheck(turn);
  const anyLegal = generateLegalMovesForColor(turn).length > 0;
  if(inCheck && !anyLegal){ gameOver=true; gameStatusEl.innerText = `Checkmate — ${opposite(turn)==='w'?'White':'Black'} wins`; playSound(sVictory); stopClocks(); return; }
  if(!inCheck && !anyLegal){ gameOver=true; gameStatusEl.innerText = `Stalemate — draw`; stopClocks(); return; }
  if(halfmoveClock >= 100){ gameOver=true; gameStatusEl.innerText = `Draw by 50-move rule`; stopClocks(); return; }
  if(inCheck){ gameStatusEl.innerText = `${turn==='w'?'White':'Black'} in check`; playSound(sCheck); } else { gameStatusEl.innerText = `Turn: ${turn==='w'?'White':'Black'}`; }
  updateFEN();
}
function isKingInCheck(color){ const kp = findKing(color); if(!kp) return false; return isSquareAttacked(kp[0], kp[1], opposite(color)); }

/* -------------- UI helpers -------------- */
function updateUI(){ renderBoard(); updateHistory(); updateClocks(); updateStatus(); updateFEN(); }
function updateHistory(){ movesListEl.innerHTML=''; for(let i=0;i<moveHistory.length;i++){ const item=moveHistory[i]; const row=document.createElement('div'); row.className='move-row'; row.innerHTML=`<div>${i+1}.</div><div>${item.san}</div>`; movesListEl.appendChild(row); } }
function updateStatus(){ if(gameOver) return; if(isKingInCheck(turn)) gameStatusEl.innerText = `${turn==='w'?'White':'Black'} in check`; else gameStatusEl.innerText = `Turn: ${turn==='w'?'White':'Black'}`; }
function updateFEN(){ const rows=[]; for(let r=0;r<8;r++){ let empty=0,row=''; for(let c=0;c<8;c++){ const p=board[r][c]; if(!p) empty++; else { if(empty>0){ row+=empty; empty=0;} row += (p.color==='w'?p.type.toUpperCase():p.type.toLowerCase()); } } if(empty>0) row+=empty; rows.push(row); } const fen = `${rows.join('/')} ${turn} ${castlingString()} ${enPassant||'-'} ${halfmoveClock} ${fullmove}`; fenEl.innerText = `FEN: ${fen}`; }
function castlingString(){ let s=''; if(castling.w.K) s+='K'; if(castling.w.Q) s+='Q'; if(castling.b.K) s+='k'; if(castling.b.Q) s+='q'; return s||'-'; }

/* clocks */
function setupClocks(minutes){
  stopClocks();
  if(minutes <= 0){ whiteTime = blackTime = 0; whiteClockEl.innerText=blackClockEl.innerText='--:--'; return; }
  whiteTime = blackTime = minutes*60; whiteClockEl.innerText = formatTime(whiteTime); blackClockEl.innerText = formatTime(blackTime);
  timerInterval = setInterval(() => {
    if(gameOver){ clearInterval(timerInterval); timerInterval=null; return; }
    if(turn==='w'){ whiteTime--; if(whiteTime<0){ onTimeout('white'); } whiteClockEl.innerText=formatTime(whiteTime); } else { blackTime--; if(blackTime<0){ onTimeout('black'); } blackClockEl.innerText=formatTime(blackTime); }
  },1000);
}
function stopClocks(){ if(timerInterval){ clearInterval(timerInterval); timerInterval=null; } }
function formatTime(sec){ if(sec<0) sec=0; const m=Math.floor(sec/60), s=sec%60; return `${m}:${s.toString().padStart(2,'0')}`; }
function updateClocks(){ if(whiteTime) whiteClockEl.innerText=formatTime(whiteTime); if(blackTime) blackClockEl.innerText=formatTime(blackTime); }
function onTimeout(player){ gameOver=true; gameStatusEl.innerText = `${player === 'white' ? 'White' : 'Black'} flag fall — ${player==='white'?'Black':'White'} wins`; playSound(sVictory); stopClocks(); }

/* -------------- AI functions (iterative deepening, alpha-beta, quiescence) -------------- */

/* move ordering heuristic */
function orderMoves(moves){
  return moves.sort((a,b)=>{
    const as = (a.captured ? 1000 + (PIECE_VALUES[a.captured.type]||0) : 0) + (a.promotion?800:0);
    const bs = (b.captured ? 1000 + (PIECE_VALUES[b.captured.type]||0) : 0) + (b.promotion?800:0);
    return bs - as;
  });
}

/* evaluation function: material + PST + mobility (from black's perspective) */
function evaluatePosition(){
  let score = 0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c]; if(!p) continue;
    const val = PIECE_VALUES[p.type]||0;
    const idx = p.color==='w' ? r*8 + c : (7-r)*8 + c;
    const pstVal = (PST[p.type] && PST[p.type][idx]) ? PST[p.type][idx] : 0;
    score += (p.color==='w') ? (val + pstVal) : -(val + pstVal);
  }
  const myMob = generateLegalMovesForColor('b').length;
  const oppMob = generateLegalMovesForColor('w').length;
  score += (myMob - oppMob) * 2;
  return score;
}

/* quiescence search */
function quiescence(alpha, beta, sideToMove, startTime, timeLimit){
  if(performance.now() - startTime > timeLimit) return {score: evaluatePosition(), stopped:true};
  const stand = evaluatePosition();
  if(stand >= beta) return {score: stand, stopped:false};
  if(alpha < stand) alpha = stand;
  // generate captures only
  const captures=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c]; if(!p || p.color !== sideToMove) continue;
    const pseudo = getPseudoMovesFrom(r,c);
    for(const m of pseudo) if(m.captured) captures.push(m);
  }
  orderMoves(captures);
  for(const m of captures){
    const snap = {board: cloneBoard(board), enPassant, castling: JSON.parse(JSON.stringify(castling)), halfmoveClock, fullmove, turn};
    applyMoveToBoard(m); const prevTurn = turn; turn = opposite(turn);
    const res = quiescence(alpha, beta, opposite(sideToMove), startTime, timeLimit);
    board = snap.board; enPassant = snap.enPassant; castling = snap.castling; halfmoveClock = snap.halfmoveClock; fullmove = snap.fullmove; turn = snap.turn;
    if(res.stopped) return {score: res.score, stopped:true};
    const score = res.score;
    if(score >= beta) return {score, stopped:false};
    if(score > alpha) alpha = score;
  }
  return {score: alpha, stopped:false};
}

/* alpha-beta search (returns {score, move, stopped}) */
function alphaBeta(depth, alpha, beta, maximizingPlayer, startTime, timeLimit){
  if(performance.now() - startTime > timeLimit) return {score:0, move:null, stopped:true};
  const side = maximizingPlayer ? 'b' : 'w';
  const legal = generateLegalMovesForColor(side);
  if(depth === 0 || legal.length === 0){
    const q = quiescence(alpha, beta, side, startTime, timeLimit);
    return {score: q.score, move: null, stopped: q.stopped};
  }
  const moves = orderMoves(legal);
  let bestMove = null;
  if(maximizingPlayer){
    let value = -Infinity;
    for(const m of moves){
      const snap = {board: cloneBoard(board), enPassant, castling: JSON.parse(JSON.stringify(castling)), halfmoveClock, fullmove, turn};
      applyMoveToBoard(m); turn = opposite(turn);
      const res = alphaBeta(depth-1, alpha, beta, false, startTime, timeLimit);
      board = snap.board; enPassant = snap.enPassant; castling = snap.castling; halfmoveClock = snap.halfmoveClock; fullmove = snap.fullmove; turn = snap.turn;
      if(res.stopped) return {score: res.score, move: null, stopped:true};
      if(res.score > value){ value = res.score; bestMove = m; }
      alpha = Math.max(alpha, value);
      if(alpha >= beta) break;
    }
    return {score: value, move: bestMove, stopped:false};
  } else {
    let value = Infinity;
    for(const m of moves){
      const snap = {board: cloneBoard(board), enPassant, castling: JSON.parse(JSON.stringify(castling)), halfmoveClock, fullmove, turn};
      applyMoveToBoard(m); turn = opposite(turn);
      const res = alphaBeta(depth-1, alpha, beta, true, startTime, timeLimit);
      board = snap.board; enPassant = snap.enPassant; castling = snap.castling; halfmoveClock = snap.halfmoveClock; fullmove = snap.fullmove; turn = snap.turn;
      if(res.stopped) return {score: res.score, move: null, stopped:true};
      if(res.score < value){ value = res.score; bestMove = m; }
      beta = Math.min(beta, value);
      if(beta <= alpha) break;
    }
    return {score: value, move: bestMove, stopped:false};
  }
}

/* convert move to UCI string */
function moveToUCI(m){ return coordToSquare(m.from[0],m.from[1]) + coordToSquare(m.to[0],m.to[1]); }

/* try opening book for AI (AI plays black) */
function tryBookMove(){
  if(!enableBook) return null;
  const prefix = moveHistory.map(h => moveToUCI(h.move)).join(',');
  for(const line of OPENING_BOOK){
    const lineKey = line.join(',');
    if(lineKey.startsWith(prefix) || prefix === ''){
      const nextIdx = moveHistory.length;
      if(nextIdx < line.length){
        const uci = line[nextIdx];
        const legal = generateLegalMovesForColor('b');
        for(const m of legal) if(moveToUCI(m) === uci) return m;
      }
    }
  }
  return null;
}

/* computeBestAIMove: iterative deepening with fallbacks */
async function computeBestAIMove(){
  // brief thinking delay for realism
  await new Promise(r => setTimeout(r, AI_DELAY_MIN + Math.random()*(AI_DELAY_MAX-AI_DELAY_MIN)));

  const depthMap = { easy:2, medium:4, hard:5 };
  const targetDepth = depthMap[aiLevel] || 3;
  const startTime = performance.now();
  const timeLimit = MAX_AI_THINK_MS || 1500;

  // opening book attempt
  const book = tryBookMove();
  if(book) return book;

  let best = null; let lastGood = null;
  for(let d=1; d<=targetDepth; d++){
    if(performance.now() - startTime > timeLimit) break;
    const res = alphaBeta(d, -Infinity, Infinity, true, startTime, timeLimit);
    if(res.stopped) break;
    if(res.move){ best = res.move; lastGood = best; console.log(`AI depth ${d} -> ${moveToUCI(best)} score ${res.score}`); }
    // yield briefly to keep UI responsive
    await new Promise(r => setTimeout(r, 5));
  }

  // fallback to lastGood
  if(!best && lastGood) best = lastGood;

  // final fallback: random legal move
  if(!best){
    const legal = generateLegalMovesForColor('b');
    if(legal.length) best = legal[Math.floor(Math.random()*legal.length)];
    else { console.warn('AI: no legal moves available (should be handled by game state)'); }
  }

  return best;
}

/* -------------- hints (simple shallow eval) -------------- */
async function showHint(){
  if(!enableHints) return;
  const moves = generateLegalMovesForColor(turn);
  if(moves.length===0) return;
  let best = null; let bestScore = (turn==='w'? -Infinity: Infinity);
  for(const m of moves){
    const snap = { board: cloneBoard(board), enPassant, castling: JSON.parse(JSON.stringify(castling)), halfmoveClock, fullmove, turn };
    applyMoveToBoard(m); turn = opposite(turn);
    const score = evaluatePosition();
    board = snap.board; enPassant = snap.enPassant; castling = snap.castling; halfmoveClock = snap.halfmoveClock; fullmove = snap.fullmove; turn = snap.turn;
    if(turn==='w'){ if(score > bestScore){ bestScore = score; best = m; } } else { if(score < bestScore){ bestScore = score; best = m; } }
  }
  if(best){ clearIndicators(); const [tr,tc]=best.to; const dest=findSquareEl(tr,tc); const dr=dest.getBoundingClientRect(), parent=boardEl.getBoundingClientRect(); const cx=(dr.left+dr.right)/2 - parent.left, cy=(dr.top+dr.bottom)/2 - parent.top; const dot=document.createElement('div'); dot.className='move-dot'; dot.style.left=cx+'px'; dot.style.top=cy+'px'; dot.style.background='rgba(255,165,0,0.9)'; indicatorsEl.appendChild(dot); }
}

/* -------------- UI hooks (start, buttons) -------------- */
startBtn.addEventListener('click', ()=>{
  mode = modeSelect.value; aiLevel = aiLevelSelect.value; const timeSel = parseInt(timeControlSelect.value,10);
  enableUndo = enableUndoCheck.checked; enableHints = enableHintsCheck.checked; theme = startTheme.value; enableBook = enableBookCheck.checked;
  document.documentElement.classList.toggle('theme-brown', theme==='brown');
  startModal.style.opacity='0'; startModal.style.pointerEvents='none';
  setTimeout(()=>{ startModal.classList.add('hidden'); startModal.style.display='none'; }, 250);
  setupStartPosition(); setupClocks(timeSel);
  if(mode==='pva') flipBtn.disabled = true; else flipBtn.disabled = false;
});
closeBtn.addEventListener('click', ()=> startModal.classList.add('hidden'));
newGameBtn.addEventListener('click', ()=> startModal.classList.remove('hidden'));
undoBtn.addEventListener('click', undoMove);
restartBtn.addEventListener('click', ()=> setupStartPosition());
flipBtn.addEventListener('click', ()=>{ if(mode==='pva') return; orientation = orientation==='white'?'black':'white'; renderBoard(); });
themeBtn.addEventListener('click', ()=>{ theme = theme==='classic'?'brown':'classic'; document.documentElement.classList.toggle('theme-brown', theme==='brown'); });
hintBtn.addEventListener('click', showHint);
soundToggle.addEventListener('change', (e)=> soundsOn = e.target.checked);
window.addEventListener('load', ()=> startModal.classList.remove('hidden'));

/* -------------- init -------------- */
function init(){ renderBoard(); updateHistory(); }
init();

/* -------------- End of file -------------- */