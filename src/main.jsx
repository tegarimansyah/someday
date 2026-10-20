if (import.meta.env.DEV) {
  import("react-grab");
}

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Rounded 2023 estimates, based on UN World Population Prospects 2024 country tables.
// Kept local so onboarding works offline. Users can always enter their own baseline.
const LIFE = {
  ID: ['Indonesia', 71, 75], IN: ['India', 71, 74], US: ['United States', 76, 81],
  GB: ['United Kingdom', 79, 83], AU: ['Australia', 82, 85], CA: ['Canada', 80, 84],
  JP: ['Japan', 82, 88], SG: ['Singapore', 82, 86], MY: ['Malaysia', 73, 78],
  PH: ['Philippines', 68, 75], TH: ['Thailand', 73, 81], VN: ['Vietnam', 70, 79],
  KR: ['South Korea', 81, 87], CN: ['China', 75, 81], NZ: ['New Zealand', 81, 85],
  DE: ['Germany', 79, 84], FR: ['France', 80, 86], NL: ['Netherlands', 80, 84],
  BR: ['Brazil', 73, 80], MX: ['Mexico', 72, 78], NG: ['Nigeria', 53, 56],
  ZA: ['South Africa', 62, 69], AE: ['United Arab Emirates', 79, 82],
  ES: ['Spain', 81, 87], IT: ['Italy', 81, 85], SE: ['Sweden', 82, 85],
};
const quotes = [
  'The time is already yours. Begin with one small thing.',
  'You do not need a perfect plan to take a first step.',
  'Make today a little more like the life you want.',
  'A good life is built in ordinary afternoons.',
  'Start before you feel ready. Let the next step find you.',
  'What matters can have a place on today’s calendar.',
  'The smallest beginning still changes the direction.',
];
const muslimQuotes = [
  'Let your intention give today its direction.',
  'Make room for gratitude in the day you have.',
  'Patience is built one steady step at a time.',
  'Begin with a good intention, then take one small step.',
];
const makeQuoteItems = items => items.map((text, index) => ({ id: `quote-${index + 1}`, text, enabled: true }));
const STORAGE = 'someday.profile.v1';
const FAMILY_STORAGE = 'someday.family.v1';
const LAYOUT_STORAGE = 'someday.layout.v1';
const DEFAULT_LAYOUT = { template: 'normal', mainFormat: 'YY years DD days', counterMode: 'countdown', secondaryEnabled: true, secondaryCalculation: 'days', secondaryLabel: 'sunsets', showFamilyGrid: false, quoteItems: makeQuoteItems(quotes) };
const MUSLIM_LAYOUT = { ...DEFAULT_LAYOUT, template: 'muslim', mainFormat: 'YY years DD days', secondaryCalculation: 'days * 5', secondaryLabel: 'prayers', quoteItems: makeQuoteItems(muslimQuotes) };
const currentYear = new Date().getFullYear();
const readProfile = () => { try { return JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch { return null; } };
const saveProfile = (p) => { localStorage.setItem(STORAGE, JSON.stringify(p)); };
const readProfiles = () => { try { const saved = JSON.parse(localStorage.getItem(FAMILY_STORAGE) || 'null'); return Array.isArray(saved) ? saved.map((person,index)=>({...person,id:person.id || (index===0?'primary':`member-${index+1}`)})) : (readProfile() ? [{...readProfile(),id:'primary'}] : []); } catch { return readProfile() ? [{...readProfile(),id:'primary'}] : []; } };
const saveProfiles = (p) => localStorage.setItem(FAMILY_STORAGE, JSON.stringify(p));
const readLayout = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE) || '{}');
    const template = saved.template || DEFAULT_LAYOUT.template;
    const preset = template === 'muslim' ? MUSLIM_LAYOUT : DEFAULT_LAYOUT;
    return {
      ...preset,
      ...saved,
      counterMode: saved.counterMode || (saved.countUp ? 'countup' : 'countdown'),
      secondaryCalculation: saved.secondaryCalculation || `days * (${Number(saved.secondaryMultiplier ?? 1) || 0})`,
      mainFormat: template === 'custom' ? (saved.mainFormat || DEFAULT_LAYOUT.mainFormat) : 'YY years DD days',
      quoteItems: Array.isArray(saved.quoteItems) ? saved.quoteItems : makeQuoteItems(template === 'muslim' ? muslimQuotes : quotes),
    };
  } catch { return DEFAULT_LAYOUT; }
};
const formatCountdown = (format, _years, days) => {
  let remainingDays = Math.max(0, Math.floor(Number(days) || 0));
  const units = { Y: 365.2425, M: 365.2425 / 12, W: 7, D: 1 };
  return String(format || '').replace(/Y+|M+|W+|D+/g, token => {
    const unit = units[token[0]];
    const count = Math.floor(remainingDays / unit);
    remainingDays -= count * unit;
    return String(count).padStart(token.length > 1 ? token.length : 1, '0');
  });
};
const calculateSecondary = (source, days) => {
  const text = String(source ?? '').trim();
  const tokens = text.match(/(?:\d+(?:\.\d*)?|\.\d+)|days|[()+\-*/]/gi) || [];
  if (!text || tokens.join('').toLowerCase() !== text.replace(/\s+/g, '').toLowerCase()) {
    return { error: 'Use numbers, “days”, +, -, *, /, and parentheses.' };
  }
  let position = 0;
  const primary = () => {
    const token = tokens[position++];
    if (token === undefined) throw new Error('Incomplete expression.');
    if (token === '(') {
      const value = expression();
      if (tokens[position++] !== ')') throw new Error('Add a closing parenthesis.');
      return value;
    }
    if (token.toLowerCase() === 'days') return days;
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return Number(token);
    throw new Error('Expected a number, “days”, or parentheses.');
  };
  const unary = () => {
    if (tokens[position] === '+') { position++; return unary(); }
    if (tokens[position] === '-') { position++; return -unary(); }
    return primary();
  };
  const term = () => {
    let value = unary();
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++];
      const right = unary();
      if (operator === '/' && right === 0) throw new Error('Cannot divide by zero.');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const expression = () => {
    let value = term();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  try {
    const value = expression();
    if (position !== tokens.length) return { error: 'Check the expression syntax.' };
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return { error: 'The result is too large.' };
    if (value < 0) return { error: 'The result cannot be negative.' };
    return { value };
  } catch (error) {
    return { error: error.message || 'Check the expression syntax.' };
  }
};
const dailyQuoteFor = (person, muslim, quoteItems) => {
  const pool = (Array.isArray(quoteItems) ? quoteItems : makeQuoteItems(muslim ? muslimQuotes : quotes)).filter(item => item.enabled && item.text.trim());
  if (!pool.length) return null;
  const seed = [person?.id, person?.name, person?.birthYear].filter(Boolean).join('|') || 'someday';
  const hash = Array.from(seed).reduce((value,char)=>(value * 31 + char.charCodeAt(0)) >>> 0, 7);
  return pool[(hash + Math.floor(Date.now() / 86400000)) % pool.length].text;
};
function App() {
  const [profile, setProfile] = useState(() => { const p=readProfile(); return p ? {...p,id:p.id || 'primary'} : null; });
  const [profiles, setProfiles] = useState(readProfiles);
  const [settings, setSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageFamilyOpen, setManageFamilyOpen] = useState(false);
  const [familyDrafts, setFamilyDrafts] = useState(() => readProfiles());
  const [startOverConfirm, setStartOverConfirm] = useState(false);
  const [flowMode, setFlowMode] = useState('start');
  const [layout, setLayout] = useState(readLayout);
  const [calculationDraft, setCalculationDraft] = useState(() => readLayout().secondaryCalculation);
  const muslimMode = layout.template === 'muslim';
  const [introTransition, setIntroTransition] = useState(false);
  const [transitionFade, setTransitionFade] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  const [typedTagline, setTypedTagline] = useState('');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({ name: '', country: 'ID', gender: '', birthYear: '', expectancy: '', manual: false });
  const [now, setNow] = useState(Date.now());
  const [rotationStartedAt, setRotationStartedAt] = useState(Date.now());
  const [quote, setQuote] = useState(() => dailyQuoteFor(readProfile(), false, readLayout().quoteItems));
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    setQuote(dailyQuoteFor(profile, muslimMode, layout.quoteItems));
  }, [muslimMode, profile?.id, profile?.name, profile?.birthYear, layout.quoteItems]);
  useEffect(() => {
    if (!introTransition) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIntroTransition(false); setHasArrived(true); return;
    }
    const line = "Don't wait for someday.";
    let cursor = 0;
    let holdTimer;
    let fadeTimer;
    setTransitionFade(false);
    setTypedTagline('');
    const typeTimer = setInterval(() => {
      cursor += 1;
      setTypedTagline(line.slice(0, cursor));
      if (cursor >= line.length) {
        clearInterval(typeTimer);
        holdTimer = setTimeout(() => {
          setTransitionFade(true);
          fadeTimer = setTimeout(() => { setIntroTransition(false); setHasArrived(true); }, 550);
        }, 700);
      }
    }, 30);
    return () => { clearInterval(typeTimer); clearTimeout(holdTimer); clearTimeout(fadeTimer); };
  }, [introTransition]);
  const countries = Object.entries(LIFE).sort((a,b) => a[1][0].localeCompare(b[1][0]));
  const estimated = (d) => {
    const v = LIFE[d.country] || LIFE.ID;
    return d.gender === 'female' ? v[2] : d.gender === 'male' ? v[1] : Math.round((v[1] + v[2]) / 2);
  };
  const start = (existing = null, mode = 'start') => {
    setDraft(existing ? { ...existing, name: existing.name || '', birthYear: String(existing.birthYear), expectancy: String(existing.expectancy) } : { name: '', country: 'ID', gender: '', birthYear: '', expectancy: '', manual: false });
    setFlowMode(mode); setMenuOpen(false); setStep(0); setSettings(true); setProfile(null);
  };
  const confirmStartOver = () => {
    localStorage.removeItem(STORAGE);
    localStorage.removeItem(FAMILY_STORAGE);
    localStorage.removeItem(LAYOUT_STORAGE);
    setProfiles([]); setFamilyDrafts([]); setLayout({ ...DEFAULT_LAYOUT, quoteItems: makeQuoteItems(quotes) });
    setStartOverConfirm(false);
    start(null, 'restart');
  };
  const change = (key, val) => setDraft(d => {
    const next = { ...d, [key]: val };
    if ((key === 'country' || key === 'gender') && !d.manual) next.expectancy = String(estimated(next));
    return next;
  });
  const finish = () => {
    const p = { id: draft.id || (flowMode === 'add' ? `family-${Date.now()}` : profile?.id || 'primary'), name: draft.name.trim(), country: draft.country || 'ID', gender: draft.gender || 'skip', birthYear: Number(draft.birthYear), expectancy: Number(draft.expectancy) || estimated(draft), manual: !!draft.manual, updatedAt: Date.now() };
    const nextProfiles = flowMode === 'add' ? [...profiles, p] : flowMode === 'restart' ? [p] : profiles.some(item => item.id === p.id) ? profiles.map(item => item.id === p.id ? p : item) : [p, ...profiles];
    saveProfiles(nextProfiles); setProfiles(nextProfiles); saveProfile(p); setProfile(p); setSettings(false); setIntroTransition(true);
  };
  const selectProfile = (p) => { setProfile(p); saveProfile(p); setMenuOpen(false); };
  const openManageFamily = () => { setFamilyDrafts(profiles.map(person => ({ ...person }))); setMenuOpen(false); setManageFamilyOpen(true); };
  const updateFamilyDraft = (id, key, value) => setFamilyDrafts(items => items.map(person => {
    if (person.id !== id) return person;
    const next = { ...person, [key]: value };
    if (key === 'birthDate' && value) next.birthYear = Number(value.slice(0, 4));
    if (key === 'birthYear' && person.birthDate) next.birthDate = '';
    if ((key === 'country' || key === 'gender') && !person.manual) next.expectancy = estimated(next);
    if (key === 'expectancy') next.manual = true;
    return next;
  }));
  const addFamilyDraft = () => {
    const person = { id: `family-${Date.now()}`, name: '', country: 'ID', gender: 'skip', birthYear: currentYear - 30, birthDate: '', expectancy: estimated({ country: 'ID', gender: 'skip' }), manual: false };
    setFamilyDrafts(items => [...items, person]);
  };
  const persistFamilyDrafts = (activeId = profile?.id) => {
    const nextProfiles = familyDrafts.map(person => ({ ...person, birthYear: Number(person.birthDate?.slice(0,4) || person.birthYear) || currentYear - 30, expectancy: Number(person.expectancy) || estimated(person) }));
    saveProfiles(nextProfiles); setProfiles(nextProfiles);
    const active = nextProfiles.find(person => person.id === activeId) || nextProfiles[0];
    if (active) { saveProfile(active); setProfile(active); }
    return nextProfiles;
  };
  const switchProfileFromManage = id => { persistFamilyDrafts(id); };
  const editLayout = (key, value) => setLayout(old => { const next={...old,[key]:value,template:'custom'}; localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next)); return next; });
  const selectLayoutTemplate = (template) => setLayout(old => { const next=template==='normal'?{...DEFAULT_LAYOUT}:template==='muslim'?{...MUSLIM_LAYOUT}:{...old,template:'custom'}; localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next)); return next; });
  const editQuote = (index, patch) => setLayout(old => { const quoteItems=[...old.quoteItems];quoteItems[index]={...quoteItems[index],...patch};const next={...old,quoteItems,template:'custom'};localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next));return next; });
  const addQuote = () => setLayout(old => { const quoteItems=[...old.quoteItems,{id:`quote-${Date.now()}`,text:'',enabled:true}];const next={...old,quoteItems,template:'custom'};localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next));return next; });
  const removeQuote = index => setLayout(old => { const quoteItems=old.quoteItems.filter((_,i)=>i!==index);const next={...old,quoteItems,template:'custom'};localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next));return next; });
  useEffect(() => { setCalculationDraft(layout.secondaryCalculation || 'days'); }, [layout.secondaryCalculation]);
  const [layoutOpen, setLayoutOpen] = useState(false);
  useEffect(() => {
    if (!layoutOpen) return;
    document.querySelector('.modal-close')?.focus();
    const closeOnEscape = event => { if (event.key === 'Escape') setLayoutOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.querySelector('.settings-button')?.focus();
    };
  }, [layoutOpen]);
  useEffect(() => {
    if (!manageFamilyOpen) return;
    document.querySelector('.family-modal-close')?.focus();
    const closeOnEscape = event => { if (event.key === 'Escape') setManageFamilyOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.querySelector('.settings-button')?.focus();
    };
  }, [manageFamilyOpen]);
  useEffect(() => {
    if (!startOverConfirm) return;
    document.querySelector('.confirm-cancel')?.focus();
    const closeOnEscape = event => { if (event.key === 'Escape') setStartOverConfirm(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.querySelector('.settings-button')?.focus();
    };
  }, [startOverConfirm]);
  const rotating = layout.counterMode === 'rotate';
  const countUp = layout.counterMode === 'countup' || (rotating && Math.floor((now - rotationStartedAt) / 10000) % 2 === 1);
  const getPersonStats = (person) => {
    const [birthMonth, birthDay] = person.birthDate ? person.birthDate.slice(5).split('-').map(Number) : [1, 1];
    const birthYear = Number(person.birthYear) || currentYear;
    const startDate = new Date(birthYear, birthMonth - 1, birthDay);
    const endDate = new Date(birthYear + Number(person.expectancy || 0), birthMonth - 1, birthDay);
    const days = Math.max(0,Math.floor((endDate.getTime()-now)/86400000));
    const elapsed = Math.max(0,Math.floor((now-startDate.getTime())/86400000));
    const years = countUp ? elapsed/365.2425 : days/365.2425;
    const totalDays = Math.max(1, Math.floor((endDate.getTime()-startDate.getTime())/86400000));
    const percent = Math.min(100,Math.max(0,elapsed/totalDays*100));
    return {days,elapsed,years,percent};
  };
  useEffect(() => { setRotationStartedAt(Date.now()); }, [layout.counterMode]);
  const daysLeft = profile ? Math.max(0, Math.floor((new Date(profile.birthYear + profile.expectancy, 0, 1).getTime() - now) / 86400000)) : 0;
  const yearsLeft = daysLeft / 365.2425;
  const lived = profile ? Math.max(0, currentYear - profile.birthYear) : 0;
  const fallbackPct = profile ? Math.min(100, Math.max(0, lived / profile.expectancy * 100)) : 0;
  const activeStats = profile ? getPersonStats(profile) : {days:daysLeft,elapsed:lived*365,years:yearsLeft,percent:fallbackPct};
  const pct = activeStats.percent;
  const mainDays = countUp ? activeStats.elapsed : activeStats.days;
  const secondaryDays = rotating ? activeStats.days : mainDays;
  const mainYears = countUp ? activeStats.elapsed/365.2425 : activeStats.years;
  const secondaryResult = calculateSecondary(layout.secondaryCalculation, secondaryDays);
  const secondaryCount = Math.floor(Math.max(0, secondaryResult.error ? 0 : secondaryResult.value));
  const calculationDraftResult = calculateSecondary(calculationDraft, secondaryDays);
  const updateCalculationDraft = value => {
    setCalculationDraft(value);
    const result = calculateSecondary(value, secondaryDays);
    if (!result.error) editLayout('secondaryCalculation', value);
  };
  const remainPct = 100 - pct;
  const countryName = LIFE[profile?.country]?.[0] || 'your selected country';
  const dataValue = profile ? (profile.gender === 'female' ? LIFE[profile.country]?.[2] : profile.gender === 'male' ? LIFE[profile.country]?.[1] : Math.round((LIFE[profile.country]?.[1] + LIFE[profile.country]?.[2]) / 2)) : 0;

  if (!profile || settings) return <main className="onboard-shell">
    <header className="brand-row"><a className="wordmark" href="#" onClick={e => {e.preventDefault(); if(profile) setSettings(false);}} aria-label="Someday home">someday<span>.</span></a></header>
    <div className="onboarding">
      <h1>{step === 0 ? <>Start with<br/><em>where you are.</em></> : step === 1 ? <>A little context<br/><em>for the picture.</em></> : <>Make it<br/><em>your own.</em></>}</h1>
      <p className="intro">{step === 0 ? 'We’ll use public life expectancy statistics to shape a personal countdown. You can skip any demographic estimate.' : step === 1 ? 'Your birth year helps us set a gentle baseline. We never need your full birthday.' : 'This is a population average, not a prediction. Adjust it to the number that feels useful to you.'}</p>
      <div className="step-dots" aria-label={`Step ${step + 1} of 3`}>{[0,1,2].map(i=><span key={i} className={i===step?'active':''}/>)}</div>
      <section className="form-card" key={step}>
        {step === 0 && <div className="form-content">
          <label htmlFor="country">Where do you call home?</label>
          <select id="country" value={draft.country} onChange={e=>change('country',e.target.value)}>{countries.map(([code,[name]])=><option value={code} key={code}>{name}</option>)}</select>
          <fieldset><legend>Which statistic should we use?</legend><div className="choice-grid">
            {[['female','Female'],['male','Male'],['skip','Skip / use average']].map(([v,label])=><button type="button" key={v} className={`choice ${draft.gender===v?'selected':''}`} onClick={()=>change('gender',v)} aria-pressed={draft.gender===v}>{label}</button>)}
          </div></fieldset>
          <p className="micro">Used only to choose a population statistic. This is about the data category, not your identity.</p>
        </div>}
        {step === 1 && <div className="form-content identity-fields">
          <label htmlFor="name">What should we call you? <span className="optional-label">OPTIONAL</span></label><input id="name" type="text" autoComplete="given-name" maxLength="40" placeholder="Your name" value={draft.name} onChange={e=>change('name',e.target.value)}/>
          <label htmlFor="birth" className="birth-label">What year were you born?</label><input id="birth" inputMode="numeric" type="number" min="1900" max={currentYear} placeholder="e.g. 1994" value={draft.birthYear} onChange={e=>change('birthYear',e.target.value)}/>
          <p className="micro">Your name is optional. Your name and birth year stay on this device.</p>
        </div>}
        {step === 2 && <div className="form-content">
          <div className="estimate-head"><div><span className="label-muted">STARTING ESTIMATE · {countryName.toUpperCase()}</span><strong>{draft.expectancy || estimated(draft)} <small>years</small></strong></div><button className="text-button" onClick={()=>setDraft(d=>({...d,manual:!d.manual}))}>{draft.manual?'Use statistic':'Edit estimate'}</button></div>
          <label htmlFor="expectancy">Life expectancy baseline</label><div className="number-unit"><input id="expectancy" type="number" min="1" max="120" value={draft.expectancy || estimated(draft)} onChange={e=>setDraft(d=>({...d,expectancy:e.target.value,manual:true}))}/><span>years</span></div>
          <p className="source-note">{draft.gender === 'skip' ? 'Average of female and male estimates' : `UN World Population Prospects 2024 · ${draft.gender || 'average'} · 2023`}<br/><a href="https://population.un.org/wpp/" target="_blank" rel="noreferrer">View source ↗</a></p>
          <div className="caveat"><span>ⓘ</span><p>This is <b>life expectancy at birth</b> for a population, not your personal forecast. The countdown below is a simple planning baseline. It is not a conditional life-table estimate for someone who has already reached your age.</p></div>
        </div>}
        <div className="form-actions">{step > 0 && <button className="back-button" onClick={()=>setStep(s=>s-1)}>Back</button>}{step < 2 ? <button className="primary" onClick={()=>setStep(s=>s+1)} disabled={step===1 && (!draft.birthYear || Number(draft.birthYear)<1900 || Number(draft.birthYear)>currentYear)}>Continue <span>↗</span></button> : <button className="primary" onClick={finish}>See your someday <span>↗</span></button>}</div>
      </section>
      <p className="privacy">Your details stay on this device.</p>
    </div>
  </main>;

  return <><main className={`dashboard ${introTransition ? `intro-underlay ${transitionFade ? 'visible' : ''}` : hasArrived ? 'has-arrived' : ''}`} style={{'--progress':`${pct}%`}}>
    <div className="dash-top"><a className="wordmark" href="#"><span className="brand-name">someday</span><span className="brand-period">.</span></a><div className="settings-wrap"><button className="settings-button" onClick={()=>setMenuOpen(open=>!open)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="Settings menu"><svg className="settings-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6M7 14v6"/></svg><span className="settings-label">Settings</span></button>{menuOpen && <div className="settings-menu" role="menu" aria-label="Settings"><button role="menuitem" onClick={()=>{setMenuOpen(false);setStartOverConfirm(true);}}>Start over</button><button role="menuitem" onClick={()=>{setMenuOpen(false);setLayoutOpen(true);}}>Customize layout</button><button role="menuitem" onClick={openManageFamily}>Manage family</button></div>}</div></div>
    {layout.showFamilyGrid && profiles.length ? <section className="family-grid-view" aria-label="Family countdowns"><div className="family-grid">{profiles.map((person,index)=>{const stats=getPersonStats(person);const result=calculateSecondary(layout.secondaryCalculation,rotating?stats.days:countUp?stats.elapsed:stats.days);const value=Math.floor(Math.max(0,result.error?0:result.value));return <article className="family-card" key={person.id||index}><span className="family-name">{person.name||'Family member'}</span><span className="family-label">{countUp?'TIME LIVED SO FAR':'TIME REMAINING'}</span><strong>{formatCountdown(layout.mainFormat,stats.years,countUp?stats.elapsed:stats.days)}</strong>{layout.secondaryEnabled && <small>{value.toLocaleString('en-US')} {layout.secondaryLabel} {countUp&&!rotating?'counted':'left'}</small>}<span className="family-progress"><i style={{width:`${stats.percent}%`}}/></span><span className="family-percent">{Math.round(stats.percent)}% lived · {Math.round(100-stats.percent)}% remaining</span></article>})}</div>{quote && <blockquote>“{quote}”</blockquote>}</section> : <section className="minimal-dashboard" aria-label="Life countdown">
      <span className="minimal-label">{countUp ? (profile.name ? `Hi ${profile.name}, time lived so far` : 'Time lived so far') : (profile.name ? `Hi ${profile.name}, your estimated time remaining` : 'Your estimated time remaining')}</span>
      <div className="minimal-time">{formatCountdown(layout.mainFormat,mainYears,mainDays)}</div>
      {layout.secondaryEnabled && <p className="sunsets">{secondaryCount.toLocaleString('en-US')} {layout.secondaryLabel} {countUp&&!rotating?'counted':'left'}.</p>}
      <div className="minimal-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100" aria-label="Estimated time lived and remaining"><span className="lived-bar" style={{width:`${pct}%`}}/></div>
      <div className="minimal-progress-labels"><span>{pct.toFixed(0)}% lived</span><span>{remainPct.toFixed(0)}% remaining</span></div>
      {quote && <blockquote>“{quote}”</blockquote>}
      <details className="number-note"><summary>About this estimate</summary><p>Based on life expectancy at birth for {countryName} ({dataValue} years, UN World Population Prospects 2024{profile.manual?' · edited by you':''}). This is a population statistic, not a personal prediction. It is not a conditional life-table estimate for someone who has already reached your current age.</p><p>You can change this estimate anytime by clicking <b>Settings</b>.</p></details>
    </section>}
  </main>{startOverConfirm && <div className="modal-backdrop confirm-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setStartOverConfirm(false);}}><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="start-over-title" aria-describedby="start-over-copy"><span className="label-muted">START FRESH</span><h2 id="start-over-title">Are you sure?</h2><p id="start-over-copy">This will clear all Someday data saved on this device, including your profiles, family members, layout, and quotes, then start onboarding again.</p><div className="confirm-actions"><button className="confirm-cancel" onClick={()=>setStartOverConfirm(false)}>Cancel</button><button className="primary danger-action" onClick={confirmStartOver}>Clear and start over</button></div></section></div>}{layoutOpen && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setLayoutOpen(false);}}><section className="layout-modal" role="dialog" aria-modal="true" aria-labelledby="layout-title"><header className="modal-header"><div><span className="label-muted">MAKE IT YOURS</span><h2 id="layout-title">Customize layout</h2></div><button className="modal-close" onClick={()=>setLayoutOpen(false)} aria-label="Close customize layout">×</button></header><div className="modal-content"><section className="layout-group"><h3>Template</h3><div className="preset-grid">{[['normal','Normal','Years, days, sunsets'],['muslim','Muslim Mode','Years, days, prayers'],['custom','Custom','Your own settings']].map(([value,title,sub])=><button key={value} className={`preset-card ${layout.template===value?'selected':''}`} aria-pressed={layout.template===value} onClick={()=>selectLayoutTemplate(value)}><strong>{title}</strong><small>{sub}</small></button>)}</div></section><section className="layout-group"><h3>Main countdown</h3><label htmlFor="main-format">Display format</label><input id="main-format" value={layout.mainFormat} onChange={event=>editLayout('mainFormat',event.target.value)} placeholder="YY years DD days"/><p className="modal-help"><b>YY</b> years · <b>MM</b> months · <b>WW</b> weeks · <b>DD</b> days. Units are calculated left to right; if you omit a larger unit, its time rolls into the next one. Months use an average length. Example: <span>{formatCountdown(layout.mainFormat,mainYears,mainDays)}</span></p><label htmlFor="counter-mode">Display mode</label><select id="counter-mode" value={layout.counterMode} onChange={event=>{setRotationStartedAt(Date.now());editLayout('counterMode',event.target.value);}}><option value="countdown">Count down</option><option value="countup">Count up</option><option value="rotate">Rotate every 10 seconds</option></select><p className="modal-help">Rotate switches between time remaining and time lived every 10 seconds.</p></section><section className="layout-group"><h3>Secondary countdown</h3><label className="check-row"><input type="checkbox" checked={layout.secondaryEnabled} onChange={event=>editLayout('secondaryEnabled',event.target.checked)}/> Show secondary countdown</label><div className="modal-fields"><label>Calculation<input type="text" maxLength="160" spellCheck="false" autoCapitalize="off" value={calculationDraft} onChange={event=>updateCalculationDraft(event.target.value)} placeholder="days * (2 / 7)" aria-invalid={!!calculationDraftResult.error} aria-describedby="secondary-calculation-help"/></label><label>Counter label<input value={layout.secondaryLabel} onChange={event=>editLayout('secondaryLabel',event.target.value)} placeholder="sunsets"/></label></div>{calculationDraftResult.error ? <p className="calculation-error" id="secondary-calculation-help" role="alert">{calculationDraftResult.error}</p> : <p className="modal-help" id="secondary-calculation-help">Use <b>days</b> for the current time span. Example: <b>days * (2 / 7)</b> applies a two-per-week rate. At {secondaryDays.toLocaleString('en-US')} days, this gives {Math.floor(calculationDraftResult.value).toLocaleString('en-US')} {layout.secondaryLabel||'items'}. Results round down to whole items.</p>}</section><section className="layout-group"><h3>Layout</h3><label className="check-row"><input type="checkbox" checked={layout.showFamilyGrid} onChange={event=>editLayout('showFamilyGrid',event.target.checked)}/> Show all family members in a grid</label></section><section className="layout-group quote-group"><h3>Daily quotes</h3><p className="modal-help">Choose which reflections can appear, or add your own.</p>{layout.quoteItems.map((item,index)=><div className="quote-editor-row" key={item.id || index}><input type="checkbox" aria-label={`Enable quote ${index+1}`} checked={item.enabled} onChange={event=>editQuote(index,{enabled:event.target.checked})}/><input aria-label={`Quote ${index+1} text`} value={item.text} onChange={event=>editQuote(index,{text:event.target.value})} placeholder="Write a short reflection"/><button className="remove-quote" onClick={()=>removeQuote(index)} aria-label={`Remove quote ${index+1}`}>×</button></div>)}<button className="add-quote" onClick={addQuote}>+ Add a quote</button></section></div><footer className="modal-footer"><button className="primary" onClick={()=>setLayoutOpen(false)} disabled={layout.secondaryEnabled && !!calculationDraftResult.error}>Done</button></footer></section></div>}{manageFamilyOpen && <div className="modal-backdrop family-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setManageFamilyOpen(false);}}><section className="layout-modal family-modal" role="dialog" aria-modal="true" aria-labelledby="family-title"><header className="modal-header"><div><span className="label-muted">YOUR PEOPLE</span><h2 id="family-title">Manage family</h2></div><button className="modal-close family-modal-close" onClick={()=>{persistFamilyDrafts();setManageFamilyOpen(false);}} aria-label="Close manage family">×</button></header><div className="modal-content family-modal-content">{familyDrafts.map((person,index)=><section className="family-edit-card" key={person.id}><header><div><strong>{person.name || `Family member ${index+1}`}</strong><small>{person.id===profile.id?'CURRENT PROFILE':'FAMILY PROFILE'}</small></div><button className="family-switch" onClick={()=>switchProfileFromManage(person.id)} disabled={person.id===profile.id}>{person.id===profile.id?'Current profile':'Switch profile'}</button></header><div className="family-edit-fields"><label>Name<input type="text" maxLength="40" value={person.name||''} onChange={event=>updateFamilyDraft(person.id,'name',event.target.value)} placeholder="Name"/></label><label>Birth year<input type="number" min="1900" max={currentYear} value={person.birthYear} onChange={event=>updateFamilyDraft(person.id,'birthYear',event.target.value)}/></label><label>Full birth date <span className="optional-label">OPTIONAL</span><input type="date" max={new Date().toISOString().slice(0,10)} value={person.birthDate||''} onChange={event=>updateFamilyDraft(person.id,'birthDate',event.target.value)}/></label><label>Country<select value={person.country||'ID'} onChange={event=>updateFamilyDraft(person.id,'country',event.target.value)}>{countries.map(([code,[name]])=><option value={code} key={code}>{name}</option>)}</select></label><label>Statistic<select value={person.gender||'skip'} onChange={event=>updateFamilyDraft(person.id,'gender',event.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="skip">Skip / average</option></select></label><label>Life expectancy<input type="number" min="1" max="120" value={person.expectancy} onChange={event=>updateFamilyDraft(person.id,'expectancy',event.target.value)}/></label></div></section>)}<button className="add-family-profile" onClick={addFamilyDraft}>+ Add family member</button></div><footer className="modal-footer"><button className="primary" onClick={()=>{persistFamilyDrafts();setManageFamilyOpen(false);}}>Save changes</button></footer></section></div>}{introTransition && <div className={`transition-screen ${transitionFade ? 'fade-out' : ''}`} aria-live="polite"><span>{typedTagline}<i aria-hidden="true"/></span></div>}</>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
