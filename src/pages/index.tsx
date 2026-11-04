import { useEffect, useState } from 'react';
import VanScene, { heightCases, tags, type Annotation, type Body, type GantryLevel, type Layout, type Part, type Phase, type View } from '@/components/VanScene';
import './index.css';

type DeviceSpec = { title: string; items: string[]; status?: string };

const detail: Record<Part, DeviceSpec> = {
  beam: { title: 'Rear sensor carrier', items: ['Rear sensor mounting frame × 1', 'Mounting brackets and fasteners — size TBD'], status: 'Concept location from the corrected sketch; hardware dimensions are not specified.' },
  lidar: { title: 'LiDAR', items: ['Existing LiDAR units × 3', 'Sensor mounts × 3'], status: 'Models and dimensions need a physical inventory.' },
  cameras: { title: 'Camera mounts', items: ['Rigid camera mounts on the sensor frame', 'Cameras — count and models TBD'], status: 'The sheet does not give a camera count.' },
  gnss: { title: 'GPS / IMU', items: ['GPS / IMU set', 'Fixed mount on the sensor frame'], status: 'Receiver, antenna and IMU models TBD.' },
  pass: { title: 'Rear cable entries', items: ['Sealed rear roof cable entries × 2', 'Cable runs from both entries to the rear sensor carrier'], status: 'Two separate entries follow the PathRunner reference photo. Exact routing and roof cutouts TBD.' },
  frontCams: { title: 'Three forward cameras', items: ['Forward-facing cameras × 3', 'Low-profile roof rail and mounts'], status: 'Your correction: the front roof object is three cameras, not the A/C. Models and lens choice TBD.' },
  acRear: { title: 'Auxiliary roof A/C', items: ['Outequippro RV air conditioner, 12 V', 'Roof opening and cabin duct', 'Installation labor, 8 hr'], status: 'Quoted at $1,200 for the unit. Position has to be fixed in the drop-off strategy meeting so it leaves the rear roof clear for the phase-two carrier.' },
  seats: { title: 'Crew seats', items: ['Tim Van double captain seat kit', 'DOT-approved three-point belts', 'Pedestal legs and floor mounting'], status: 'Quoted on option B at $4,125 installed. Crew of four including driver and front passenger; a fifth jump seat was raised on 21 October as a later option.' },
  desk: { title: 'Operator workstation', items: ['Industrial tower PC × 1', '24 in 1920 × 1080 monitor × 1 with VESA arm', 'Removable 2 TB NVMe drives × 2', '120 V outlets × 4; USB-C ports × 4', 'Adjustable LED work lights × 2'], status: 'Desk and mounting dimensions TBD.' },
  rack: { title: 'Equipment rack / storage', items: ['NOTE: rear doors are blocked by the sensor frame, so this must load through the side door','Existing equipment rack — reuse if suitable', 'Overhead cabinet × 1', 'Fixed cable tray', 'Non-slip floor protection', 'Geotab terminal'], status: 'Rack size and inventory TBD. It currently sits aft of the side door aperture (which ends ~4.06 m), so either the rack moves forward or it has to be built up in place.' },
  power: { title: 'Independent power', items: ['Auxiliary battery bank', 'Vehicle DC-DC charger', 'Pure sine inverter — quoted at 5000 W', 'Separate UPS for the host PC'], status: 'Only the inverter and its cable kit are quoted. The battery bank, the charger and the UPS are not, so the 2-hour engine-off target on the sheet is unfunded as things stand.' },
  rqLidar: { title: 'Colour LiDAR', items: ['Colour LiDAR — model and quantity TBD'], status: 'Handwritten addition on sheet 03; whether it replaces an existing unit is undecided.' },
  rqGnss: { title: 'RTK / PPK GPS', items: ['RTK / PPK-capable GNSS receiver — model TBD'], status: 'Handwritten “very good GPS” / “RTK / PPK” on sheet 03.' },
  rqCamera: { title: 'High-quality camera', items: ['High-quality camera — model and quantity TBD'], status: 'Handwritten addition on sheet 03.' },
  rqDepth: { title: 'Depth camera', items: ['Depth camera — model and quantity TBD'], status: 'Handwritten addition on sheet 03.' },
  pvConsole: { title: 'Cab console rail', items: ['Floor-mounted rail between the front seats', 'Bolt pattern for arms and trays'], status: 'Fitted during the build. This is the base everything in the cab clips onto.' },
  pvScreen: { title: 'Passenger screen mount (later)', items: ['VESA arm on the console rail', 'Screen — added when needed'], status: 'Provisioned only. The arm mount and its bolt pattern go in now; the screen plugs in later.' },
  pvCable: { title: 'Reserved cable route', items: ['Cable trunking from the rack to the cab console', 'Spare capacity for a screen and keyboard run'], status: 'Pulled during the build so nothing has to be opened up later.' },
  pvPower: { title: 'Cab connector panel', items: ['Power and video outlets at the console', 'Spare ways left free'], status: 'Fitted with the rail so a screen needs one cable, not a rewire.' },
  rqTobii: { title: 'Eye tracking (Tobii)', items: ['Tobii eye-tracking device — model TBD'], status: 'Handwritten addition on sheet 03; cabin device.' },
  pgDeck: { title: 'Raised rear gantry', items: ['Cantilever frame above the rear roof', 'Diagonal support braces', 'Amber roof warning bars × 2'], status: 'Photo reference only; dimensions and structural design TBD.' },
  pgMast: { title: 'Elevated sensor housings', items: ['Upper sensor housings × 2', 'Center sensor / camera head'], status: 'The photo shows two large boxes above the roof; their instrument identities are unverified.' },
  pgPavement: { title: 'Pavement sensor bar', items: ['Low rear crossbar', 'Downward-looking pavement sensors — models TBD'], status: 'PathRunner reference option; not specified on our sheet.' },
  pgDmi: { title: 'DMI wheel encoder', items: ['Rear wheel DMI encoder'], status: 'PathRunner reference option; check the old van inventory before buying.' },
  p1Liner: { title: 'Wall, door and wheel liners', items: ['Legend Transit 148 HR thermal shield kit, 85 pc', 'Legend 744-114-2613.HR wall liner', 'Ford Transit HR DuraTherm door liner', 'Transit wheel liners, 2 pc'], status: 'Quoted. The vendor argued the A/C performs poorly without this, which is why insulation sits inside phase one at all. Panel extents follow the reference build; the kits are body-length specific and the body length is still unconfirmed.' },
  p1Ceiling: { title: 'Ceiling liner and lighting', items: ['Legend 745-114-2613.HR DuraTherm ceiling', 'Recessed LED downlights, from the reference build'], status: 'Ceiling panel is quoted. The downlights are shown because the reference build has them; they are not a line item on either quote.' },
  p1Seats: { title: 'Passenger seating, right wall', items: ['Tim Van double captain seat kit', 'DOT-approved three-point belts', 'Floor mounting and reinforcement'], status: 'Option B only, $4,125 installed. Drawn the way the reference photos place it: longitudinal along the right wall, seating surface facing the centre aisle, aft of the side-door aperture. The photo cuts off the backrest, so seat count, back height and belt positions are not drawn in and still need to be fixed with Patrick.' },
  p1Power: { title: 'Inverter and wiring', items: ['Go Power! 80179 pure sine inverter, 5000 W', 'Tauk 1/0 cable kit, 250 A fuse holder, 40 ft'], status: 'The ghosted box is the auxiliary battery, which neither quote contains. Without it the inverter has no source with the engine off. The 250 A fuse also caps the kit near 3 kW against a 5000 W inverter.' },
  pgFront: { title: 'Front bumper carrier', items: ['Front bumper carrier', 'RetroTek-D unit, if road-marking retroreflectivity is needed'], status: 'PathRunner reference option; not specified on our sheet.' },
};

