import React, { useState } from 'react';
import { Burst, NightSky } from './ArcadeArt';
import bistroPhoto from '../Example Images/bistro.jpg';
import ramenPhoto from '../Example Images/ramen shop.jpg';
import pizzaPhoto from '../Example Images/pizza place.jpg';
import emberPhoto from '../Example Images/bbq&steakhouse.jpg';

export function Cloche() {
  return <svg className="cloche" viewBox="0 0 40 32" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="currentColor" d="M18 1h3v5h-3zM6 5h3v3h3v3H9V8H6zm25 0h3v3h-3v3h-3V8h3zM17 10h6v3h4v2h4v3h3v4h2v4h3v4H1v-4h3v-4h2v-4h3v-3h4v-2h4zm-4 8v2h-3v4H8v2h24v-2h-2v-4h-3v-2h-4v-2h-6v2z"/>
  </svg>;
}

export function Masthead() {
  const [motionPaused, setMotionPaused] = useState(false);
  return <>
    <NightSky paused={motionPaused}/>
    <header className="masthead">
      <div className="wordmark" aria-label="Anywhere But There">Anywhere<b>But There</b></div>
      <span className="edition">The Restaurant Elimination Game</span>
      <button type="button" className="motion-toggle" aria-pressed={motionPaused} onClick={() => setMotionPaused(paused => !paused)}>Pause sky motion</button>
    </header>
  </>;
}

export function Welcome() {
  return <section className="intro">
      <div><h1>Can’t decide<br/>where to eat<span className="question-mark">?<Burst/></span></h1>
        <p>Flip cards, eliminate the maybes, and land on a spot everyone’s actually hungry for.</p>
        <svg className="underline" viewBox="0 0 102 14" aria-hidden="true"><path d="M3 10 Q29 3 43 4 L40 11 Q72 4 98 6"/></svg>
      </div>
      <div className="showcase" aria-hidden="true">
        <svg className="swoop" viewBox="0 0 92 46"><path d="M4 39 Q35 0 80 13 M69 3 L83 13 L67 20"/></svg>
        <div className="stack card-pattern"><Cloche/></div>
        <div className="rejected"><img src={pizzaPhoto} alt=""/><span>×</span></div>
        <div className="feature"><img src={bistroPhoto} alt=""/><b>The Corner Bistro</b><Burst/></div>
      </div>
    </section>;
}

const samples = [
  { name: 'Lucky Noodle', photo: ramenPhoto },
  { name: 'The Corner Bistro', photo: bistroPhoto, hidden: true },
  { name: 'Woodfire Kitchen', photo: pizzaPhoto },
  { name: 'Ember & Rib', photo: emberPhoto, hidden: true }
];

function PreviewCard({ name, photo, hidden, number }) {
  const [revealed, setRevealed] = useState(!hidden);
  const label = revealed ? `Flip ${name} face down` : `Reveal sample card ${number}`;
  return <button type="button" className="preview-card" data-revealed={revealed} aria-label={label}
    onClick={() => setRevealed(current => !current)}>
    <span className="sample-rotor" aria-hidden="true">
      <span className="sample card-pattern"><Cloche/></span>
      <span className="sample sample-photo"><img src={photo} alt=""/><b>{name}</b></span>
    </span>
  </button>;
}

export function GamePreview() {
  return <section className="preview" aria-label="How the game works">
    <div className="preview-heading">
      <h2><svg viewBox="0 0 32 20" aria-hidden="true"><path fill="currentColor" d="M6 2h20v2h3v4h2v9h-2v2h-4l-5-5h-8l-5 5H3v-2H1V8h2V4h3z"/><path stroke="#1b1739" strokeWidth="2" d="M5 8h8M9 4v8m12-5h3m0 4h3"/></svg>The game</h2>
      <ol role="list"><li>Find nearby spots</li><li>Answer questions to flip cards</li><li>Choose from the finalists</li></ol>
    </div>
    <div className="preview-body">
      <div className="round"><span className="round-ticket"><strong>Round 1</strong><Burst/></span>
        <p>Select any card to flip it over.</p>
        <div className="mascot-arrow"><img src="/fries.webp" alt=""/><svg viewBox="0 0 80 50" aria-hidden="true"><path d="M4 28Q32 62 71 9m-17 5 18-7-1 17"/></svg></div>
      </div>
      <div className="samples">
        {samples.map((sample, i) => <PreviewCard key={sample.name} {...sample} number={i+1}/>)}
      </div>
      <img className="drink" src="/drink.webp" alt=""/>
    </div>
    <a className="preview-return" href="#top">Back to top</a>
  </section>;
}
