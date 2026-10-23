if (import.meta.env.DEV) {
  import("react-grab");
}

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
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
const NORMAL_SECONDARY_CALCULATION = 'max(0, 59 - (life_expectancy - remaining_days / 365.2425))';
const NORMAL_SECONDARY_LABEL = 'years left for productive age (59)';
const DEFAULT_LAYOUT = { template: 'normal', mainFormat: 'YY years WW weeks', counterMode: 'rotate', secondaryEnabled: true, secondaryCalculation: NORMAL_SECONDARY_CALCULATION, secondaryLabel: NORMAL_SECONDARY_LABEL, showFamilyGrid: false, quoteItems: makeQuoteItems(quotes) };
const ROTATION_INTERVAL_MS = 45_000;
const SECONDARY_EXAMPLES = [
  { formula: 'max(0, 65 - (life_expectancy - remaining_days / 365.2425))', explanation: 'Whole years until age 65. At age 65 or older, the result is 0.' },
  { formula: 'remaining_days * (5 / 7)', explanation: 'Approximate weekdays remaining, using five weekdays in each seven-day week. Holidays are not excluded.' },
  { formula: 'remaining_days * 5', explanation: 'Prayer count remaining when the rate is five prayers per day.' },
  { formula: 'remaining_days * (2 / 7)', explanation: 'Apply a two-per-week rate across the remaining days.' },
];
const MUSLIM_LAYOUT = { ...DEFAULT_LAYOUT, template: 'muslim', mainFormat: 'YY years DD days', counterMode: 'countdown', secondaryCalculation: 'remaining_days * 5', secondaryLabel: 'prayers', quoteItems: makeQuoteItems(muslimQuotes) };
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
    const legacyNormalDefaults = template === 'normal' && saved.secondaryCalculation === 'remaining_days' && saved.secondaryLabel === 'sunsets';
    return {
      ...preset,
      ...saved,
      counterMode: template === 'custom' ? (saved.counterMode || (saved.countUp ? 'countup' : 'countdown')) : preset.counterMode,
      secondaryCalculation: legacyNormalDefaults ? NORMAL_SECONDARY_CALCULATION : (saved.secondaryCalculation || `remaining_days * (${Number(saved.secondaryMultiplier ?? 1) || 0})`).replace(/\bdays\b/g, 'remaining_days'),
      secondaryLabel: legacyNormalDefaults ? NORMAL_SECONDARY_LABEL : (saved.secondaryLabel || preset.secondaryLabel),
      mainFormat: template === 'custom' ? (saved.mainFormat || DEFAULT_LAYOUT.mainFormat) : DEFAULT_LAYOUT.mainFormat,
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
  }).replace(/(\d) ([A-Za-z]+)/g, '$1\u00a0$2');
};
const calculateSecondary = (source, remainingDays, lifeExpectancy) => {
  const text = String(source ?? '').trim();
  const tokens = text.match(/(?:\d+(?:\.\d*)?|\.\d+)|remaining_days|life_expectancy|max|min|[(),+\-*/]/gi) || [];
  if (!text || tokens.join('').toLowerCase() !== text.replace(/\s+/g, '').toLowerCase()) {
    return { error: 'Use numbers, remaining_days, life_expectancy, max(), min(), +, -, *, /, commas, and parentheses.' };
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
    if (token.toLowerCase() === 'max' || token.toLowerCase() === 'min') {
      const operation = token.toLowerCase();
      if (tokens[position++] !== '(') throw new Error(`Add an opening parenthesis after ${operation}.`);
      const first = expression();
      if (tokens[position++] !== ',') throw new Error('Separate function values with a comma.');
      const second = expression();
      if (tokens[position++] !== ')') throw new Error('Add a closing parenthesis.');
      return operation === 'max' ? Math.max(first, second) : Math.min(first, second);
    }
    if (token.toLowerCase() === 'remaining_days') return remainingDays;
    if (token.toLowerCase() === 'life_expectancy') return lifeExpectancy;
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return Number(token);
    throw new Error('Expected a number, variable, function, or parentheses.');
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
const QR_PART_SIZE = 620;
const QR_ROTATION_INTERVAL_MS = 900;
const QR_VERSION = 20;
const encodeBase64 = value => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let start=0; start<bytes.length; start+=0x8000) binary += String.fromCharCode(...bytes.subarray(start,start+0x8000));
  return btoa(binary);
};
const decodeBase64 = value => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, character=>character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
const checksum = value => {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) { hash ^= byte; hash = Math.imul(hash,0x01000193) >>> 0; }
  return hash.toString(16).padStart(8,'0');
};
function App() {
  const [profile, setProfile] = useState(() => { const p=readProfile(); return p ? {...p,id:p.id || 'primary'} : null; });
  const [profiles, setProfiles] = useState(readProfiles);
  const [settings, setSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncModal, setSyncModal] = useState(null);
  const [syncImport, setSyncImport] = useState(null);
  const [syncError, setSyncError] = useState('');
  const [syncTab, setSyncTab] = useState('file');
  const [qrMode, setQrMode] = useState('send');
  const [qrTransfer, setQrTransfer] = useState(null);
  const [qrIndex, setQrIndex] = useState(0);
  const [qrImage, setQrImage] = useState('');
  const [qrParts, setQrParts] = useState({});
  const [qrStatus, setQrStatus] = useState('');
  const [qrScanActive, setQrScanActive] = useState(false);
  const [qrScanError, setQrScanError] = useState('');
  const videoRef = React.useRef(null);
  const scanCanvasRef = React.useRef(null);
  const scanFrameRef = React.useRef(0);
  const qrPartsRef = React.useRef({});
  const completedQrRef = React.useRef(new Set());
  const [manageFamilyOpen, setManageFamilyOpen] = useState(false);
  const [deleteFamilyTarget, setDeleteFamilyTarget] = useState(null);
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
  const [rotationDisplayCountUp, setRotationDisplayCountUp] = useState(false);
  const [rotationPhase, setRotationPhase] = useState('steady');
  const [quote, setQuote] = useState(() => dailyQuoteFor(readProfile(), false, readLayout().quoteItems));
  const syncData = useMemo(() => ({ app: 'Someday', formatVersion: 1, exportedAt: new Date().toISOString(), activeProfileId: profile?.id || null, profile, profiles, layout }), [profile, profiles, layout]);
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
  const openSyncModal = mode => { setMenuOpen(false); setSyncError(''); setSyncImport(null); setSyncTab('file'); setQrMode('send'); setQrTransfer(null); setQrImage(''); setQrStatus(''); setQrScanActive(false); qrPartsRef.current={}; completedQrRef.current.clear(); setQrParts({}); setSyncModal(mode); };
  const downloadCurrentData = () => {
    const blob = new Blob([JSON.stringify(syncData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `someday-backup-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const acceptSyncPayload = data => {
    setSyncError(''); setSyncImport(null);
    try {
      if (data?.app !== 'Someday' || data?.formatVersion !== 1) throw new Error('This file is not a supported Someday backup.');
      const sourceProfiles = Array.isArray(data.profiles) ? data.profiles : data.profile ? [data.profile] : [];
      if (!sourceProfiles.length) throw new Error('This backup does not contain any profiles.');
      const importedProfiles = sourceProfiles.map((person, index) => {
        const birthYear = Number(person?.birthYear);
        const expectancy = Number(person?.expectancy);
        if (!person || typeof person !== 'object' || birthYear < 1900 || birthYear > currentYear || expectancy < 1 || expectancy > 120) throw new Error('A profile has invalid birth year or life expectancy data.');
        return { ...person, id: String(person.id || (index === 0 ? 'primary' : `member-${index+1}`)), name: typeof person.name === 'string' ? person.name : '', birthYear, expectancy };
      });
      if (new Set(importedProfiles.map(person => person.id)).size !== importedProfiles.length) throw new Error('This backup contains duplicate profile IDs.');
      const sourceLayout = data.layout && typeof data.layout === 'object' && !Array.isArray(data.layout) ? data.layout : {};
      const template = ['normal','muslim','custom'].includes(sourceLayout.template) ? sourceLayout.template : 'normal';
      const importedLayout = {
        ...(template === 'muslim' ? MUSLIM_LAYOUT : DEFAULT_LAYOUT), ...sourceLayout, template,
        mainFormat: typeof sourceLayout.mainFormat === 'string' ? sourceLayout.mainFormat : DEFAULT_LAYOUT.mainFormat,
        counterMode: ['countdown','countup','rotate'].includes(sourceLayout.counterMode) ? sourceLayout.counterMode : 'countdown',
        secondaryCalculation: (typeof sourceLayout.secondaryCalculation === 'string' ? sourceLayout.secondaryCalculation : DEFAULT_LAYOUT.secondaryCalculation).slice(0,160).replace(/\bdays\b/g,'remaining_days'),
        secondaryLabel: typeof sourceLayout.secondaryLabel === 'string' ? sourceLayout.secondaryLabel.slice(0,40) : DEFAULT_LAYOUT.secondaryLabel,
        quoteItems: Array.isArray(sourceLayout.quoteItems) ? sourceLayout.quoteItems.filter(item => item && typeof item.text === 'string').map(item => ({ id: String(item.id || `quote-${Math.random()}`), text: item.text.slice(0,300), enabled: item.enabled !== false })) : makeQuoteItems(quotes),
      };
      const activeProfileId = importedProfiles.some(person => person.id === data.activeProfileId) ? data.activeProfileId : importedProfiles[0].id;
      setSyncImport({ profiles: importedProfiles, activeProfileId, layout: importedLayout });
      return true;
    } catch (error) { setSyncError(error.message || 'Could not read this JSON backup.'); return false; }
  };
  const readSyncFile = async file => {
    setSyncError(''); setSyncImport(null);
    if (!file) return;
    if (file.size > 2_000_000) { setSyncError('Choose a JSON file smaller than 2 MB.'); return; }
    try { acceptSyncPayload(JSON.parse(await file.text())); }
    catch (error) { setSyncError(error.message || 'Could not read this JSON backup.'); }
  };
  const handleQrChunk = async raw => {
    const match = /^SMD1\|([a-f0-9]{8})\|(\d+)\|(\d+)\|([a-f0-9]{8})\|([A-Za-z0-9+/=]+)$/.exec(raw);
    if (!match) return;
    const [, transferId, partText, totalText, digest, chunk] = match;
    const part=Number(partText), total=Number(totalText);
    if (!Number.isInteger(part)||!Number.isInteger(total)||total<1||total>5000||part<1||part>total) return;
    if (completedQrRef.current.has(transferId)) return;
    let transfer=qrPartsRef.current[transferId];
    if (!transfer || transfer.total!==total || transfer.digest!==digest) transfer={total,digest,parts:{}};
    const isNewPart=!transfer.parts[part];
    if (!isNewPart) return;
    transfer.parts[part]=chunk;
    qrPartsRef.current={...qrPartsRef.current,[transferId]:transfer};
    const count=Object.keys(transfer.parts).length;
    setQrParts({...transfer.parts}); setQrStatus(`Received ${count} of ${total} QR parts.`);
    if (count!==total) return;
    completedQrRef.current.add(transferId);
    try {
      const base64=Array.from({length:total},(_,i)=>transfer.parts[i+1]).join('');
      const json=decodeBase64(base64);
      if (checksum(json)!==digest) throw new Error('The completed QR backup failed its checksum. Scan the rotating codes again.');
      if(!acceptSyncPayload(JSON.parse(json))){delete qrPartsRef.current[transferId];setQrParts({});setQrScanActive(false);return;}
      setQrStatus('All parts received and verified. Review the restore confirmation below.');
      setQrScanActive(false);
    } catch (error) { completedQrRef.current.delete(transferId);delete qrPartsRef.current[transferId];setQrParts({});setQrErrorMessage(error.message || 'Could not assemble this QR backup.'); }
  };
  const setQrErrorMessage = message => { setSyncError(message); setQrScanActive(false); };
  const applySyncImport = () => {
    if (!syncImport) return;
    const active = syncImport.profiles.find(person => person.id === syncImport.activeProfileId) || syncImport.profiles[0];
    saveProfiles(syncImport.profiles); saveProfile(active); localStorage.setItem(LAYOUT_STORAGE, JSON.stringify(syncImport.layout));
    setProfiles(syncImport.profiles); setFamilyDrafts(syncImport.profiles); setProfile(active); setLayout(syncImport.layout); setCalculationDraft(syncImport.layout.secondaryCalculation); setSettings(false); setSyncModal(null); setSyncImport(null); setQrParts({}); qrPartsRef.current={}; completedQrRef.current.clear();
  };
  const resetQrScan = () => { setQrScanActive(false); setSyncImport(null); setSyncError(''); setQrStatus(''); setQrParts({}); qrPartsRef.current={}; completedQrRef.current.clear(); };
  const syncMenuActions = <><span className="menu-caption">SYNC</span><button role="menuitem" onClick={()=>openSyncModal('offline')}>Offline Sync</button><button role="menuitem" onClick={()=>openSyncModal('connect')}>EthiqsHub Connect</button></>;
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
  const deleteFamilyDraft = id => {
    const target = familyDrafts.find(person => person.id === id);
    if (!target || familyDrafts.length <= 1) return;
    const nextProfiles = familyDrafts.filter(person => person.id !== id).map(person => ({ ...person, birthYear: Number(person.birthDate?.slice(0,4) || person.birthYear) || currentYear - 30, expectancy: Number(person.expectancy) || estimated(person) }));
    saveProfiles(nextProfiles); setProfiles(nextProfiles); setFamilyDrafts(nextProfiles);
    if (profile?.id === id) { saveProfile(nextProfiles[0]); setProfile(nextProfiles[0]); }
  };
  const switchProfileFromManage = id => { persistFamilyDrafts(id); };
  const editLayout = (key, value) => setLayout(old => { const next={...old,[key]:value,template:'custom'}; localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next)); return next; });
  const selectLayoutTemplate = (template) => setLayout(old => { const next=template==='normal'?{...DEFAULT_LAYOUT}:template==='muslim'?{...MUSLIM_LAYOUT}:{...old,template:'custom'}; localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next)); return next; });
  const editQuote = (index, patch) => setLayout(old => { const quoteItems=[...old.quoteItems];quoteItems[index]={...quoteItems[index],...patch};const next={...old,quoteItems,template:'custom'};localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next));return next; });
  const addQuote = () => setLayout(old => { const quoteItems=[...old.quoteItems,{id:`quote-${Date.now()}`,text:'',enabled:true}];const next={...old,quoteItems,template:'custom'};localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next));return next; });
  const removeQuote = index => setLayout(old => { const quoteItems=old.quoteItems.filter((_,i)=>i!==index);const next={...old,quoteItems,template:'custom'};localStorage.setItem(LAYOUT_STORAGE,JSON.stringify(next));return next; });
  const copySecondaryExample = async formula => {
    try {
      await navigator.clipboard.writeText(formula);
      setExampleCopied(formula);
    } catch {
      const field = document.createElement('textarea');
      field.value = formula;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      setExampleCopied(document.execCommand('copy') ? formula : '');
      field.remove();
    }
    window.setTimeout(() => setExampleCopied(''), 1800);
  };
  useEffect(() => { setCalculationDraft(layout.secondaryCalculation || 'remaining_days'); }, [layout.secondaryCalculation]);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [secondaryExampleOpen, setSecondaryExampleOpen] = useState(false);
  const [exampleCopied, setExampleCopied] = useState('');
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
    if (!syncModal) return;
    document.querySelector('.sync-modal-close')?.focus();
    const closeOnEscape = event => { if (event.key === 'Escape') setSyncModal(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => { window.removeEventListener('keydown', closeOnEscape); document.querySelector('.sync-trigger')?.focus(); };
  }, [syncModal]);
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
  const desiredRotationCountUp = Math.floor((now - rotationStartedAt) / ROTATION_INTERVAL_MS) % 2 === 1;
  const countUp = layout.counterMode === 'countup' || (rotating && rotationDisplayCountUp);
  useEffect(() => {
    if (!rotating) {
      setRotationDisplayCountUp(false);
      setRotationPhase('steady');
      return;
    }
    if (desiredRotationCountUp === rotationDisplayCountUp) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRotationDisplayCountUp(desiredRotationCountUp);
      setRotationPhase('steady');
      return;
    }
    setRotationPhase('out');
    let finishTimer;
    const swapTimer = window.setTimeout(() => {
      setRotationDisplayCountUp(desiredRotationCountUp);
      setRotationPhase('in');
      finishTimer = window.setTimeout(() => setRotationPhase('steady'), 850);
    }, 450);
    return () => { window.clearTimeout(swapTimer); window.clearTimeout(finishTimer); };
  }, [rotating, desiredRotationCountUp]);
  useEffect(() => {
    if (syncModal!=='offline'||syncTab!=='qr'||qrMode!=='send') return;
    let cancelled=false;
    const json=JSON.stringify(syncData);
    const bytes=new Uint8Array(4); crypto.getRandomValues(bytes);
    const id=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
    const base64=encodeBase64(json);
    const chunks=base64.match(new RegExp(`.{1,${QR_PART_SIZE}}`,'g'))||[''];
    if(chunks.length>5000){setSyncError('This backup is too large to transfer by QR code. Use the backup file tab instead.');return;}
    setQrTransfer(null); setQrImage(''); setQrIndex(0); setSyncError('');
    const transfer={id,digest:checksum(json),chunks};
    if(!cancelled)setQrTransfer(transfer);
    return ()=>{cancelled=true;};
  },[syncModal,syncTab,qrMode,syncData]);
  useEffect(() => {
    if(syncModal!=='offline'||syncTab!=='qr'||qrMode!=='send'||!qrTransfer?.chunks.length)return;
    const timer=window.setInterval(()=>setQrIndex(index=>(index+1)%qrTransfer.chunks.length),QR_ROTATION_INTERVAL_MS);
    return ()=>window.clearInterval(timer);
  },[syncModal,syncTab,qrMode,qrTransfer]);
  useEffect(() => {
    if(syncModal!=='offline'||syncTab!=='qr'||qrMode!=='send'||!qrTransfer)return;
    const payload=`SMD1|${qrTransfer.id}|${qrIndex+1}|${qrTransfer.chunks.length}|${qrTransfer.digest}|${qrTransfer.chunks[qrIndex]}`;
    let active=true;
    QRCode.toDataURL(payload,{version:QR_VERSION,errorCorrectionLevel:'M',margin:2,width:340,color:{dark:'#181915',light:'#ffffff'}})
      .then(url=>{if(active)setQrImage(url);})
      .catch(()=>{if(active)setSyncError('Could not create this QR code. Try the backup file tab.');});
    return ()=>{active=false;};
  },[syncModal,syncTab,qrMode,qrTransfer,qrIndex]);
  useEffect(() => {
    if(syncModal!=='offline'||syncTab!=='qr'||qrMode!=='scan'||!qrScanActive)return;
    let stream;
    let disposed=false;
    const startCamera=async()=>{
      try {
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera scanning needs a secure browser context (HTTPS or localhost).');
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        if(disposed){stream.getTracks().forEach(track=>track.stop());return;}
        const video=videoRef.current;
        if(!video)return;
        video.srcObject=stream;
        await video.play();
        const canvas=scanCanvasRef.current;
        const context=canvas?.getContext('2d',{willReadFrequently:true});
        let lastScanAt=0;
        const scan=()=>{
          if(disposed||!context||!video.videoWidth){scanFrameRef.current=requestAnimationFrame(scan);return;}
          const timestamp=performance.now();
          if(timestamp-lastScanAt<100){scanFrameRef.current=requestAnimationFrame(scan);return;}
          lastScanAt=timestamp;
          const width=640, height=Math.round(width*video.videoHeight/video.videoWidth);
          canvas.width=width;canvas.height=height;context.drawImage(video,0,0,width,height);
          const image=context.getImageData(0,0,width,height);
          const decoded=jsQR(image.data,width,height,{inversionAttempts:'dontInvert'});
          if(decoded?.data)handleQrChunk(decoded.data);
          scanFrameRef.current=requestAnimationFrame(scan);
        };
        scanFrameRef.current=requestAnimationFrame(scan);
      } catch(error) { if(!disposed)setQrScanError(error.message||'Camera access was unavailable.'); }
    };
    startCamera();
    return ()=>{disposed=true;cancelAnimationFrame(scanFrameRef.current);if(stream)stream.getTracks().forEach(track=>track.stop());if(videoRef.current)videoRef.current.srcObject=null;};
  },[syncModal,syncTab,qrMode,qrScanActive]);
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
  const secondaryDays = activeStats.days;
  const secondaryLifeExpectancy = Number(profile?.expectancy) || 0;
  const mainYears = countUp ? activeStats.elapsed/365.2425 : activeStats.years;
  const secondaryResult = calculateSecondary(layout.secondaryCalculation, secondaryDays, secondaryLifeExpectancy);
  const secondaryCount = Math.floor(Math.max(0, secondaryResult.error ? 0 : secondaryResult.value));
  const calculationDraftResult = calculateSecondary(calculationDraft, secondaryDays, secondaryLifeExpectancy);
  const updateCalculationDraft = value => {
    setCalculationDraft(value);
    const result = calculateSecondary(value, secondaryDays, secondaryLifeExpectancy);
    if (!result.error) editLayout('secondaryCalculation', value);
  };
  const remainPct = 100 - pct;
  const countryName = LIFE[profile?.country]?.[0] || 'your selected country';
  const dataValue = profile ? (profile.gender === 'female' ? LIFE[profile.country]?.[2] : profile.gender === 'male' ? LIFE[profile.country]?.[1] : Math.round((LIFE[profile.country]?.[1] + LIFE[profile.country]?.[2]) / 2)) : 0;

  const syncModalMarkup = syncModal && <div className="modal-backdrop sync-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSyncModal(null);}}><section className="confirm-modal sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title"><header className="sync-modal-header"><div><span className="label-muted">SYNC</span><h2 id="sync-title">{syncModal==='offline'?'Offline Sync':'EthiqsHub Connect'}</h2></div><button type="button" className="modal-close sync-modal-close" onClick={()=>setSyncModal(null)} aria-label="Close sync">×</button></header>{syncModal==='offline' ? <div className="sync-content"><div className="sync-tabs" role="tablist" aria-label="Offline sync methods"><button type="button" role="tab" aria-selected={syncTab==='file'} className={syncTab==='file'?'active':''} onClick={()=>{setSyncTab('file');setQrScanActive(false);}}>Backup file</button><button type="button" role="tab" aria-selected={syncTab==='qr'} className={syncTab==='qr'?'active':''} onClick={()=>{setSyncTab('qr');setQrMode('send');setQrStatus('');setQrScanError('');setSyncError('');qrPartsRef.current={};completedQrRef.current.clear();setQrParts({});}}>QR Code</button></div>{syncTab==='file' ? <><p>Save a backup of your Someday profiles and layout, or restore them from a JSON file.</p><button type="button" className="primary sync-download" onClick={downloadCurrentData}>Download Current Data <span>↓</span></button><details className="sync-json"><summary>View JSON data</summary><pre>{JSON.stringify(syncData,null,2)}</pre></details><hr/><label className="sync-dropzone" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();readSyncFile(event.dataTransfer.files?.[0]);}}><input type="file" accept=".json,application/json" onChange={event=>readSyncFile(event.target.files?.[0])}/><strong>Drop a backup JSON here</strong><span>or click to choose a file</span></label></> : <><div className="qr-mode-tabs" role="tablist" aria-label="QR transfer mode"><button type="button" role="tab" aria-selected={qrMode==='send'} className={qrMode==='send'?'active':''} onClick={()=>{setQrMode('send');setQrScanActive(false);setQrScanError('');setQrStatus('');setSyncError('');}}>Show QR</button><button type="button" role="tab" aria-selected={qrMode==='scan'} className={qrMode==='scan'?'active':''} onClick={()=>{setQrMode('scan');setQrScanActive(false);setQrScanError('');setQrStatus('');setSyncError('');qrPartsRef.current={};completedQrRef.current.clear();setQrParts({});setSyncImport(null);}}>Scan QR</button></div>{qrMode==='send' ? <div className="qr-sender"><p>Open Someday on the receiving device, choose <b>Scan QR</b>, and scan this screen. Keep the QR visible until all parts are collected.</p><div className="qr-stage">{qrImage ? <img src={qrImage} alt="Someday backup QR code"/> : <div className="qr-placeholder" aria-live="polite">Preparing backup…</div>}</div><strong className="qr-progress-label" aria-live="polite">{qrTransfer ? `Part ${qrIndex+1} of ${qrTransfer.chunks.length}` : 'Preparing backup…'}</strong></div> : <div className="qr-scanner">{!qrScanActive && !syncImport && <p>Allow camera access, then point this device at the rotating QR codes on the sending screen. The parts collect automatically.</p>}<video ref={videoRef} className={qrScanActive?'scanner-video active':'scanner-video'} muted playsInline/><canvas ref={scanCanvasRef} className="scanner-canvas"/><div className="scanner-actions">{!qrScanActive && !syncImport && <button type="button" className="primary" onClick={()=>{setQrScanError('');setQrScanActive(true);}}>Start camera scanner</button>}{qrScanActive && <button type="button" className="confirm-cancel" onClick={()=>setQrScanActive(false)}>Stop scanning</button>}</div><p className="qr-progress-label" aria-live="polite">{qrStatus||'No QR parts received yet.'}</p>{qrScanError && <p className="sync-error" role="alert">{qrScanError}</p>}<p className="qr-part-count">Parts collected: {Object.keys(qrParts).length}</p></div>}</>}{syncError && <p className="sync-error" role="alert">{syncError}</p>}{syncImport && <div className="sync-import-confirm"><p>Ready to restore <b>{syncImport.profiles.length}</b> {syncImport.profiles.length===1?'profile':'profiles'}. This replaces the Someday data currently saved on this device.</p><div className="confirm-actions">{qrMode==='scan' ? <button type="button" className="confirm-cancel" onClick={resetQrScan}>Start over</button> : <button type="button" className="confirm-cancel" onClick={()=>setSyncImport(null)}>Cancel</button>}<button type="button" className={qrMode==='scan'?'primary':'primary danger-action'} onClick={applySyncImport}>{qrMode==='scan' ? 'Restore' : 'Replace local data'}</button></div></div>}</div> : <div className="sync-content"><p>EthiqsHub Connect is coming soon.</p></div>}</section></div>;

  if (!profile || settings) return <><main className="onboard-shell">
    <header className="brand-row"><a className="wordmark" href="#" onClick={e => {e.preventDefault(); if(profile) setSettings(false);}} aria-label="Someday home">someday<span>.</span></a><div className="settings-wrap"><button className="settings-button sync-trigger" onClick={()=>setMenuOpen(open=>!open)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="Sync menu"><svg className="settings-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.7 9A7 7 0 0 1 18 6.5L20 12M4 12l2 5.5A7 7 0 0 0 18.3 15"/></svg><span className="settings-label">Sync</span></button>{menuOpen && <div className="settings-menu" role="menu" aria-label="Sync">{syncMenuActions}</div>}</div></header>
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
  </main>{syncModalMarkup}</>;

  return <><main className={`dashboard ${introTransition ? `intro-underlay ${transitionFade ? 'visible' : ''}` : hasArrived ? 'has-arrived' : ''}`} style={{'--progress':`${pct}%`}}>
    <div className="dash-top"><a className="wordmark" href="#"><span className="brand-name">someday</span><span className="brand-period">.</span></a><div className="settings-wrap"><button className="settings-button sync-trigger" onClick={()=>setMenuOpen(open=>!open)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="Settings menu"><svg className="settings-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6M7 14v6"/></svg><span className="settings-label">Settings</span></button>{menuOpen && <div className="settings-menu" role="menu" aria-label="Settings"><button role="menuitem" onClick={()=>{setMenuOpen(false);setStartOverConfirm(true);}}>Start over</button><button role="menuitem" onClick={()=>{setMenuOpen(false);setLayoutOpen(true);}}>Customize layout</button><button role="menuitem" onClick={openManageFamily}>Manage family</button><div className="menu-divider"/>{syncMenuActions}</div>}</div></div>
    {layout.showFamilyGrid && profiles.length ? <section className="family-grid-view" aria-label="Family countdowns"><div className={`family-grid ${profiles.length>4?'scrollable':''}`}>{profiles.map((person,index)=>{const stats=getPersonStats(person);const result=calculateSecondary(layout.secondaryCalculation,stats.days,Number(person.expectancy)||0);const value=Math.floor(Math.max(0,result.error?0:result.value));return <article className="family-card" key={person.id||index}><span className="family-name">{person.name||'Family member'}</span><span className="family-label">{countUp?'TIME LIVED SO FAR':'TIME REMAINING'}</span><strong className={rotating?`rotation-${rotationPhase}`:''}>{formatCountdown(layout.mainFormat,stats.years,countUp?stats.elapsed:stats.days)}</strong>{layout.secondaryEnabled && <small>{value.toLocaleString('en-US')} {layout.secondaryLabel}</small>}<span className="family-progress"><i style={{width:`${stats.percent}%`}}/></span><span className="family-percent">{Math.round(stats.percent)}% lived · {Math.round(100-stats.percent)}% remaining</span></article>})}</div>{quote && <blockquote>“{quote}”</blockquote>}</section> : <section className="minimal-dashboard" aria-label="Life countdown">
      <div className={`countdown-reading ${rotating?`rotation-reading rotation-${rotationPhase}`:''} ${countUp?'mode-lived':'mode-remaining'}`}>
        <span className="minimal-label">{countUp ? (profile.name ? `Hi ${profile.name}, time lived so far` : 'Time lived so far') : (profile.name ? `Hi ${profile.name}, your estimated time remaining` : 'Your estimated time remaining')}</span>
        <div className="minimal-time">{formatCountdown(layout.mainFormat,mainYears,mainDays)}</div>
        {layout.secondaryEnabled && <p className="sunsets">{secondaryCount.toLocaleString('en-US')} {layout.secondaryLabel}.</p>}
      </div>
      <div className="minimal-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100" aria-label="Estimated time lived and remaining"><span className="lived-bar" style={{width:`${pct}%`}}/></div>
      <div className="minimal-progress-labels"><span>{pct.toFixed(0)}% lived</span><span>{remainPct.toFixed(0)}% remaining</span></div>
      {quote && <blockquote>“{quote}”</blockquote>}
      <details className="number-note"><summary>About this estimate</summary><p>Based on life expectancy at birth for {countryName} ({dataValue} years, UN World Population Prospects 2024{profile.manual?' · edited by you':''}). This is a population statistic, not a personal prediction. It is not a conditional life-table estimate for someone who has already reached your current age.</p><p>You can change this estimate anytime by clicking <b>Settings</b>.</p></details>
    </section>}
  </main>{startOverConfirm && <div className="modal-backdrop confirm-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setStartOverConfirm(false);}}><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="start-over-title" aria-describedby="start-over-copy"><span className="label-muted">START FRESH</span><h2 id="start-over-title">Are you sure?</h2><p id="start-over-copy">This will clear all Someday data saved on this device, including your profiles, family members, layout, and quotes, then start onboarding again.</p><div className="confirm-actions"><button className="confirm-cancel" onClick={()=>setStartOverConfirm(false)}>Cancel</button><button className="primary danger-action" onClick={confirmStartOver}>Clear and start over</button></div></section></div>}{layoutOpen && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setLayoutOpen(false);}}><section className="layout-modal" role="dialog" aria-modal="true" aria-labelledby="layout-title"><header className="modal-header"><div><span className="label-muted">MAKE IT YOURS</span><h2 id="layout-title">Customize layout</h2></div><button className="modal-close" onClick={()=>setLayoutOpen(false)} aria-label="Close customize layout">×</button></header><div className="modal-content"><section className="layout-group"><h3>Template</h3><div className="preset-grid">{[['normal','Normal','Years, weeks, target age'],['muslim','Muslim Mode','Years, days, prayers'],['custom','Custom','Your own settings']].map(([value,title,sub])=><button key={value} className={`preset-card ${layout.template===value?'selected':''}`} aria-pressed={layout.template===value} onClick={()=>selectLayoutTemplate(value)}><strong>{title}</strong><small>{sub}</small></button>)}</div></section><section className="layout-group"><h3>Main countdown</h3><label htmlFor="main-format">Display format</label><input id="main-format" value={layout.mainFormat} onChange={event=>editLayout('mainFormat',event.target.value)} placeholder="YY years DD days"/><p className="modal-help"><b>YY</b> years · <b>MM</b> months · <b>WW</b> weeks · <b>DD</b> days. Units are calculated left to right; if you omit a larger unit, its time rolls into the next one. Months use an average length. Example: <span>{formatCountdown(layout.mainFormat,mainYears,mainDays)}</span></p><label htmlFor="counter-mode">Display mode</label><select id="counter-mode" value={layout.counterMode} onChange={event=>{setRotationStartedAt(Date.now());editLayout('counterMode',event.target.value);}}><option value="countdown">Count down</option><option value="countup">Count up</option><option value="rotate">Rotate every 45 seconds</option></select><p className="modal-help">Rotate switches between time remaining and time lived every 45 seconds.</p></section><section className="layout-group"><h3>Secondary countdown</h3><label className="check-row"><input type="checkbox" checked={layout.secondaryEnabled} onChange={event=>editLayout('secondaryEnabled',event.target.checked)}/> Show secondary countdown</label><div className="modal-fields"><label>Calculation<input type="text" maxLength="160" spellCheck="false" autoCapitalize="off" value={calculationDraft} onChange={event=>updateCalculationDraft(event.target.value)} placeholder="remaining_days * (2 / 7)" aria-invalid={!!calculationDraftResult.error} aria-describedby="secondary-calculation-help"/></label><label>Counter label<input value={layout.secondaryLabel} onChange={event=>editLayout('secondaryLabel',event.target.value)} placeholder="sunsets"/></label></div>{calculationDraftResult.error ? <p className="calculation-error" id="secondary-calculation-help" role="alert">{calculationDraftResult.error}</p> : <p className="modal-help" id="secondary-calculation-help">Variables: <b>remaining_days</b> (days until the life expectancy baseline) and <b>life_expectancy</b> (the total baseline in years). <button type="button" className="example-link" onClick={()=>{setExampleCopied('');setSecondaryExampleOpen(true);}}>See formula example</button></p>}</section><section className="layout-group"><h3>Layout</h3><label className="check-row"><input type="checkbox" checked={layout.showFamilyGrid} onChange={event=>editLayout('showFamilyGrid',event.target.checked)}/> Show all family members in a grid</label></section><section className="layout-group quote-group"><h3>Daily quotes</h3><p className="modal-help">Choose which reflections can appear, or add your own.</p>{layout.quoteItems.map((item,index)=><div className="quote-editor-row" key={item.id || index}><input type="checkbox" aria-label={`Enable quote ${index+1}`} checked={item.enabled} onChange={event=>editQuote(index,{enabled:event.target.checked})}/><input aria-label={`Quote ${index+1} text`} value={item.text} onChange={event=>editQuote(index,{text:event.target.value})} placeholder="Write a short reflection"/><button className="remove-quote" onClick={()=>removeQuote(index)} aria-label={`Remove quote ${index+1}`}>×</button></div>)}<button className="add-quote" onClick={addQuote}>+ Add a quote</button></section></div><footer className="modal-footer"><button className="primary" onClick={()=>setLayoutOpen(false)} disabled={layout.secondaryEnabled && !!calculationDraftResult.error}>Done</button></footer></section></div>}{secondaryExampleOpen && <div className="modal-backdrop example-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSecondaryExampleOpen(false);}}><section className="confirm-modal example-modal" role="dialog" aria-modal="true" aria-labelledby="secondary-example-title"><button type="button" className="modal-close example-close" onClick={()=>setSecondaryExampleOpen(false)} aria-label="Close formula examples">×</button><span className="label-muted">SECONDARY COUNTDOWN</span><h2 id="secondary-example-title">Formula examples</h2><p>Choose an example and copy its formula into the Calculation field.</p><div className="example-table-wrap"><table className="example-table"><thead><tr><th scope="col">Formula</th><th scope="col">Explanation</th></tr></thead><tbody>{SECONDARY_EXAMPLES.map(example=><tr key={example.formula}><td><code>{example.formula}</code><button type="button" className="example-copy" onClick={()=>copySecondaryExample(example.formula)}>{exampleCopied===example.formula?'Copied':'Copy'}</button></td><td>{example.explanation}</td></tr>)}</tbody></table></div><div className="confirm-actions"><button className="confirm-cancel" onClick={()=>setSecondaryExampleOpen(false)}>Close</button></div></section></div>}{manageFamilyOpen && <div className="modal-backdrop family-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setManageFamilyOpen(false);}}><section className="layout-modal family-modal" role="dialog" aria-modal="true" aria-labelledby="family-title"><header className="modal-header"><div><span className="label-muted">YOUR PEOPLE</span><h2 id="family-title">Manage family</h2></div><button className="modal-close family-modal-close" onClick={()=>{persistFamilyDrafts();setManageFamilyOpen(false);}} aria-label="Close manage family">×</button></header><div className="modal-content family-modal-content">{familyDrafts.map((person,index)=><section className="family-edit-card" key={person.id}><header><div><strong>{person.name || `Family member ${index+1}`}</strong><small>{person.id===profile.id?'CURRENT PROFILE':'FAMILY PROFILE'}</small></div><div className="family-card-actions"><button className="family-switch" onClick={()=>switchProfileFromManage(person.id)} disabled={person.id===profile.id}>{person.id===profile.id?'Current profile':'Switch profile'}</button><button className="family-delete" type="button" onClick={()=>setDeleteFamilyTarget(person)} disabled={familyDrafts.length<=1} title={familyDrafts.length<=1?"Keep at least one profile":"Remove this profile"}>Remove</button></div></header><div className="family-edit-fields"><label>Name<input type="text" maxLength="40" value={person.name||''} onChange={event=>updateFamilyDraft(person.id,'name',event.target.value)} placeholder="Name"/></label><label>Birth year<input type="number" min="1900" max={currentYear} value={person.birthYear} onChange={event=>updateFamilyDraft(person.id,'birthYear',event.target.value)}/></label><label>Full birth date <span className="optional-label">OPTIONAL</span><input type="date" max={new Date().toISOString().slice(0,10)} value={person.birthDate||''} onChange={event=>updateFamilyDraft(person.id,'birthDate',event.target.value)}/></label><label>Country<select value={person.country||'ID'} onChange={event=>updateFamilyDraft(person.id,'country',event.target.value)}>{countries.map(([code,[name]])=><option value={code} key={code}>{name}</option>)}</select></label><label>Statistic<select value={person.gender||'skip'} onChange={event=>updateFamilyDraft(person.id,'gender',event.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="skip">Skip / average</option></select></label><label>Life expectancy<input type="number" min="1" max="120" value={person.expectancy} onChange={event=>updateFamilyDraft(person.id,'expectancy',event.target.value)}/></label></div></section>)}<button className="add-family-profile" onClick={addFamilyDraft}>+ Add family member</button></div><footer className="modal-footer"><button className="primary" onClick={()=>{persistFamilyDrafts();setManageFamilyOpen(false);}}>Save changes</button></footer></section></div>}{deleteFamilyTarget && <div className="modal-backdrop confirm-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setDeleteFamilyTarget(null);}}><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-profile-title" aria-describedby="delete-profile-copy"><span className="label-muted">REMOVE PROFILE</span><h2 id="delete-profile-title">Remove {deleteFamilyTarget.name?.trim() || 'this profile'}?</h2><p id="delete-profile-copy">This profile and its details will be removed from this device. You can’t undo this action.</p><div className="confirm-actions"><button className="confirm-cancel" onClick={()=>setDeleteFamilyTarget(null)}>Cancel</button><button className="primary danger-action" onClick={()=>{deleteFamilyDraft(deleteFamilyTarget.id);setDeleteFamilyTarget(null);}}>Remove profile</button></div></section></div>}{introTransition && <div className={`transition-screen ${transitionFade ? 'fade-out' : ''}`} aria-live="polite"><span>{typedTagline}<i aria-hidden="true"/></span></div>}{syncModalMarkup}</>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