const pathrunnerDetail: Partial<Record<Part, DeviceSpec>> = {
  beam: detail.pgDeck,
  lidar: { title: 'Upper sensing package', items: ['Two elevated sensor housings', 'Center sensor / camera head'], status: 'Positions follow the photo; instrument identities and models TBD.' },
  cameras: { title: 'Imaging subsystems', items: ['Forward imaging cameras', 'Rear-facing imaging cameras'], status: 'PathRunner reference option; quantities and models TBD.' },
  gnss: { title: 'GNSS / IMU', items: ['GNSS antennas', 'IMU'], status: 'PathRunner reference option; models TBD.' },
  pass: { title: 'Rear cable entries', items: ['Sealed rear roof cable entries × 2', 'Cable runs to the rear gantry'], status: 'Visible as two separate entries in the PathRunner reference photo; sizes TBD.' },
};

const lists: { title: string; items: Part[]; tone?: string; layouts?: Layout[] }[] = [
  { title: 'Roof / sensing', items: ['frontCams', 'beam', 'lidar', 'cameras', 'gnss', 'pass', 'acRear'] },
  { title: 'Cabin / systems', items: ['seats', 'desk', 'rack', 'power'] },
  { title: 'Provisioned now, used later', items: ['pvConsole', 'pvScreen', 'pvCable', 'pvPower'], tone: 'provision' },
  { title: 'Asked for by the group', items: ['rqLidar', 'rqGnss', 'rqCamera', 'rqDepth', 'rqTobii'], tone: 'requested' },
  { title: 'PathRunner reference rig', items: ['pgDeck', 'pgMast', 'pgPavement', 'pgDmi', 'pgFront'], tone: 'reference', layouts: ['sheet'] },
  { title: 'Also on the rig', items: ['pgPavement', 'pgDmi', 'pgFront'], tone: 'reference', layouts: ['pathrunner'] },
];

type QuoteLine = { name: string; ext: number };
type QuoteGroup = { title: string; lines: QuoteLine[]; seatsOnly?: boolean };

