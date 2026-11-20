import React from 'react';

const stars = [[3,8],[9,48],[15,25],[22,6],[28,85],[33,43],[38,15],[44,70],[48,34],[54,7],[58,83],[62,23],[67,56],[72,9],[77,72],[83,38],[90,12],[97,54]];

export function NightSky({ paused }) {
  return <div className="night-sky" data-paused={paused} aria-hidden="true">
    <svg className="skyline" width="100%" height="84">
      <defs><pattern id="city-block" width="260" height="84" patternUnits="userSpaceOnUse">
        <path fill="#191342" d="M0 84V59h12V46h16v13h12V28h7V18h3v10h9v45h13V49h13V34h14v15h9v15h15V22h8V10h2v12h11v44h14V42h20v13h12V32h18v40h10V50h15v12h16v-8h11v30Z"/>
        <path fill="#ffe169" d="M18 51h3v4h-3zM45 39h3v4h-3zM89 42h3v4h-3zM135 32h3v4h-3zM194 47h3v4h-3zM227 57h3v4h-3z"/>
        <path fill="#64f4c8" d="M52 54h3v4h-3zM79 56h3v4h-3zM128 43h3v4h-3zM166 52h3v4h-3zM200 41h3v4h-3z"/>
      </pattern></defs>
      <rect width="100%" height="100%" fill="url(#city-block)"/>
    </svg>
    {[0,1,2,3,4,5].map(i => <svg key={i} className={'cloud cloud-'+i} viewBox="0 0 90 24"><path fill="#241b56" d="M0 23v-5h7v-5h10V9h8V4h8V1h14v4h7v6h7V8h11v4h8v6h10v5Z"/><path fill="#48346e" opacity=".42" d="M17 13V9h8V4h8V1h14v3H34v3h-7v5h-8v3Z"/></svg>)}
    {stars.map(([x,y], i) => <svg key={x} className="sky-star" style={{left:x+'%',top:y+'%',color:['#fff','#64f4c8','#ffe169'][i%3],width:4+i%5,animationDuration:(2+i%3)+'s',animationDelay:-i*.43+'s'}} viewBox="0 0 10 10"><path fill="currentColor" d="M4 0h2v3h1v1h3v2H7v1H6v3H4V7H3V6H0V4h3V3h1Z"/></svg>)}
    <div className="diner"><img src="/diner.webp" alt=""/><i/></div>
  </div>;
}

export function Burst() {
  return <svg className="burst" viewBox="0 0 32 32" aria-hidden="true"><path d="m4 15 2-11m7 15 8-12m-2 20 10-4" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
}

export function Friends() {
  return <svg className="friends" width="48" height="32" viewBox="0 0 48 32" shapeRendering="crispEdges" aria-hidden="true">
    {[[0,7,'#f96b6b'],[30,7,'#64f4c8'],[15,2,'#ffe169']].map(([x,y,color]) =>
      <g key={x} transform={`translate(${x} ${y})`} fill={color} stroke="#0e0c2e" strokeWidth="2">
        <path d="M1 23v-5h2v-3h4v-2h4v2h4v3h2v5Z"/>
        <path d="M4 3h2V1h6v2h2v7h-2v2H6v-2H4Z"/>
        <path fill="#fff" opacity=".65" stroke="none" d="M6 4h4v2H6zm-2 13h3v2H4z"/>
      </g>)}
  </svg>;
}
