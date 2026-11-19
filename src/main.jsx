import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { findPlace, findRestaurants } from './data';
import { applyAnswer, priceBand, questionsFor, showdownFor } from './traits';
import QRCode from 'qrcode';
import { groupAnswer, inviteUrl, makeRoomCode, readInviteCode } from './room';
import './style.css';

function App() {
  const [location, setLocation] = useState('');
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
  const [joinCode, setJoinCode] = useState(() => readInviteCode(window.location.search));
  const [roomStatus, setRoomStatus] = useState(() => readInviteCode(window.location.search) ? 'Room code filled from invite. Tap Join.' : '');
  const [qrImage, setQrImage] = useState('');
  const [guestCount, setGuestCount] = useState(0);
  const [votes, setVotes] = useState({ key: '', answers: {} });
  const [votedKey, setVotedKey] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [dealId, setDealId] = useState(0);
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
    gameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [dealId]);

  useEffect(() => {
    if (!finished) return;
    resultsRef.current?.focus({ preventScroll: true });
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [finished, dealId]);

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
    const items = await findRestaurants(lat, lon, radius * 1609.344, signal);
    if (signal.aborted) return;
    if (!items.length) throw new Error('No named food spots found here. Try a larger radius or another location.');
    setRestaurants(items); setLabel(placeLabel); setEliminated(new Set()); setDimmed(new Set()); setAsked(new Set()); setNoCount(0); setHistory([]); setRevision(value => value + 1); setVotes({ key: '', answers: {} }); setVotedKey(''); setSeconds(60); setPlaying(true); setDealId(value => value + 1);
  }
  async function beginSearch(resolvePlace) {
    const controller = new AbortController();
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
    if (!location.trim()) return;
    await beginSearch(signal => findPlace(location.trim(), signal));
  }
  function useGps() {
    if (!navigator.geolocation) { setError('Your browser does not support location. Enter a city or ZIP code.'); return; }
    beginSearch(() => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lon: position.coords.longitude, label: 'Near you' }),
      () => reject(new Error('Location was unavailable. Enter a city or ZIP code instead.')),
      { timeout: 12000 }
    )));
  }
  function cancelSearch() { requestRef.current?.abort(); }
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
  return <main className="app">
    <header><div className="brand"><span className="brand-icon" aria-hidden="true">a<span>b</span>t</span><span className="brand-name">anywhere<br/><b>but there.</b></span></div><span className="edition">A LITTLE GAME FOR BIG APPETITES</span></header>
    <section className="intro"><p className="eyebrow">THE GAME FOR PICKING A PLACE</p><h1>So, where are <em>we eating?</em></h1><p>Turn the endless “I don’t know” into somewhere delicious. Find your spots, flip what you don’t want, and let the good ones stay.</p><div className="intro-steps"><span><b>01</b> Find spots</span><span><b>02</b> Make your picks</span><span><b>03</b> Go eat</span></div><div className="hero-art" aria-hidden="true"><div className="art-card art-card-back"><span>NOPE!</span></div><div className="art-card art-card-front"><span className="art-star">✦</span><span>GOOD<br/>EATS<br/><i>AHEAD.</i></span><small>THE CHOICE IS YOURS</small></div><div className="art-stamp">LET’S<br/>EAT <span>↗</span></div></div></section>
    <section className="room-panel" aria-label="Multiplayer room"><div><p className="eyebrow">BRING YOUR PEOPLE</p><h2>{roomRole === 'solo' ? 'Make it a group decision.' : `Room ${roomCode}`}</h2><p>{roomRole === 'host' ? `You’re hosting with ${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}. Keep this tab open.` : roomRole === 'guest' ? 'Your answers go to the host. Everyone sees the same board.' : 'Create a room, then share its four-letter code. The host chooses the location.'}</p></div>{roomRole === 'solo' ? <div className="room-actions"><button onClick={createRoom}>Create room</button><form onSubmit={joinRoom}><input aria-label="Four-letter room code" maxLength={4} value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="CODE"/><button type="submit">Join</button></form></div> : <div className="room-actions"><strong className="room-code">{roomCode}</strong><button onClick={leaveRoom}>Leave room</button></div>}{roomStatus && <p className="room-status" role="status">{roomStatus}</p>}{roomRole === 'host' && <div className="room-invite"><div className="invite-copy"><label htmlFor="invite-link">Invite link</label><input id="invite-link" readOnly value={roomInvite} onFocus={event => event.target.select()}/><div><button onClick={copyInvite}>Copy link</button><button onClick={shareInvite}>Share link</button></div>{localInvite && <p>Localhost links only work on this computer. Use a hosted app URL or your computer’s LAN address for another device.</p>}</div>{qrImage && <img src={qrImage} alt={`QR code to join room ${roomCode}`} width="160" height="160"/>}</div>}</section>
    {roomRole !== 'guest' && <form onSubmit={search} className="search"><label htmlFor="place">First things first. Where are you?</label><div className="search-row"><input id="place" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, state, or ZIP code"/><button type="submit" disabled={busy}>{busy ? 'Loading…' : 'Deal the cards →'}</button>{busy && <button type="button" className="cancel-button" onClick={cancelSearch}>Cancel</button>}</div><div className="controls"><button type="button" className="text-button" onClick={useGps} disabled={busy}>◎ Use my location</button><label>Within <select value={radius} onChange={e => setRadius(Number(e.target.value))}><option value="1">1 mile</option><option value="2">2 miles</option><option value="5">5 miles</option><option value="10">10 miles</option></select></label></div><div className="game-options"><label><input type="checkbox" checked={showdownEnabled} onChange={e => setShowdownEnabled(e.target.checked)} disabled={restaurants.length > 0}/> Head-to-head finale</label><label><input type="checkbox" checked={timerEnabled} onChange={e => setTimerEnabled(e.target.checked)} disabled={restaurants.length > 0}/> Show timer</label><label><input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)}/> Flip sounds</label></div></form>}
    {error && <p className="error" role="alert">{error}</p>}
    {restaurants.length > 0 && <section className="game" ref={gameRef} tabIndex={-1} aria-label="Restaurant game board"><div className="game-top"><div><p className="eyebrow">{label} · {restaurants.length} CARDS DEALT</p><h2>{finished ? 'Your finalists' : 'The board is shrinking'}</h2></div>{timerEnabled && <div className="timer">{seconds === 0 && !finished ? 'OVERTIME' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}</div>}</div>
      {!finished && question && <div className="prompt"><span>{showdown ? 'FINAL SHOWDOWN' : 'THE NEXT QUESTION'}</span><strong>{question.question}</strong>{(roomRole === 'guest' && votedKey === `${revision}:${question.key}` || roomRole === 'host' && votes.key === question.key && Object.hasOwn(votes.answers, 'host')) ? <p className="vote-wait">Vote in. Waiting for everyone else…</p> : <div><button onClick={() => answer(true)}>{showdown ? showdown.first.name : lastChance ? 'Yes, show me' : 'Yes, please'}</button><button onClick={() => answer(false)} className="secondary">{showdown ? showdown.second.name : lastChance ? 'Nope, none' : 'No thanks'}</button></div>}{roomRole !== 'solo' && <small className="prompt-note">{roomRole === 'host' ? Object.keys(votes.key === question.key ? votes.answers : {}).length : (votes.answers.count || 0)} of {guestCount + 1} votes received{roomRole === 'host' ? ' ? ties count as no' : ''}</small>}{roomRole !== 'guest' && <div><button type="button" className="secondary" onClick={skipQuestion}>Skip</button><button type="button" className="secondary" disabled={!history.length} onClick={undo}>Undo</button>{roomRole === 'host' && votes.key === question.key && Object.keys(votes.answers).length > 0 && <button type="button" className="secondary" onClick={() => { resolveAnswer(groupAnswer(votes.answers)); setVotes({ key: '', answers: {} }); }}>Use votes so far</button>}</div>}{question.key.startsWith('diet:') && <small className="prompt-note">Listed options do not confirm allergen safety. Check with the restaurant.</small>}{question.key === 'price' && <small className="prompt-note">Price tags are estimates and may be outdated.</small>}</div>}
      {finished && <div className="final-results" ref={resultsRef} tabIndex={-1}><div className="results-heading"><div><p className="eyebrow">THE REVEAL · {finalists.length} OPTIONS</p><h3>{finalists.length ? 'Places that made the cut' : 'You won the pickiest eater award! \u{1F3C6}'}</h3><p>{finalists.length ? 'Closest first. No more questions could be generated from the available restaurant data; some places may have incomplete tags.' : 'The deck has spoken. Try another round with a wider radius or a few more yeses.'}</p></div><div className="result-actions">{history.length > 0 && roomRole !== 'guest' && <button className="play-again" onClick={undo}>Undo last answer</button>}{finalists.length > 0 && <button className="play-again" onClick={shareResults}>Share results</button>}{finalists.length > 0 && roomRole !== 'guest' && <button className="play-again" onClick={() => setEliminated(new Set(restaurants.map(r => r.id)))}>None of these</button>}{roomRole !== 'guest' && <button className="play-again" onClick={reset}>Play again</button>}</div>{shareStatus && <p role="status" className="share-status">{shareStatus}</p>}</div>{finalists.length > 0 && <div className="final-list">{finalists.map((r, index) => <Finalist key={r.id} restaurant={r} rank={index + 1} history={history} />)}</div>}</div>}
      {!finished && <div className="board">{restaurants.map((r, index) => <article key={r.id} className={`card ${eliminated.has(r.id) ? 'flipped' : ''} ${dimmed.has(r.id) ? 'dimmed' : ''}`}><div className="card-inner"><div className="card-front"><span className="card-number">#{String(index + 1).padStart(2, '0')}</span><div className="food-icon">{icon(r.tags)}</div><h3>{r.name}</h3><p>{description(r.tags)} · {r.distance.toFixed(1)} mi</p></div><div className="card-back">✳<span>FLIPPED</span></div></div></article>)}</div>}
      <p className="source">Restaurant data © OpenStreetMap contributors. Tags may be incomplete; check hours and details before heading out.</p>
    </section>}
  </main>;
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
function CommonsImage({ tags }) {
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
  return <figure className="commons-photo"><img src={photo.url} alt="" onError={() => setPhoto(null)}/><figcaption><a href={photo.page} target="_blank" rel="noreferrer">{photo.author}</a> &middot; {safeWebsite(photo.licenseUrl) ? <a href={safeWebsite(photo.licenseUrl)} target="_blank" rel="noreferrer">{photo.license}</a> : photo.license} &middot; Wikimedia Commons</figcaption></figure>;
}
function Finalist({ restaurant: r, rank, history }) {
  const tags = r.tags;
  const website = safeWebsite(tags.website || tags['contact:website']);
  const phone = tags.phone || tags['contact:phone'];
  const placeAddress = address(tags);
  const amenities = [tags.takeaway === 'yes' && 'Takeout', tags.delivery === 'yes' && 'Delivery', tags.drive_through === 'yes' && 'Drive-thru', tags.outdoor_seating === 'yes' && 'Patio', ...['vegan', 'vegetarian', 'gluten_free', 'lactose_free', 'nut_free', 'halal', 'kosher'].filter(diet => ['yes', 'only', 'limited'].includes(tags[`diet:${diet}`])).map(diet => `${diet.replaceAll('_', ' ')} options`), priceBand(tags) && '$'.repeat(priceBand(tags))].filter(Boolean);
  return <article className="finalist"><CommonsImage tags={tags} /><div className="finalist-body"><div className="finalist-top"><span className="finalist-rank">#{rank}</span><span className="finalist-distance">{r.distance.toFixed(1)} miles away</span></div><h4>{r.name}</h4><p className="finalist-type">{(tags.cuisine || tags.amenity || 'Food').replaceAll('_', ' ').replaceAll(';', ' · ')}</p>{amenities.length > 0 && <div className="finalist-tags">{amenities.map(tag => <span key={tag}>{tag}</span>)}</div>}{placeAddress && <p className="finalist-detail"><b>Address</b> {placeAddress}</p>}{tags.opening_hours && <p className="finalist-detail"><b>Listed hours</b> {tags.opening_hours}</p>}<details><summary>Why this place remains</summary>{history.length ? <ul>{history.map((entry, i) => <li key={i}>{entry.text} {entry.answer} ? {entry.answer === 'Skipped' ? 'Skipped' : entry.details?.[r.id] || 'Not evaluated'}</li>)}</ul> : <p>No answers yet.</p>}</details><div className="finalist-links"><a href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`} target="_blank" rel="noreferrer">Open in Maps ↗</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + (placeAddress || `${r.lat},${r.lon}`))}`} target="_blank" rel="noreferrer">Find reviews on Google Maps ?</a>{website && <a href={website} target="_blank" rel="noreferrer">Website ↗</a>}{phone && <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>Call {phone}</a>}</div></div></article>;
}
createRoot(document.getElementById('root')).render(<App />);