/* Leonard USA quotes 368-QUO-100610 and 368-QUO-100657, both dated 30 Oct 2026.
   Line items transcribed from the PDFs; the two quotes are identical apart from the seat kit. */
const quoteGroups: QuoteGroup[] = [
  { title: 'Air conditioning', lines: [
    { name: 'Outequippro RV air conditioner, 12 V', ext: 1200 },
  ] },
  { title: 'Insulation and liners', lines: [
    { name: 'Legend Transit 148 HR thermal shield kit, 85 pc', ext: 1500 },
    { name: 'Legend 744-114-2613.HR wall liner', ext: 1350 },
    { name: 'Legend 745-114-2613.HR DuraTherm ceiling', ext: 828 },
    { name: 'Ford Transit HR DuraTherm door liner', ext: 361 },
    { name: 'Transit wheel liners, 2 pc black', ext: 165 },
  ] },
  { title: 'Power', lines: [
    { name: 'Go Power! 80179 pure sine inverter, 5000 W', ext: 785 },
    { name: 'Tauk 1/0 battery cable kit, 250 A fuse holder, 40 ft', ext: 85 },
  ] },
  { title: 'Installation', lines: [
    { name: 'Installation labor, 14 hr at $75', ext: 1050 },
    { name: 'Installation supplies, 10 units', ext: 125 },
  ] },
  { title: 'Seating, option B only', seatsOnly: true, lines: [
    { name: 'Tim Van double captain seat kit, DOT-approved belts', ext: 3750 },
    { name: 'Installation labor, 5 hr at $75', ext: 375 },
  ] },
];

const quoteFacts: [string, string][] = [
  ['Parts lead time', 'about 1 week after order'],
  ['Installation', '3 to 4 days including their QC'],
  ['Layout strategy meeting', 'at drop-off, before work starts'],
  ['Quote expires', '29 Dec 2026'],
  ['Terms', 'Net 30, no sales tax shown'],
  ['Worktag', 'DE00030878'],
];

const openItems: { title: string; body: string; neutral?: boolean }[] = [
  { title: 'No house battery or charger is quoted', body: 'A 5000 W inverter is priced with no auxiliary battery bank, no DC-DC charger and no shore-power inlet. The old van carried two batteries. As quoted, the van cannot run the workstation with the engine off, which is what the requirement sheet asked for.' },
  { title: 'Inverter against its own wire kit', body: 'The quoted kit is 1/0 cable with a 250 A fuse, which supports roughly 3 kW at 12 V. A 5000 W inverter draws on the order of 400 to 500 A at full output. Ask Patrick what continuous load the install is sized for, and whether the fuse and cable match the inverter or the expected load. The separately priced upgraded-inverter option promised at the site visit is also not broken out; the base quote already jumped to 5000 W.' },
  { title: 'A/C must not take the phase-two roof', body: 'The site visit flagged that the A/C has to leave clearance for the rear sensor carrier. That depends on the sensor mounting height, which has not been sent to Patrick yet. Fix the roof position in the drop-off strategy meeting, not after.' },
  { title: 'Liner kits are body-length specific', body: 'The Legend parts read "Transit 148 HR". Both the 235.5 in and the 263.9 in bodies use the same 148 in wheelbase, so that part number does not confirm the fit. Confirm the kits match the actual body length before the order goes in.', neutral: true },
  { title: 'Shelving and workstation are not priced', body: 'The 21 October scope included compact modular shelving and possible reuse of the old desk. Neither quote contains them, so either they come later or they need to be added before the van goes in.', neutral: true },
  { title: 'Seat pricing has a second source', body: 'Option B adds $4,125 for two seats installed, about $2,063 each, with DOT-approved belts. MobilityWorks gave a verbal $1,100 to $1,300 per seat with labor unclear, and Kim Coots reached out on 19 October. Worth one written comparison before committing, against the saving of running a single vendor.', neutral: true },
];

const gtOwes = [
  'Send Patrick the reference photos and the sensor mounting height and geometry for the phase-two rear rack.',
  'Produce the electrical load and outlet estimate that the inverter sizing depends on.',
  'Read the old inverter label and settle the 800 W versus 1800 W discrepancy in the site-visit recordings.',
];

const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
const showPrices = params?.get('quote') === '1';
const startView = (['exterior', 'roof', 'plan', 'interior', 'rear'] as View[])
  .find(v => v === params?.get('view')) ?? 'exterior';
const startBody = (['extended', 'long'] as Body[])
  .find(v => v === params?.get('body')) ?? 'extended';
const savedPoints = (): Annotation[] => {
  try {
    const shared = new URLSearchParams(window.location.search).get('points');
    const value = JSON.parse(shared ?? localStorage.getItem('gtsv-custom-points') ?? '[]');
    return Array.isArray(value) ? value.filter(p => typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.point) && p.point.length === 3 && p.point.every((n: unknown) => typeof n === 'number') && ['exterior', 'roof', 'plan', 'interior', 'rear'].includes(p.view)) : [];
  } catch { return []; }
};

