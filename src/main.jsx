import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { findPlace, findRestaurants } from './data';
import { applyAnswer, priceBand, questionsFor, showdownFor } from './traits';
import QRCode from 'qrcode';
import { Burst, Friends } from './ArcadeArt';
import { Masthead, Welcome, GamePreview } from './Welcome';
import { groupAnswer, inviteUrl, makeRoomCode, readInviteCode } from './room';
import './style.css';

function App() {
  const [location, setLocation] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const placeInput = useRef(null);
  const [radius, setRadius] = useState(2);
  const [showdownEnabled, setShowdownEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [label, setLabel] = useState('');
  const [restaurants, setRestaurants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [eliminated, setEliminated] = useState(new Set());
  const [dimmed, setDimmed] = useState(new Set());
  const [asked, setAsked] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [revision, setRevision] = useState(0);
  const [noCount, setNoCount] = useState(0);
  const [seconds, setSeconds] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [roomRole, setRoomRole] = useState('solo');
  const [roomCode, setRoomCode] = useState('');
  const [joinExpanded, setJoinExpanded] = useState(() => Boolean(readInviteCode(window.location.search)));
  const [joinCode, setJoinCode] = useState(() => readInviteCode(window.location.search));
  const [roomStatus, setRoomStatus] = useState(() => readInviteCode(window.location.search) ? 'Room code filled from invite. Tap Join.' : '');
  const [qrImage, setQrImage] = useState('');
  const [guestCount, setGuestCount] = useState(0);
  const [votes, setVotes] = useState({ key: '', answers: {} });
  const [votedKey, setVotedKey] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [dealId, setDealId] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const requestRef = useRef(null);
  const gameRef = useRef(null);
  const resultsRef = useRef(null);
  const socketRef = useRef(null);
  const guestsRef = useRef(new Set());
  const snapshotRef = useRef(null);
  const currentQuestionRef = useRef('');
  const guestBoardRef = useRef(false);
  const previousFlipCountRef = useRef(0);
  const roomInvite = roomRole === 'host' && roomCode ? inviteUrl(window.location.href, roomCode) : '';
  const localInvite = roomInvite && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(roomInvite).hostname);
  const questions = useMemo(() => questionsFor(restaurants.filter(r => !eliminated.has(r.id)), history), [restaurants, eliminated, history]);
  const finalists = restaurants.filter(r => !eliminated.has(r.id)).sort((a, b) => a.distance - b.distance);
  const nextQuestion = questions.find(q => !asked.has(q.key));
  const showdown = nextQuestion || !showdownEnabled ? null : showdownFor(finalists);
  const lastChance = noCount >= 3 && finalists.length === 1 && !nextQuestion && !asked.has('last_chance');
  const question = nextQuestion || showdown || (lastChance ? { key: 'last_chance', question: 'Is this one good enough to eat?' } : null);
  const finished = restaurants.length > 0 && (finalists.length === 0 || !question);
  currentQuestionRef.current = question?.key || '';
  snapshotRef.current = { type: 'state', restaurants, label, eliminated: [...eliminated], dimmed: [...dimmed], asked: [...asked], noCount, seconds, playing, showdownEnabled, timerEnabled, history, revision, voteCount: votes.key === question?.key ? Object.keys(votes.answers).length : 0, guestCount };

  useEffect(() => {
    if (!timerEnabled || !playing || finished || seconds === 0) return;
    const timer = setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [playing, finished, seconds, roomRole, timerEnabled]);

  useEffect(() => {
    if (roomRole !== 'host' || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify(snapshotRef.current));
  }, [roomRole, restaurants, label, eliminated, dimmed, asked, noCount, playing, showdownEnabled, timerEnabled, history, revision, votes, guestCount]);

  useEffect(() => {
    if (roomRole !== 'host' || !question || finished || votes.key !== question.key) return;
    if (Object.keys(votes.answers).length < guestCount + 1) return;
    resolveAnswer(groupAnswer(votes.answers));
    setVotes({ key: '', answers: {} });
  }, [roomRole, question?.key, finished, votes, guestCount]);

  useEffect(() => () => socketRef.current?.close(), []);

  useEffect(() => {
    if (!roomInvite) { setQrImage(''); return; }
    let active = true;
    QRCode.toDataURL(roomInvite, { width: 220, margin: 2, color: { dark: '#17231c', light: '#f7f3de' } })
      .then(url => { if (active) setQrImage(url); })
      .catch(() => { if (active) setQrImage(''); });
    return () => { active = false; };
  }, [roomInvite]);

  useEffect(() => {
    if (soundEnabled && eliminated.size > previousFlipCountRef.current) playFlipSound();
    previousFlipCountRef.current = eliminated.size;
  }, [eliminated]);

  useEffect(() => {
    if (!dealId) return;
    gameRef.current?.focus({ preventScroll: true });
    gameRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }, [dealId]);

  useEffect(() => {
    if (!finished) { setShowResults(false); return; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setShowResults(true), reduced ? 0 : 1150);
    return () => clearTimeout(timer);
  }, [finished, dealId]);

  useEffect(() => {
    if (!showResults) return;
    resultsRef.current?.focus({ preventScroll: true });
    resultsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }, [showResults, dealId]);

  function leaveRoom() {
    if (roomRole === 'guest') { setRestaurants([]); setPlaying(false); }
    const socket = socketRef.current; socketRef.current = null; socket?.close();
    guestsRef.current.clear();
    setRoomRole('solo'); setRoomCode(''); setRoomStatus(''); setGuestCount(0); setVotes({ key: '', answers: {} }); setVotedKey('');
  }

  function connectRoom(code, role) {
    const url = new URL(`/api/rooms/${code}`, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('role', role);
    const socket = new WebSocket(url);
    socketRef.current = socket;
    let ready = false;
    const timer = setTimeout(() => { if (socketRef.current === socket && !ready) { socketRef.current = null; socket.close(); setRoomStatus('Connection timed out. Please try again.'); } }, 15000);
    socket.onmessage = event => {
      if (socketRef.current !== socket) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'ready') {
        ready = true; clearTimeout(timer); setRoomRole(role); setRoomCode(code);
        setRoomStatus(role === 'host' ? 'Room ready. Share the code with friends.' : 'Connected. Waiting for the host to deal the cards.');
      } else if (role === 'host' && message.type === 'guest-joined') {
        guestsRef.current.add(message.id); setGuestCount(guestsRef.current.size);
        socket.send(JSON.stringify(snapshotRef.current));
      } else if (role === 'host' && message.type === 'guest-left') {
        guestsRef.current.delete(message.id); setGuestCount(guestsRef.current.size);
        setVotes(current => { const answers = { ...current.answers }; delete answers[message.id]; return { ...current, answers }; });
      } else if (role === 'host' && message.type === 'vote' && message.key === currentQuestionRef.current && typeof message.yes === 'boolean') {
        setVotes(current => ({ key: message.key, answers: { ...(current.key === message.key ? current.answers : {}), [message.id]: message.yes } }));
      } else if (role === 'guest' && message.type === 'state' && Array.isArray(message.restaurants)) {
        setRestaurants(message.restaurants); setLabel(message.label); setEliminated(new Set(message.eliminated)); setDimmed(new Set(message.dimmed)); setAsked(new Set(message.asked)); setNoCount(message.noCount); setSeconds(message.seconds); setPlaying(message.playing); setShowdownEnabled(Boolean(message.showdownEnabled)); setTimerEnabled(message.timerEnabled !== false); setHistory(message.history || []); setRevision(message.revision || 0); setGuestCount(message.guestCount || 0); setVotes({ key: 'remote', answers: { count: message.voteCount || 0 } });
        if (message.restaurants.length) setRoomStatus('Playing with the host.');
        if (message.restaurants.length && !guestBoardRef.current) { guestBoardRef.current = true; setDealId(value => value + 1); }
      }
    };
    socket.onclose = () => {
      clearTimeout(timer);
      if (socketRef.current !== socket) return;
      socketRef.current = null; guestsRef.current.clear(); setGuestCount(0); setRoomRole('solo');
      setRoomStatus(ready ? 'Room disconnected or expired. Create or join a new room.' : 'Could not join or create the room. Check the code, or try again if the room is full or the service is busy.');
    };
    socket.onerror = () => {};
  }

  function createRoom() {
    leaveRoom();
    setRoomStatus('Creating room...');
    connectRoom(makeRoomCode(), 'host');
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(roomInvite); setRoomStatus('Invite link copied.'); }
    catch { setRoomStatus('Copy the invite link shown below.'); }
  }

  async function shareInvite() {
    if (!navigator.share) { await copyInvite(); return; }
    try { await navigator.share({ title: 'Join my Anywhere But There room', text: `Room ${roomCode}`, url: roomInvite }); }
    catch (error) { if (error.name !== 'AbortError') setRoomStatus('Could not share the invite. Try copying the link.'); }
  }

  function joinRoom(event) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { setRoomStatus('Enter a four-letter room code.'); return; }
    leaveRoom(); guestBoardRef.current = false;
    setRoomStatus('Connecting to room...');
    connectRoom(code, 'guest');
  }

  async function load(lat, lon, placeLabel, signal) {
    setSearchStatus('Finding restaurants…');
    const items = await findRestaurants(lat, lon, radius * 1609.344, signal);
    if (signal.aborted) return;
    if (!items.length) throw new Error('No named food spots found here. Try a larger radius or another location.');
    setRestaurants(items); setLabel(placeLabel); setEliminated(new Set()); setDimmed(new Set()); setAsked(new Set()); setNoCount(0); setHistory([]); setRevision(value => value + 1); setVotes({ key: '', answers: {} }); setVotedKey(''); setSeconds(60); setPlaying(true); setDealId(value => value + 1);
  }
  async function beginSearch(resolvePlace) {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller; setBusy(true); setError('');
    try {
      const place = await resolvePlace(controller.signal);
      if (!controller.signal.aborted) await load(place.lat, place.lon, place.label, controller.signal);
    } catch (e) {
      if (requestRef.current === controller) setError(controller.signal.aborted ? 'Search cancelled.' : e.message);
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setBusy(false); }
    }
  }
  async function search(event) {
    event.preventDefault();
    if (!location.trim()) { placeInput.current?.focus(); return; }
    setSearchStatus('Finding that location…');
    await beginSearch(signal => findPlace(location.trim(), signal));
  }

  function useGps() {
    if (!window.isSecureContext || !navigator.geolocation) {
      setError('Location access is unavailable here. Enter a city, address, or ZIP code.');
      placeInput.current?.focus();
      return;
    }
    setSearchStatus('Getting your location…');
    beginSearch(() => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lon: position.coords.longitude, label: 'Near you' }),
      error => reject(new Error(({
        1: 'Location access was denied.',
        3: 'Your location request timed out.'
      }[error.code] || 'Your device could not find your location.') + ' Enter a city, address, or ZIP code, or try Near me again.')),
      { timeout: 12000, maximumAge: 60000 }
    )));
  }

  function cancelSearch() {
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setError('Search cancelled.');
  }
  function resolveAnswer(wantsYes) {
    if (!question) return;
    const details = Object.fromEntries(finalists.map(r => [r.id, question.noPreference && !wantsYes ? 'No requirement' : question.known ? (!question.known(r.tags, r) ? 'Unknown' : question.match(r.tags, r) === wantsYes ? 'Matches' : 'Does not match') : 'Selected']));
    setHistory(current => [...current, { key: question.key, text: question.question, answer: wantsYes ? 'Yes' : 'No', details, before: { eliminated: [...eliminated], dimmed: [...dimmed], asked: [...asked], noCount, showdownEnabled } }]);
    if (showdown) {
      setEliminated(current => new Set([...current, wantsYes ? showdown.second.id : showdown.first.id]));
      if (!wantsYes) setNoCount(value => value + 1);
      if (navigator.vibrate) navigator.vibrate(20);
      return;
    }
    if (question.key === 'last_chance') {
      if (wantsYes) setAsked(current => new Set([...current, 'last_chance']));
      else setEliminated(new Set(restaurants.map(r => r.id)));
      return;
    }
    const result = applyAnswer(restaurants, eliminated, question, wantsYes);
    setEliminated(result.eliminated); setDimmed(result.dimmed); setAsked(new Set([...asked, question.key]));
    if (!wantsYes) setNoCount(value => value + 1);
    if (navigator.vibrate) navigator.vibrate(20);
  }
  function answer(wantsYes) {
    if (!question || votedKey === `${revision}:${question.key}` && roomRole === 'guest') return;
    if (roomRole === 'solo') { resolveAnswer(wantsYes); return; }
    if (roomRole === 'host') setVotes(current => ({ key: question.key, answers: { ...(current.key === question.key ? current.answers : {}), host: wantsYes } }));
    else { if (socketRef.current?.readyState !== WebSocket.OPEN) { setRoomStatus('Disconnected. Please rejoin the room.'); return; } socketRef.current.send(JSON.stringify({ type: 'vote', key: question.key, yes: wantsYes })); setVotedKey(`${revision}:${question.key}`); }
  }
  function skipQuestion() {
    if (!question || roomRole === 'guest') return;
    setHistory(current => [...current, { key: question.key, text: question.question, answer: 'Skipped', details: {}, before: { eliminated: [...eliminated], dimmed: [...dimmed], asked: [...asked], noCount, showdownEnabled } }]);
    if (showdown) { setShowdownEnabled(false); } else setAsked(current => new Set([...current, question.key]));
    setVotes({ key: '', answers: {} }); setVotedKey(''); setRevision(v => v + 1);
  }
  function undo() {
    const last = history.at(-1); if (!last || roomRole === 'guest') return;
    setEliminated(new Set(last.before.eliminated)); setDimmed(new Set(last.before.dimmed)); setAsked(new Set(last.before.asked)); setNoCount(last.before.noCount); setShowdownEnabled(last.before.showdownEnabled); setHistory(history.slice(0, -1));
    setVotes({ key: '', answers: {} }); setVotedKey(''); setRevision(v => v + 1);
  }
  function reset() { setRestaurants([]); setPlaying(false); setError(''); setShareStatus(''); }
  async function shareResults() {
    const summary = `Anywhere But There finalists near ${label}:\n${finalists.slice(0, 4).map((r, index) => `${index + 1}. ${r.name} (${r.distance.toFixed(1)} mi) — https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`).join('\n')}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Anywhere But There finalists', text: summary });
      else { await navigator.clipboard.writeText(summary); setShareStatus('Results copied to clipboard.'); }
    } catch (error) {
      if (error.name !== 'AbortError') setShareStatus('Could not share results on this device.');
    }
  }
  return <div className="app" id="top">
    <a className="skip-link" href="#play">Skip to game controls</a>
    <Masthead/>
    <main className="app-content">
    <Welcome/>
    <div className="setup" id="play" tabIndex={-1}>
    {roomRole !== 'guest' && <form onSubmit={search} className="search">
      <div className="search-row">
        <div className="search-entry">
          <button type="button" className="gps" onClick={useGps} disabled={busy}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-8 8-13a8 8 0 1 0-16 0c0 5 8 13 8 13Z"/><circle cx="12" cy="9" r="2.6"/></svg>Near me
          </button>
          <label className="sr-only" htmlFor="place">City, address, or ZIP code</label>
          <input id="place" required ref={placeInput} value={location} onChange={event => setLocation(event.target.value)} placeholder="City, address, or ZIP code" disabled={busy}/>
        </div>
        <button className="find" type="submit" disabled={busy}><Burst/>Find my spots <span aria-hidden="true">→</span></button>
      </div>
      {busy && <div className="search-progress"><span role="status">{searchStatus}</span><button type="button" onClick={cancelSearch}>Cancel</button></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <details className="settings"><summary>Game settings · {radius} {radius === 1 ? 'mile' : 'miles'}</summary>
<div className="search-options"><div className="controls"><label>Within <select disabled={busy} value={radius} onChange={e => setRadius(Number(e.target.value))}><option value="1">1 mile</option><option value="2">2 miles</option><option value="5">5 miles</option><option value="10">10 miles</option></select></label></div><div className="game-options"><label><input type="checkbox" checked={showdownEnabled} onChange={e => setShowdownEnabled(e.target.checked)} disabled={restaurants.length > 0}/> Head-to-head finale</label><label><input type="checkbox" checked={timerEnabled} onChange={e => setTimerEnabled(e.target.checked)} disabled={restaurants.length > 0}/> Show timer</label><label><input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)}/> Flip sounds</label></div></div></details>
    </form>}
    <section className="room-panel" aria-label="Multiplayer room"><div className="room-heading"><Friends/><div><h2>{roomRole === 'solo' ? 'Make it a group decision' : `Room ${roomCode}`}</h2><p>{roomRole === 'host' ? `You’re hosting with ${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}. Keep this tab open.` : roomRole === 'guest' ? 'Your answers go to the host. Everyone sees the same board.' : 'Make a room or join an existing one.'}</p></div></div>{roomRole === 'solo' ? <div className="room-actions room-actions-solo"><button className="create-room" onClick={createRoom}><span aria-hidden="true" className="action-symbol">+</span> Create a room</button>
      <button type="button" className="join-toggle" aria-expanded={joinExpanded} aria-controls="join-room-form" onClick={() => setJoinExpanded(open => !open)}>
        <span aria-hidden="true" className="join-icon"></span> Join a room
      </button>
      <form id="join-room-form" hidden={!joinExpanded} onSubmit={joinRoom}><input aria-label="Four-letter room code" maxLength={4} value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="CODE"/><button type="submit">Join</button></form></div> : <div className="room-actions"><strong className="room-code">{roomCode}</strong><button onClick={leaveRoom}>Leave room</button></div>}{roomStatus && <p className="room-status" role="status">{roomStatus}</p>}{roomRole === 'host' && <div className="room-invite"><div className="invite-copy"><label htmlFor="invite-link">Invite link</label><input id="invite-link" readOnly value={roomInvite} onFocus={event => event.target.select()}/><div><button onClick={copyInvite}>Copy link</button><button onClick={shareInvite}>Share link</button></div>{localInvite && <p>Localhost links only work on this computer. Use a hosted app URL or your computer’s LAN address for another device.</p>}</div>{qrImage && <img src={qrImage} alt={`QR code to join room ${roomCode}`} width="160" height="160"/>}</div>}</section>
    </div>
    {!restaurants.length && <GamePreview/>}
    {restaurants.length > 0 && <section className="game" ref={gameRef} tabIndex={-1} aria-label="Restaurant game board"><div className="game-top"><div><p className="eyebrow">{label} · {restaurants.length} {restaurants.length === 1 ? 'CARD' : 'CARDS'} DEALT</p><h2>{showResults ? 'Your finalists' : 'The board is shrinking'}</h2></div>{timerEnabled && <div className="timer" role="timer" aria-label="Round timer">{seconds === 0 && !finished ? 'OVERTIME' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}</div>}</div>
      {!finished && question && <div className="prompt"><span>{showdown ? 'FINAL SHOWDOWN' : 'THE NEXT QUESTION'}</span><strong aria-live="polite" aria-atomic="true">{question.question}</strong>{(roomRole === 'guest' && votedKey === `${revision}:${question.key}` || roomRole === 'host' && votes.key === question.key && Object.hasOwn(votes.answers, 'host')) ? <p className="vote-wait" role="status">Vote in. Waiting for everyone else…</p> : <div><button onClick={() => answer(true)}>{showdown ? showdown.first.name : lastChance ? 'Yes, show me' : 'Yes, please'}</button><button onClick={() => answer(false)} className="secondary">{showdown ? showdown.second.name : lastChance ? 'Nope, none' : 'No thanks'}</button></div>}{roomRole !== 'solo' && <small className="prompt-note">{roomRole === 'host' ? Object.keys(votes.key === question.key ? votes.answers : {}).length : (votes.answers.count || 0)} of {guestCount + 1} votes received{roomRole === 'host' ? ' - ties count as no' : ''}</small>}{roomRole !== 'guest' && <div><button type="button" className="secondary" onClick={skipQuestion}>Skip</button><button type="button" className="secondary" disabled={!history.length} onClick={undo}>Undo</button>{roomRole === 'host' && votes.key === question.key && Object.keys(votes.answers).length > 0 && <button type="button" className="secondary" onClick={() => { resolveAnswer(groupAnswer(votes.answers)); setVotes({ key: '', answers: {} }); }}>Use votes so far</button>}</div>}{question.key.startsWith('diet:') && <small className="prompt-note">Listed options do not confirm allergen safety. Check with the restaurant.</small>}{question.key === 'price' && <small className="prompt-note">Price tags are estimates and may be outdated.</small>}</div>}
      {showResults && <div className="final-results" ref={resultsRef} tabIndex={-1}><div className="results-heading"><div><p className="eyebrow">THE REVEAL · {finalists.length} OPTIONS</p><h3>{finalists.length ? 'Places that made the cut' : 'You won the pickiest eater award! \u{1F3C6}'}</h3><p>{finalists.length ? 'Closest first. No more questions could be generated from the available restaurant data; some places may have incomplete tags.' : 'The deck has spoken. Try another round with a wider radius or a few more yeses.'}</p></div><div className="result-actions">{history.length > 0 && roomRole !== 'guest' && <button className="play-again" onClick={undo}>Undo last answer</button>}{finalists.length > 0 && <button className="play-again" onClick={shareResults}>Share results</button>}{finalists.length > 0 && roomRole !== 'guest' && <button className="play-again" onClick={() => setEliminated(new Set(restaurants.map(r => r.id)))}>None of these</button>}{roomRole !== 'guest' && <button className="play-again" onClick={reset}>Play again</button>}</div>{shareStatus && <p role="status" className="share-status">{shareStatus}</p>}</div>{finalists.length > 0 && <div className="final-list">{finalists.map((r, index) => <Finalist key={r.id} restaurant={r} rank={index + 1} history={history} />)}</div>}</div>}
      {!showResults && <RestaurantBoard restaurants={restaurants} eliminated={eliminated} dimmed={dimmed} />}

      <p className="source">Restaurant data © OpenStreetMap contributors. Tags may be incomplete; check hours and details before heading out.</p>
    </section>}
    </main>
  </div>;
}
function RestaurantBoard({ restaurants, eliminated, dimmed }) {
  const [orderedEliminated, setOrderedEliminated] = useState(() => new Set(eliminated));
  const boardRef = useRef(null);
  const positionsRef = useRef(null);
  const cards = useMemo(() => restaurants.map((restaurant, index) => ({ restaurant, index })).sort((a, b) => Number(orderedEliminated.has(a.restaurant.id)) - Number(orderedEliminated.has(b.restaurant.id))), [restaurants, orderedEliminated]);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => {
      if (!reduced && boardRef.current) positionsRef.current = new Map([...boardRef.current.children].map(node => [node.dataset.id, node.getBoundingClientRect()]));
      setOrderedEliminated(new Set(eliminated));
    }, reduced ? 0 : 570);
    return () => clearTimeout(timer);
  }, [eliminated, restaurants]);
  useLayoutEffect(() => {
    if (!positionsRef.current || !boardRef.current) return;
    for (const node of boardRef.current.children) {
      const before = positionsRef.current.get(node.dataset.id);
      if (!before) continue;
      const after = node.getBoundingClientRect();
      const x = before.left - after.left, y = before.top - after.top;
      if (x || y) node.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    positionsRef.current = null;
  }, [orderedEliminated]);
  return <div className="board" ref={boardRef}>{cards.map(({ restaurant: r, index }) => <article aria-label={eliminated.has(r.id) ? `${r.name}, eliminated` : undefined} data-id={r.id} key={r.id} className={`card ${eliminated.has(r.id) ? 'flipped' : ''} ${dimmed.has(r.id) ? 'dimmed' : ''}`}><div className="card-inner"><div className="card-front" aria-hidden={eliminated.has(r.id)}><span className="card-number">#{String(index + 1).padStart(2, '0')}</span><div className="food-icon" aria-hidden="true">{icon(r.tags)}</div><h3>{r.name}</h3><p>{description(r.tags)} · {r.distance.toFixed(1)} mi</p></div><div className="card-back" aria-hidden="true">×<span>FLIPPED</span></div></div></article>)}</div>;
}
function icon(tags) { const value = tags.cuisine || tags.amenity || ''; if (/pizza|italian/.test(value)) return '🍕'; if (/burger|fast_food/.test(value)) return '🍔'; if (/coffee|cafe/.test(value)) return '☕'; if (/sushi|japanese/.test(value)) return '🍣'; if (/mexican|taco/.test(value)) return '🌮'; return '🍽️'; }
function description(tags) { return (tags.cuisine || tags.amenity || 'Food').split(/[;,]/)[0].replaceAll('_', ' '); }
function playFlipSound() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(420, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(170, context.currentTime + 0.09);
    gain.gain.setValueAtTime(0.045, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.11);
    oscillator.onended = () => context.close();
  } catch { /* Audio may be blocked until the first interaction. */ }
}
function safeWebsite(raw) { try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function address(tags) { return [ [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '), tags['addr:city'] ].filter(Boolean).join(', '); }
function CommonsImage({ tags, name }) {
  const [photo, setPhoto] = useState(null);
  const direct = /^(File|Image):/i.test(tags.wikimedia_commons || '') ? tags.wikimedia_commons : /^(File|Image):/i.test(tags.image || '') ? tags.image : '';
  const brandId = /^Q[1-9][0-9]*$/.test(tags['brand:wikidata'] || '') ? tags['brand:wikidata'] : '';
  const placeId = /^Q[1-9][0-9]*$/.test(tags.wikidata || '') ? tags.wikidata : '';
  useEffect(() => {
    setPhoto(null);
    const controller = new AbortController();
    async function loadImage() {
      let title = direct;
      if (!title && (placeId || brandId)) {
        const id = placeId || brandId;
        const url = new URL('https://www.wikidata.org/w/api.php');
        url.search = new URLSearchParams({ action: 'wbgetentities', ids: id, props: 'claims', format: 'json', origin: '*' });
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return;
        const entity = (await response.json()).entities?.[id];
        const claims = entity?.claims;
        const file = (placeId ? claims?.P18 : claims?.P154)?.find(claim => claim.rank !== 'deprecated')?.mainsnak?.datavalue?.value;
        if (typeof file === 'string') title = `File:${file}`;
      }
      if (!title) return;
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.search = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'imageinfo', titles: title, iiprop: 'url|extmetadata', iiurlwidth: '240' });
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      const info = Object.values(data?.query?.pages || {})[0]?.imageinfo?.[0];
      const metadata = info?.extmetadata; const author = metadata?.Artist?.value; const license = metadata?.LicenseShortName?.value;
      if (!info?.thumburl || !info.descriptionurl || !license || (!author && metadata?.AttributionRequired?.value === 'true')) return;
      const plain = author ? new DOMParser().parseFromString(author, 'text/html').body.textContent : 'See file details';
      setPhoto({ url: info.thumburl, page: info.descriptionurl, author: plain, license, licenseUrl: metadata?.LicenseUrl?.value });
    }
    loadImage().catch(() => {});
    return () => controller.abort();
  }, [direct, brandId, placeId]);
  if (!photo) return <div className="finalist-icon">{icon(tags)}</div>;
  return <figure className="commons-photo"><img src={photo.url} alt={`Image associated with ${name}`} onError={() => setPhoto(null)}/><figcaption><a href={photo.page} target="_blank" rel="noreferrer">{photo.author}</a> &middot; {safeWebsite(photo.licenseUrl) ? <a href={safeWebsite(photo.licenseUrl)} target="_blank" rel="noreferrer">{photo.license}</a> : photo.license} &middot; Wikimedia Commons</figcaption></figure>;
}
function Finalist({ restaurant: r, rank, history }) {
  const tags = r.tags;
  const website = safeWebsite(tags.website || tags['contact:website']);
  const phone = tags.phone || tags['contact:phone'];
  const placeAddress = address(tags);
  const amenities = [tags.takeaway === 'yes' && 'Takeout', tags.delivery === 'yes' && 'Delivery', tags.drive_through === 'yes' && 'Drive-thru', tags.outdoor_seating === 'yes' && 'Patio', ...['vegan', 'vegetarian', 'gluten_free', 'lactose_free', 'nut_free', 'halal', 'kosher'].filter(diet => ['yes', 'only', 'limited'].includes(tags[`diet:${diet}`])).map(diet => `${diet.replaceAll('_', ' ')} options`), priceBand(tags) && '$'.repeat(priceBand(tags))].filter(Boolean);
  return <article className="finalist"><CommonsImage tags={tags} name={r.name} /><div className="finalist-body"><div className="finalist-top"><span className="finalist-rank">#{rank}</span><span className="finalist-distance">{r.distance.toFixed(1)} miles away</span></div><h4>{r.name}</h4><p className="finalist-type">{(tags.cuisine || tags.amenity || 'Food').replaceAll('_', ' ').replaceAll(';', ' · ')}</p>{amenities.length > 0 && <div className="finalist-tags">{amenities.map(tag => <span key={tag}>{tag}</span>)}</div>}{placeAddress && <p className="finalist-detail"><b>Address</b> {placeAddress}</p>}{tags.opening_hours && <p className="finalist-detail"><b>Listed hours</b> {tags.opening_hours}</p>}<details><summary>Why this place remains</summary>{history.length ? <ul>{history.map((entry, i) => <li key={i}>{entry.text} {entry.answer} &mdash; {entry.answer === 'Skipped' ? 'Skipped' : entry.details?.[r.id] || 'Not evaluated'}</li>)}</ul> : <p>No answers yet.</p>}</details><div className="finalist-links"><a href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`} target="_blank" rel="noreferrer">Open in Maps ↗</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + (placeAddress || `${r.lat},${r.lon}`))}`} target="_blank" rel="noreferrer">Find reviews on Google Maps &rarr;</a>{website && <a href={website} target="_blank" rel="noreferrer">Website ↗</a>}{phone && <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>Call {phone}</a>}</div></div></article>;
}
createRoot(document.getElementById('root')).render(<App />);
