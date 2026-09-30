import { useEffect, useState } from 'react';
import VanScene, { heightCases, tags, type Annotation, type Body, type GantryLevel, type Layout, type Part, type View } from '@/components/VanScene';
import './index.css';

type DeviceSpec = { title: string; items: string[]; status?: string };

const detail: Record<Part, DeviceSpec> = {
  beam: { title: 'Rear sensor carrier', items: ['Rear sensor mounting frame × 1', 'Mounting brackets and fasteners — size TBD'], status: 'Concept location from the corrected sketch; hardware dimensions are not specified.' },
  lidar: { title: 'LiDAR', items: ['Existing LiDAR units × 3', 'Sensor mounts × 3'], status: 'Models and dimensions need a physical inventory.' },
  cameras: { title: 'Camera mounts', items: ['Rigid camera mounts on the sensor frame', 'Cameras — count and models TBD'], status: 'The sheet does not give a camera count.' },
  gnss: { title: 'GPS / IMU', items: ['GPS / IMU set', 'Fixed mount on the sensor frame'], status: 'Receiver, antenna and IMU models TBD.' },
  pass: { title: 'Rear cable entries', items: ['Sealed rear roof cable entries × 2', 'Cable runs from both entries to the rear sensor carrier'], status: 'Two separate entries follow the PathRunner reference photo. Exact routing and roof cutouts TBD.' },
  ac: { title: 'Auxiliary roof A/C', items: ['Low-profile roof A/C × 1', 'Cabin duct and roof opening'], status: 'Front roof position confirmed by your correction; unit model and dimensions TBD.' },
  seats: { title: 'Crew seats', items: ['New forward-facing belted seats × 2', 'Phone mounts × 2', 'Seat and floor reinforcement'], status: 'Seat model and certification TBD.' },
  desk: { title: 'Operator workstation', items: ['Industrial tower PC × 1', '24 in 1920 × 1080 monitor × 1 with VESA arm', 'Removable 2 TB NVMe drives × 2', '120 V outlets × 4; USB-C ports × 4', 'Adjustable LED work lights × 2'], status: 'Desk and mounting dimensions TBD.' },
  rack: { title: 'Equipment rack / storage', items: ['Existing equipment rack — reuse if suitable', 'Overhead cabinet × 1', 'Fixed cable tray', 'Non-slip floor protection', 'Geotab terminal'], status: 'Rack size and equipment inventory TBD.' },
  power: { title: 'Independent power', items: ['Auxiliary battery bank', 'Vehicle DC-DC charger', '2000 W pure sine inverter', 'Separate UPS for the host PC'], status: 'Battery size to be set for the sheet’s 2-hour engine-off target.' },
  rqLidar: { title: 'Colour LiDAR', items: ['Colour LiDAR — model and quantity TBD'], status: 'Handwritten addition on sheet 03; whether it replaces an existing unit is undecided.' },
  rqGnss: { title: 'RTK / PPK GPS', items: ['RTK / PPK-capable GNSS receiver — model TBD'], status: 'Handwritten “very good GPS” / “RTK / PPK” on sheet 03.' },
  rqCamera: { title: 'High-quality camera', items: ['High-quality camera — model and quantity TBD'], status: 'Handwritten addition on sheet 03.' },
  rqDepth: { title: 'Depth camera', items: ['Depth camera — model and quantity TBD'], status: 'Handwritten addition on sheet 03.' },
  rqTobii: { title: 'Eye tracking (Tobii)', items: ['Tobii eye-tracking device — model TBD'], status: 'Handwritten addition on sheet 03; cabin device.' },
  pgDeck: { title: 'Raised rear gantry', items: ['Cantilever frame above the rear roof', 'Diagonal support braces', 'Amber roof warning bars × 2'], status: 'Photo reference only; dimensions and structural design TBD.' },
  pgMast: { title: 'Elevated sensor housings', items: ['Upper sensor housings × 2', 'Center sensor / camera head'], status: 'The photo shows two large boxes above the roof; their instrument identities are unverified.' },
  pgPavement: { title: 'Pavement sensor bar', items: ['Low rear crossbar', 'Downward-looking pavement sensors — models TBD'], status: 'PathRunner reference option; not specified on our sheet.' },
  pgDmi: { title: 'DMI wheel encoder', items: ['Rear wheel DMI encoder'], status: 'PathRunner reference option; check the old van inventory before buying.' },
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
  { title: 'Front A/C · rear sensing', items: ['ac', 'beam', 'lidar', 'cameras', 'gnss', 'pass'] },
  { title: 'Cabin / systems', items: ['seats', 'desk', 'rack', 'power'] },
  { title: 'Asked for by the group', items: ['rqLidar', 'rqGnss', 'rqCamera', 'rqDepth', 'rqTobii'], tone: 'requested' },
  { title: 'PathRunner reference rig', items: ['pgDeck', 'pgMast', 'pgPavement', 'pgDmi', 'pgFront'], tone: 'reference', layouts: ['sheet'] },
  { title: 'Also on the rig', items: ['pgPavement', 'pgDmi', 'pgFront'], tone: 'reference', layouts: ['pathrunner'] },
];