export default function Home() {
  const [view, setView] = useState<View>(startView);
  const [body, setBody] = useState<Body>(startBody);
  const [selected, setSelected] = useState<Part | null>(null);
  const [limit, setLimit] = useState(false);
  const [rearFrame, setRearFrame] = useState(false);
  const [requested, setRequested] = useState(false);
  const [doorSwing, setDoorSwing] = useState(false);
  const [provision, setProvision] = useState(true);
  const [layout, setLayout] = useState<Layout>('sheet');
  const [phase, setPhase] = useState<Phase>('phase1');
  const [gantryLevel, setGantryLevel] = useState<GantryLevel>('roof');
  const [panel, setPanel] = useState<'phase1' | 'layout' | 'dimensions' | 'sources'>('phase1');
  const [annotations, setAnnotations] = useState<Annotation[]>(savedPoints);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [copiedPoints, setCopiedPoints] = useState(false);
  useEffect(() => { setCopiedPoints(false); try { localStorage.setItem('gtsv-custom-points', JSON.stringify(annotations)); } catch { /* browser storage may be disabled */ } }, [annotations]);
  const heights = heightCases(body);
  const first = phase === 'phase1';
  const metres = (v: number) => `${v.toFixed(2)} m`;
  const money = (v: number) => showPrices ? `$${v.toLocaleString('en-US')}` : '$ — — —';
  const detailFor = (p: Part) => (layout === 'pathrunner' && pathrunnerDetail[p]) || detail[p];
  const length = body === 'extended' ? '263.9 in / 6.70 m' : '235.5 in / 5.98 m';
  const roofHeight = body === 'extended' ? '110.4 in / 2.80 m' : '109.6 in / 2.78 m';

  const choose = (part: Part) => {
    setSelected(previous => previous === part ? null : part);
    setSelectedAnnotation(null);
    setPanel('layout');
    const tone = tags[part].tone;
    if (tone === 'requested') setRequested(true);
    if (tone === 'reference') setRearFrame(true);
    if (tone === 'reference') setView('rear');
    else if (tags[part].views.includes('interior')) setView('interior');
    else if (view === 'interior' || view === 'rear') setView('roof');
  };
  const addAnnotation = (point: Annotation['point'], markView: View) => {
    const id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAnnotations(previous => [...previous, { id, name: `New item ${previous.length + 1}`, point, view: markView }]);
    setSelectedAnnotation(id);
    setSelected(null);
    setPanel('layout');
    setAddMode(false);
  };
  const moveAnnotation = (id: string, point: Annotation['point']) =>
    setAnnotations(previous => previous.map(item => item.id === id ? { ...item, point } : item));
  const copyPointsLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('points', JSON.stringify(annotations));
    try { await navigator.clipboard.writeText(url.toString()); setCopiedPoints(true); }
    catch { setCopiedPoints(false); }
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">GT</span><div><strong>Sensing Van</strong><small>Buildout review · Unit 503-1705</small></div></div>
      <span className="top-vin">2026 Transit-350 · VIN 1FTBW3X83TKA11541</span>
      <span className="status">Phase 1 quoted · decision open</span>
    </header>

    <main className="workspace">
      <section className="model-pane" aria-label="Vehicle model">
        <div className="viewer-wrap">
          <VanScene view={view} body={body} selected={selected} showLimit={limit} showRearFrame={rearFrame && !first} showRequested={requested && !first} showDoorSwing={doorSwing} showProvision={provision && !first} layout={first ? 'sheet' : layout} phase={phase} gantryLevel={gantryLevel} onSelect={choose}
            annotations={annotations} addMode={addMode} selectedAnnotation={selectedAnnotation} onAddAnnotation={addAnnotation} onMoveAnnotation={moveAnnotation}
            onSelectAnnotation={id => { setSelectedAnnotation(id); setSelected(null); setPanel('layout'); }} />
          <div className="stage-height">{first
            ? <><span>Phase 1 top</span><strong>≈ {metres(heights.ac)}</strong><small>roof A/C is the highest point</small></>
            : <><span>Scenario top</span><strong>≈ {metres(layout === 'sheet' ? heights.sheet : gantryLevel === 'roof' ? heights.pathrunner : heights.lowered)}</strong><small>2.60 m target exceeded</small></>}</div>
          <div className="view-controls" role="group" aria-label="Camera view">
            {([['exterior', '3D exterior'], ['roof', 'Roof'], ['plan', 'Plan'], ['interior', 'Interior'], ['rear', 'Rear sensors']] as [View, string][]).map(([key, name]) =>
              <button key={key} type="button" className={view === key ? 'active' : ''} onClick={() => { setView(key); if (key === 'rear') setRearFrame(true); }}>{name}</button>
            )}
          </div>
        </div>
        <div className="model-bottom">
          <button type="button" className={`add-point-button ${addMode ? 'active' : ''}`} aria-pressed={addMode} onClick={() => setAddMode(value => !value)}>{addMode ? 'Click on van…' : '+ Add point'}</button>
          <div className="variant" role="group" aria-label="Build scope">
            <span>Scope</span>
            <button type="button" className={first ? 'active' : ''} onClick={() => { setPhase('phase1'); setPanel('phase1'); setView('interior'); }}>Phase 1</button>
            <button type="button" className={!first ? 'active' : ''} onClick={() => setPhase('full')}>Full concept</button>
          </div>
          {!first && <div className="variant" role="group" aria-label="Sensor architecture">
            <span>Layout</span>
            <button type="button" className={layout === 'sheet' ? 'active' : ''} onClick={() => setLayout('sheet')}>Our sheet</button>
            <button type="button" className={layout === 'pathrunner' ? 'active' : ''} onClick={() => setLayout('pathrunner')}>PathRunner</button>
          </div>}
          <div className="variant" role="group" aria-label="Vehicle body length">
            <span>Body length</span>
            <button type="button" className={body === 'extended' ? 'active' : ''} onClick={() => setBody('extended')}>Extended · 263.9″</button>
            <button type="button" className={body === 'long' ? 'active' : ''} onClick={() => setBody('long')}>Long · 235.5″</button>
          </div>
          <label className="toggle"><input type="checkbox" checked={limit} onChange={e => setLimit(e.target.checked)} /> 2.60 m clearance plane</label>
          {!first && layout === 'sheet' && <label className="toggle gold"><input type="checkbox" checked={requested} onChange={e => setRequested(e.target.checked)} /> Requested upgrades</label>}
          <label className="toggle"><input type="checkbox" checked={doorSwing} onChange={e => setDoorSwing(e.target.checked)} /> Rear door swing</label>
          {!first && <label className="toggle"><input type="checkbox" checked={provision} onChange={e => setProvision(e.target.checked)} /> Cab provisioning</label>}
        </div>
        {!first && layout === 'pathrunner' && <div className="gantry-switch" role="group" aria-label="PathRunner crossarm height">
          <span>Gantry height</span>
            <button type="button" className={gantryLevel === 'roof' ? 'active' : ''} onClick={() => setGantryLevel('roof')}>Raised crossarm · {metres(heights.raisedBar)}</button>
            <button type="button" className={gantryLevel === 'lowered' ? 'active' : ''} onClick={() => setGantryLevel('lowered')}>Lower crossarm · {metres(heights.loweredDeck)}</button>
        </div>}
        {!first && <div className="height-compare" aria-label="Height comparison">
          <div><span>Bare high roof</span><strong>{metres(heights.roof)}</strong><small>Ford published</small></div>
          <div className={layout === 'sheet' ? 'active' : ''}><span>Sensors only</span><strong>≈ {metres(heights.sensors)}</strong><small>Lowered mounts; A/C not yet fitted</small></div>
          <div><span>With rear A/C</span><strong>≈ {metres(heights.ac)}</strong><small>Later addition, becomes the tallest</small></div>
          <div className={layout === 'pathrunner' && gantryLevel === 'roof' ? 'active' : ''}><span>Raised rear gantry</span><strong>≈ {metres(heights.pathrunner)}</strong><small>Photo proportions; unmeasured</small></div>
          <div className={layout === 'pathrunner' && gantryLevel === 'lowered' ? 'active' : ''}><span>Lowered gantry</span><strong>≈ {metres(heights.lowered)}</strong><small>A/C remains highest</small></div>
        </div>}
        {first
          ? <div className="design-conflict"><strong>Phase one only.</strong> No rear carrier, no sensors and no workstation: this is what Leonard quoted on 30 October. The gold patch on the rear roof is the area held clear for the phase-two sensor carrier, and the translucent volumes inside are the shelving and worktop that were discussed on 21 October but appear on neither quote. The A/C at {metres(heights.ac)} is the highest point on the van in this scope.</div>
          : <div className="design-conflict"><strong>No 2.60 m solution on this high-roof van.</strong> Lowering the rear crossarm brings the upper sensors to {metres(heights.loweredHead)}, below the {metres(heights.roof)} roof, so the body can block forward views. With the mounts lowered the sensing package tops out at {metres(heights.sensors)}, but the rear A/C fitted later still reaches {metres(heights.ac)} and becomes the highest point. Tsai must choose the sensor architecture and parking plan before fabrication.</div>}
        <div className="model-caption">Drag to orbit · scroll to zoom · select a numbered pin. Ford dimensions set the vehicle envelope; hardware sizes and mounting positions remain conceptual until measured.</div>
      </section>

      <aside className="side-pane" aria-label="Build details">
        <nav className="side-tabs" aria-label="Details tabs">
          <button className={panel === 'phase1' ? 'active' : ''} onClick={() => { setPanel('phase1'); setPhase('phase1'); setSelected(null); setView('interior'); }}>Phase 1</button>
          <button className={panel === 'layout' ? 'active' : ''} onClick={() => { setPanel('layout'); setPhase('full'); setSelected(null); }}>Build sheet</button>
          <button className={panel === 'dimensions' ? 'active' : ''} onClick={() => setPanel('dimensions')}>Dimensions</button>
          <button className={panel === 'sources' ? 'active' : ''} onClick={() => setPanel('sources')}>Sources</button>
        </nav>
        <div className="side-content">
          {panel === 'phase1' && <>
            <div className="side-intro"><p className="kicker">01 / Phase one</p><h2>Quoted, waiting on a decision</h2><p>Leonard USA walked the van on 21 October and quoted the phase-one interior on 30 October: air conditioning, insulation and liners, an inverter and wiring, with two crew seats as a separate option. The rear sensor carrier and the sensing package are phase two and are deliberately not in this quote.</p></div>

            <div className="quote-choice">
              <div className="quote-option"><span>Option A · 368-QUO-100610</span><strong>{money(7449)}</strong><small>A/C, insulation, liners, inverter, wiring</small></div>
              <div className="quote-option"><span>Option B · 368-QUO-100657</span><strong>{money(11574)}</strong><small>Option A plus two captain seats</small></div>
            </div>
            <p className="quote-meta">Both quotes are dated 30 October 2026 and are identical apart from the seat kit, which adds {money(4125)} installed. Listed discounts of $288.97 are already applied and no sales tax is shown.</p>
            <div className="part-group" style={{ marginTop: 24 }}><h3>What lands in the van</h3>
              {(['acRear', 'p1Liner', 'p1Ceiling', 'p1Seats', 'p1Power'] as Part[]).map(id => {
                const item = detail[id];
                const expanded = selected === id;
                return <div className="part-item" key={id}>
                  <button type="button" className={`part-row ${expanded ? 'active' : ''}`} aria-expanded={expanded} onClick={() => { setPhase('phase1'); choose(id); }}>
                    <span className={`part-number tone-${tags[id].tone}`}>{tags[id].label}</span>
                    <span>{id === 'acRear' ? 'Auxiliary roof A/C' : item.title}</span>
                    <span className="part-arrow">{expanded ? '−' : '+'}</span>
                  </button>
                  {expanded && <div className="part-spec"><strong>Equipment needed</strong><ul>{item.items.map(line => <li key={line}>{line}</li>)}</ul>{item.status && <p className="part-status">{item.status}</p>}</div>}
                </div>;
              })}
            </div>

            {!showPrices && <p className="quote-hidden">Figures are hidden on the shared link, because this URL has also been sent to competing upfitters. Add <code>?quote=1</code> to the address to show the quoted amounts.</p>}

            {quoteGroups.map(group => <div key={group.title}>
              <p className={`quote-group-title ${group.seatsOnly ? 'seats' : ''}`}>{group.title}</p>
              <table className="quote-table"><tbody>
                {group.lines.map(line => <tr key={line.name}><td>{line.name}</td><td className="num">{money(line.ext)}</td></tr>)}
                <tr className="subtotal"><td>Subtotal</td><td className="num">{money(group.lines.reduce((sum, line) => sum + line.ext, 0))}</td></tr>
              </tbody></table>
            </div>)}

            <div className="part-group" style={{ marginTop: 26 }}><h3>Schedule and terms</h3></div>
            <dl className="dimension-list">{quoteFacts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>

            <div className="part-group" style={{ marginTop: 26 }}><h3>Open against this quote</h3></div>
            {openItems.map(item => <div className={`issue-card ${item.neutral ? 'neutral' : ''}`} key={item.title}><strong>{item.title}</strong><p>{item.body}</p></div>)}

            <div className="secondary-list"><h3>What Georgia Tech still owes Patrick</h3>
              <ul>{gtOwes.map(line => <li key={line}>{line}</li>)}</ul>
            </div>

            <div className="issue-card neutral"><strong>Phase two stays open</strong><p>The rear carrier, the LiDAR and camera package, the survey-grade GNSS and the depth cameras are not priced here and are not fixed. The build sheet tab holds that list, and the rack still needs measured equipment dimensions and weights before American Custom Design Vehicles can design or quote it.</p></div>
          </>}
          {panel === 'layout' && <>
            {(annotations.length > 0 || addMode) && <div className="custom-points">
              <h3>Your points</h3>
              {addMode && <p className="point-hint">Click the van or equipment to place a point.</p>}
              {annotations.length > 0 && <button type="button" className="share-points" onClick={copyPointsLink}>{copiedPoints ? 'Link copied' : 'Copy link with points'}</button>}
              {annotations.map((mark, index) => <div className="custom-point-item" key={mark.id}>
                <button type="button" className={`part-row ${selectedAnnotation === mark.id ? 'active' : ''}`} onClick={() => { setSelectedAnnotation(mark.id); setSelected(null); setView(mark.view); }}>
                  <span className="part-number">U{index + 1}</span><span>{mark.name}</span><span className="part-arrow">{selectedAnnotation === mark.id ? '−' : '+'}</span>
                </button>
                {selectedAnnotation === mark.id && <div className="point-editor">
                  <label>Name<input value={mark.name} onChange={e => setAnnotations(previous => previous.map(item => item.id === mark.id ? { ...item, name: e.target.value } : item))} /></label>
                  <span>Drag U{index + 1} on the model to move it.</span>
                  <button type="button" onClick={() => { setAnnotations(previous => previous.filter(item => item.id !== mark.id)); setSelectedAnnotation(null); }}>Delete point</button>
                </div>}
              </div>)}
            </div>}
            {lists.filter(l => !l.layouts || l.layouts.includes(layout)).map(list =>
              <div className={`part-group ${list.tone ? 'group-' + list.tone : ''}`} key={list.title}>
                <h3>{list.title}</h3>
                {list.items.map(id => {
                  const item = detailFor(id);
                  const expanded = selected === id;
                  return <div className="part-item" key={id}>
                    <button type="button" className={`part-row ${expanded ? 'active' : ''}`} aria-expanded={expanded} onClick={() => choose(id)}>
                      <span className={`part-number tone-${tags[id].tone}`}>{tags[id].label}</span>
                      <span>{item.title}</span>
                      <span className="part-arrow">{expanded ? '−' : '+'}</span>
                    </button>
                    {expanded && <div className="part-spec"><strong>Equipment needed</strong><ul>{item.items.map(line => <li key={line}>{line}</li>)}</ul>{item.status && <p className="part-status">{item.status}</p>}</div>}
                  </div>;
                })}
              </div>
            )}
          </>}
          {panel === 'dimensions' && <>
            <div className="side-intro"><p className="kicker">03 / Vehicle envelope</p><h2>Numbers to design around</h2><p>Published 2026 Ford Transit cargo van dimensions for the selected body length.</p></div>
            <dl className="dimension-list"><div><dt>Overall length</dt><dd>{length}</dd></div><div><dt>Overall height, bare roof</dt><dd>{roofHeight}</dd></div><div><dt>Width, mirrors excluded</dt><dd>81.3 in / 2.07 m</dd></div><div><dt>Width, mirrors included</dt><dd>97.4 in / 2.47 m</dd></div><div><dt>Wheelbase</dt><dd>147.6 in / 3.75 m</dd></div><div><dt>Cargo length at floor</dt><dd>{body === 'extended' ? '172.2 in / 4.37 m' : '143.7 in / 3.65 m'}</dd></div><div><dt>Between wheelhouses</dt><dd>54.8 in / 1.39 m</dd></div></dl>
            <div className="issue-card"><strong>Clearance conflict</strong><p>The sheet requests a finished height below 2.60 m for the 14th Street garage. Ford’s bare high roof is already {body === 'extended' ? '2.80' : '2.78'} m. Measure the actual vehicle and garage opening before any roof hardware is ordered.</p></div>
            <div className="issue-card"><strong>Architecture decision</strong><p>Sheet beam: {metres(heights.sheet)}. Photo-style raised gantry: {metres(heights.pathrunner)}. Lowered crossarm: {metres(heights.lowered)} overall because the A/C remains on the roof; its sensor head at {metres(heights.loweredHead)} sits below the van roof and needs a sight-line test. Hardware heights are illustrative, not measured.</p></div>
            <div className="issue-card neutral"><strong>Body length still unconfirmed</strong><p>The VIN and photos do not settle whether this van is the 235.5 in long body or 263.9 in extended body. Use the switch beside the model to compare both.</p></div>
            <div className="issue-card neutral"><strong>Equipment measurements missing</strong><p>The rear carrier, LiDAR, cameras, A/C and reused rack have no measured dimensions in the sheets. Their 3D footprints are representative; request drawings and weigh the parts before installation.</p></div>
          </>}
          {panel === 'sources' && <>
            <div className="side-intro"><p className="kicker">04 / Traceability</p><h2>Source material</h2><p>Ford supplies the vehicle envelope. Sensor and bracket dimensions in the model are assumptions for review, not fabrication measurements.</p></div>

            <div className="part-group"><h3>Your sheets</h3></div>
            <div className="source-card"><img src="sheets/sheet-layout.jpg" alt="Annotated roof layout sheet" /><div><strong>02 · Annotated sketch</strong><span>Per your clarification, the front object is A/C and the rear section is a PathRunner-like sensing setup. Handwritten labels in the sketch are not authoritative positions.</span><a href="sheets/sheet-layout.jpg" target="_blank" rel="noreferrer">Open image ↗</a></div></div>
            <div className="source-card"><img src="sheets/sheet-requirements.jpg" alt="Vehicle requirements table" /><div><strong>03 · Requirements</strong><span>Seats, workstation, storage, power and cabling, plus the handwritten sensor additions at the foot.</span><a href="sheets/sheet-requirements.jpg" target="_blank" rel="noreferrer">Open image ↗</a></div></div>
            <div className="source-card"><img src="sheets/sheet-inventory.jpg" alt="Old van equipment inventory" /><div><strong>Old van inventory</strong><span>Rack, 3 × LiDAR, industrial PC, bench and tool box as reuse candidates. Two lines are illegible and need a physical count.</span><a href="sheets/sheet-inventory.jpg" target="_blank" rel="noreferrer">Open image ↗</a></div></div>
            <div className="issue-card"><strong>Roof openings still need a drawing</strong><p>Sheet 03 proposes a shared reinforced A/C and cable opening. The PathRunner reference photo instead shows two rear cable entries, while your corrected layout puts A/C at the front. The model shows the two-entry reference arrangement; actual cutouts and routes need a drawing.</p></div>

            <div className="part-group"><h3>Vehicle data</h3></div>
            <div className="issue-card neutral"><strong>VIN 1FTBW3X83TKA11541</strong><p>Decodes clean through NHTSA vPIC: 2026 Ford Transit-350 cargo van, high roof, RWD, 3.5 L V6, 147.6 in wheelbase, GVWR 9,500 lb, built at Claycomo. It cannot separate the 235.5 in body from the 263.9 in extended body — both use that wheelbase.</p></div>
            <div className="issue-card neutral"><strong>Ford dimensions</strong><p>Length, height, width, overhangs, load floor height and every cargo dimension come from Ford&rsquo;s published Transit table. The built model measures 6.703 × 2.804 × 2.065 m, matching 263.9 / 110.4 / 81.3 in exactly.</p></div>

            <div className="part-group"><h3>PathRunner — what is worth copying</h3></div>
            <div className="issue-card neutral"><strong>Comparable chassis, different roof problem</strong><p>Pathway Services list an extended-wheelbase Transit as a preferred chassis. The photo shows a rear cantilever and two sensor housings well above the roof. Their actual dimensions are not published here; the frame and height in this model are visual estimates for our high-roof van.</p></div>
            <div className="issue-card neutral"><strong>Rear sensing, two levels of detail</strong><p>The corrected base concept places the existing sensors on a rear carrier and the A/C forward. The PathRunner view adds the raised cantilever, two upper housings, lower pavement bar, DMI and front carrier as a reference. The lower crossarm option is hypothetical and may block forward views.</p></div>
            <div className="issue-card neutral"><strong>Reference computer stack</strong><p>NJDOT&rsquo;s operator manual shows a master Profiler computer plus separate roadway-camera and 3D computers, each slaved to the profiler for sync, each with its own removable hard drive, and a DMI control box in the cabin. Our sheet lists one industrial PC. If Tsai wants that full PathRunner-style collection set, size the rack and power for it.</p></div>
            <div className="issue-card neutral"><strong>DMI</strong><p>An optical wheel encoder on a road wheel, with a documented bounce, block and calibration procedure. The old van&rsquo;s flight case is labelled &ldquo;DMI, Encoder, GPS&rdquo;, so we may already own one.</p></div>

            <div className="part-group"><h3>Not sourced</h3></div>
            <div className="issue-card"><strong>Every equipment size</strong><p>Sensor bodies, the crossbeam, the A/C unit, the reused rack and all cabin furniture are representative volumes in plausible positions. None are measured. Get drawings and weigh the parts before anything is fabricated.</p></div>

            <div className="links">
              <a href="https://vpic.nhtsa.dot.gov/decoder/" target="_blank" rel="noreferrer">NHTSA VIN decoder ↗</a>
              <a href="https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2026/specs/2026_Ford_Transit_Specs.pdf" target="_blank" rel="noreferrer">Ford Transit technical specifications (PDF) ↗</a>
              <a href="https://www.pathwayservices.com/technology/" target="_blank" rel="noreferrer">Pathway Services · PathRunner technology ↗</a>
              <a href="https://idot.illinois.gov/about-idot/stay-connected/idot-blog/bureaus-of-research-and-programming-get-new-data-collection-vehi.html" target="_blank" rel="noreferrer">Illinois DOT · PathRunner on a Ford Transit ↗</a>
              <a href="https://dot.nj.gov/transportation/eng/pavement/pdf/Pathway-Startup.pdf" target="_blank" rel="noreferrer">NJDOT · PathRunner operator manual (PDF) ↗</a>
              <a href="https://dot.nj.gov/transportation/eng/pavement/pdf/Pathrunner-Calibrate.pdf" target="_blank" rel="noreferrer">NJDOT · PathRunner DMI calibration (PDF) ↗</a>
              <a href="https://www.pavemetrics.com/laser-crack-measurement-system-lcms-2/" target="_blank" rel="noreferrer">Pavemetrics · LCMS-2 ↗</a>
            </div>
          </>}
        </div>
      </aside>
    </main>
    <footer className="footer"><span>GT CEE · Sensing Van 503-1705</span><span>Phase 1 quote / 4 Nov 2026</span><span>Measure on vehicle before fabrication</span></footer>
  </div>;
}