const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
const startView = (['exterior', 'roof', 'interior', 'rear'] as View[])
  .find(v => v === params?.get('view')) ?? 'exterior';
const startBody = (['extended', 'long'] as Body[])
  .find(v => v === params?.get('body')) ?? 'extended';
const savedPoints = (): Annotation[] => {
  try {
    const shared = new URLSearchParams(window.location.search).get('points');
    const value = JSON.parse(shared ?? localStorage.getItem('gtsv-custom-points') ?? '[]');
    return Array.isArray(value) ? value.filter(p => typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.point) && p.point.length === 3 && p.point.every((n: unknown) => typeof n === 'number') && ['exterior', 'roof', 'interior', 'rear'].includes(p.view)) : [];
  } catch { return []; }
};

export default function Home() {
  const [view, setView] = useState<View>(startView);
  const [body, setBody] = useState<Body>(startBody);
  const [selected, setSelected] = useState<Part | null>(null);
  const [limit, setLimit] = useState(false);
  const [rearFrame, setRearFrame] = useState(false);
  const [requested, setRequested] = useState(false);
  const [layout, setLayout] = useState<Layout>('sheet');
  const [gantryLevel, setGantryLevel] = useState<GantryLevel>('roof');
  const [panel, setPanel] = useState<'layout' | 'dimensions' | 'sources'>('layout');
  const [annotations, setAnnotations] = useState<Annotation[]>(savedPoints);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [copiedPoints, setCopiedPoints] = useState(false);
  useEffect(() => { setCopiedPoints(false); try { localStorage.setItem('gtsv-custom-points', JSON.stringify(annotations)); } catch { /* browser storage may be disabled */ } }, [annotations]);
  const heights = heightCases(body);
  const metres = (v: number) => `${v.toFixed(2)} m`;
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
      <span className="status">Concept for Tsai review</span>
    </header>

    <main className="workspace">
      <section className="model-pane" aria-label="Vehicle model">
        <div className="viewer-wrap">
          <VanScene view={view} body={body} selected={selected} showLimit={limit} showRearFrame={rearFrame} showRequested={requested} layout={layout} gantryLevel={gantryLevel} onSelect={choose}
            annotations={annotations} addMode={addMode} selectedAnnotation={selectedAnnotation} onAddAnnotation={addAnnotation} onMoveAnnotation={moveAnnotation}
            onSelectAnnotation={id => { setSelectedAnnotation(id); setSelected(null); setPanel('layout'); }} />
          <div className="stage-height"><span>Scenario top</span><strong>≈ {metres(layout === 'sheet' ? heights.sheet : gantryLevel === 'roof' ? heights.pathrunner : heights.lowered)}</strong><small>2.60 m target exceeded</small></div>
          <div className="view-controls" role="group" aria-label="Camera view">
            {([['exterior', '3D exterior'], ['roof', 'Roof'], ['interior', 'Interior'], ['rear', 'Rear sensors']] as [View, string][]).map(([key, name]) =>
              <button key={key} type="button" className={view === key ? 'active' : ''} onClick={() => { setView(key); if (key === 'rear') setRearFrame(true); }}>{name}</button>
            )}
          </div>
        </div>
        <div className="model-bottom">
          <button type="button" className={`add-point-button ${addMode ? 'active' : ''}`} aria-pressed={addMode} onClick={() => setAddMode(value => !value)}>{addMode ? 'Click on van…' : '+ Add point'}</button>
          <div className="variant" role="group" aria-label="Sensor architecture">
            <span>Layout</span>
            <button type="button" className={layout === 'sheet' ? 'active' : ''} onClick={() => setLayout('sheet')}>Our sheet</button>
            <button type="button" className={layout === 'pathrunner' ? 'active' : ''} onClick={() => setLayout('pathrunner')}>PathRunner</button>
          </div>
          <div className="variant" role="group" aria-label="Vehicle body length">
            <span>Body length</span>
            <button type="button" className={body === 'extended' ? 'active' : ''} onClick={() => setBody('extended')}>Extended · 263.9″</button>
            <button type="button" className={body === 'long' ? 'active' : ''} onClick={() => setBody('long')}>Long · 235.5″</button>
          </div>
          <label className="toggle"><input type="checkbox" checked={limit} onChange={e => setLimit(e.target.checked)} /> 2.60 m clearance plane</label>
          {layout === 'sheet' && <label className="toggle gold"><input type="checkbox" checked={requested} onChange={e => setRequested(e.target.checked)} /> Requested upgrades</label>}
        </div>
        {layout === 'pathrunner' && <div className="gantry-switch" role="group" aria-label="PathRunner crossarm height">
          <span>Gantry height</span>
            <button type="button" className={gantryLevel === 'roof' ? 'active' : ''} onClick={() => setGantryLevel('roof')}>Raised crossarm · {metres(heights.raisedBar)}</button>
            <button type="button" className={gantryLevel === 'lowered' ? 'active' : ''} onClick={() => setGantryLevel('lowered')}>Lower crossarm · {metres(heights.loweredDeck)}</button>
        </div>}
        <div className="height-compare" aria-label="Height comparison">
          <div><span>Bare high roof</span><strong>{metres(heights.roof)}</strong><small>Ford published</small></div>
          <div className={layout === 'sheet' ? 'active' : ''}><span>Rear sensor carrier</span><strong>≈ {metres(heights.sheet)}</strong><small>Representative hardware</small></div>
          <div className={layout === 'pathrunner' && gantryLevel === 'roof' ? 'active' : ''}><span>Raised rear gantry</span><strong>≈ {metres(heights.pathrunner)}</strong><small>Photo proportions; unmeasured</small></div>
          <div className={layout === 'pathrunner' && gantryLevel === 'lowered' ? 'active' : ''}><span>Lowered gantry</span><strong>≈ {metres(heights.lowered)}</strong><small>A/C remains highest</small></div>
        </div>
        <div className="design-conflict"><strong>No 2.60 m solution on this high-roof van.</strong> Lowering the rear crossarm brings the upper sensors to {metres(heights.loweredHead)}, below the {metres(heights.roof)} roof, so the body can block forward views. The assumed roof A/C still reaches {metres(heights.ac)}. Tsai must choose the sensor architecture and parking plan before fabrication.</div>
        <div className="model-caption">Drag to orbit · scroll to zoom · select a numbered pin. Ford dimensions set the vehicle envelope; hardware sizes and mounting positions remain conceptual until measured.</div>
      </section>

      <aside className="side-pane" aria-label="Build details">
        <nav className="side-tabs" aria-label="Details tabs">
          <button className={panel === 'layout' ? 'active' : ''} onClick={() => setPanel('layout')}>Build sheet</button>
          <button className={panel === 'dimensions' ? 'active' : ''} onClick={() => setPanel('dimensions')}>Dimensions</button>
          <button className={panel === 'sources' ? 'active' : ''} onClick={() => setPanel('sources')}>Sources</button>
        </nav>
        <div className="side-content">
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
    <footer className="footer"><span>GT CEE · Sensing Van 503-1705</span><span>Layout review / 29 Sep 2026</span><span>Measure on vehicle before fabrication</span></footer>
  </div>;
}
