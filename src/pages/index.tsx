import { useEffect, useRef, useState, type ReactNode } from 'react';
import VanScene, { heightCases, tags, type Annotation, type Body, type GantryLevel, type Layout, type Part, type Phase, type View } from '@/components/VanScene';
import './index.css';
import { FLIP } from '@/components/flipMechanism';
import { BROW_CAMERAS } from '@/components/browArray';

type DeviceSpec = { title: string; items: string[]; status?: string };

const facing = (c: typeof BROW_CAMERAS[number]) => c.tail
  ? `back, ${180 - Math.abs(c.az)}° ${c.az < 0 ? 'left' : 'right'}, ${c.pitch}° down`
  : c.az === 0 ? (c.pitch ? `ahead, ${c.pitch}° down` : 'ahead') : `${Math.abs(c.az)}° ${c.az < 0 ? 'left' : 'right'}`;
const cameraLine = (c: typeof BROW_CAMERAS[number]) => `${c.id} · ${c.role} · ${facing(c)} · ${c.hfov}° lens`;

const detail: Record<Part, DeviceSpec> = {
  browShell: { title: 'Printed weather fairing', items: ['UV-stable ASA or similar, printed in sections', 'Glass camera windows with gaskets', 'Breather vent against condensation', 'Carries no sensor load'], status: 'The fairing only keeps weather out. In the model it stops about 2 cm above the top of the windshield, so the glass stays clear. Section count, wall thickness and sealing need a printed trial.' },
  browBar: { title: 'Rigid aluminium sensor frame', items: ['Transverse bar, illustrative 1.46 m', 'Two outriggers for the rear-side cameras, inside mirror width', 'Centre mast with rear brace', 'Body mounts on the brow panel, positions TBD'], status: 'Every sensor shares this frame so the calibration holds. The fairing fades while this item is selected. The body structure behind the brow is not confirmed, so the mounts cannot be dimensioned yet.' },
  browCams: { title: 'Front surround cameras × 8', items: BROW_CAMERAS.filter(c => !c.tail).map(cameraLine), status: 'Replaces the 360 camera. The eight fields overlap from straight ahead round to the rear quarters on both sides. Camera models, lenses and synchronisation are TBD.' },
  browTail: { title: 'Tail cameras × 2', items: [...BROW_CAMERAS.filter(c => c.tail).map(cameraLine), 'Brackets on the fixed roof edge, clear of the rear doors', 'Sealed roof gland at each bracket'], status: 'These close the blind strip behind the van, and their fields cross behind the tail. With the assumed lens the road is visible from about 2 m behind the van. They are not on the front frame, so they need their own calibration. Rear-facing lenses collect road spray, so plan for cleaning.' },
  browLidar: { title: 'LiDAR on the centre mast', items: ['LiDAR × 1, colour LiDAR preferred, model TBD', 'Optical centre about 2.87 m above ground, just above the roof line'], status: 'Clear all the way around at the horizon. Road surface is visible from about 1.2 m ahead of the bumper and about 8 m out to each side. The van body blocks the road behind.' },
  browGnss: { title: 'GNSS antenna and IMU', items: ['RTK / PPK GNSS antenna on top of the LiDAR stack', 'IMU on the rigid frame directly below the LiDAR'], status: 'The antenna is the highest point at the front of the van, with open sky above it. Receiver and IMU models are TBD. Check roof and A/C multipath in a field test.' },
  browCable: { title: 'Cable route to the rack', items: ['Sealed gland through the brow panel', 'Conduit above the ceiling liner, about 5 m to the rack', 'Short second run from the tail cameras to the rack', 'Pull cord left in place for later cables'], status: 'Install this before the ceiling liner closes, so raise it with Leonard at the drop-off strategy meeting. The route is conceptual.' },
  flipHatch: { title: 'Roof opening & transverse hinge', items: ['Reinforced roof opening, illustrative 0.84 × 2.40 m', 'Transverse pivot with two bearing brackets', 'Reversible carrier panel with perimeter seal'], status: 'The hinge sits within the opening to let the entire assembly rotate through 180°. Roof reinforcement, sealing and drainage need a measured design.' },
  flipPackage: { title: 'Complete flip-in sensor assembly', items: ['360 camera and articulated mast', 'GNSS receiver, cylindrical LiDAR and side camera modules', 'Common rigid mounting plates; all equipment flips together', 'Cable run to the hinge with a flexible service loop'], status: 'Geometry follows the supplied reference image. Instrument identities, mass and dimensions are illustrative pending an equipment inventory.' },
  flipLatch: { title: 'Cabin-operated mechanical latches', items: ['Two captive locking pins with reachable release tabs', 'Positive stops at 0° working and 180° stowed', 'Both pins operated from inside the van'], status: 'Release the latches, move the assembly by its grab rail, then latch it at the opposite end stop. The demonstration prevents movement while latched. Pin sizing and manual handling depend on the actual package weight.' },
  flipHandle: { title: 'Manual grab rails', items: ['Opposed grab rails on the carrier', 'Downward rail approximately 2.16 m above ground in the extended van', 'Direct manual rotation; no motor or crank'], status: 'A rail faces into the cabin in either end position. Keep the marked sweep and stow volume clear of people and furniture while turning.' },
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
  p1Seats: { title: 'Connected two-person bench', items: ['Tim Van connected two-person seat, shared frame', 'One rigid frame: both seats turn together through 90 degrees', 'DOT-approved three-point belts', 'Two curved floor guides following the bench rotation (concept)'], status: 'Option B only, $4,125 installed. The reference shows two joined seats on one frame. Use the Bench rotation switch to turn the complete pair by 90 degrees: across the van facing forward, or along the van facing the aisle. Both seats and their shared frame turn together, with two guide shoes following concentric curved floor rails. The guide mechanism is a concept layout.' },
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
  { title: 'Sensor array', items: ['browShell', 'browBar', 'browCams', 'browTail', 'browLidar', 'browGnss', 'browCable', 'acRear'], layouts: ['brow'] },
  { title: 'Flip-in assembly', items: ['flipHatch', 'flipPackage', 'flipLatch', 'flipHandle', 'acRear'], layouts: ['flip'] },
  { title: 'Roof and sensing', items: ['frontCams', 'beam', 'lidar', 'cameras', 'gnss', 'pass', 'acRear'], layouts: ['sheet', 'pathrunner', 'hybrid'] },
  { title: 'Cabin and systems', items: ['seats', 'desk', 'rack', 'power'] },
  { title: 'Provisioned now, used later', items: ['pvConsole', 'pvScreen', 'pvCable', 'pvPower'], tone: 'provision' },
  { title: 'Asked for by the group', items: ['rqLidar', 'rqGnss', 'rqCamera', 'rqDepth', 'rqTobii'], tone: 'requested', layouts: ['sheet', 'pathrunner', 'hybrid'] },
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
const startLayout = (['brow', 'flip', 'sheet', 'pathrunner'] as Layout[])
  .find(v => v === params?.get('layout')) ?? 'brow';
const startView = (['exterior', 'roof', 'plan', 'interior', 'rear', 'front', 'cover'] as View[])
  .find(v => v === params?.get('view')) ?? (startLayout === 'brow' ? 'front' : 'exterior');
const startBody = (['extended', 'long'] as Body[])
  .find(v => v === params?.get('body')) ?? 'extended';
const savedPoints = (): Annotation[] => {
  try {
    const shared = new URLSearchParams(window.location.search).get('points');
    const value = JSON.parse(shared ?? localStorage.getItem('gtsv-custom-points') ?? '[]');
    return Array.isArray(value) ? value.filter(p => typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.point) && p.point.length === 3 && p.point.every((n: unknown) => typeof n === 'number') && ['exterior', 'roof', 'plan', 'interior', 'rear', 'front', 'cover'].includes(p.view)) : [];
  } catch { return []; }
};

type Scheme = 'phase1' | 'brow' | 'flip' | 'sheet' | 'pathrunner';
type Tab = 'parts' | 'quote' | 'dimensions' | 'sources';

const SCHEMES: { id: Scheme; label: string }[] = [
  { id: 'phase1', label: 'Phase 1 quote' },
  { id: 'brow', label: 'Brow array' },
  { id: 'flip', label: 'Flip-in' },
  { id: 'sheet', label: 'Our sheet' },
  { id: 'pathrunner', label: 'PathRunner' },
];
const TABS: { id: Tab; label: string }[] = [
  { id: 'parts', label: 'Parts' },
  { id: 'quote', label: 'Quote' },
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'sources', label: 'Sources' },
];
const PHASE1_PARTS: Part[] = ['acRear', 'p1Liner', 'p1Ceiling', 'p1Seats', 'p1Power'];

function Segmented<T extends string>({ label, value, options, onChange, className = '', disabled = false }: {
  label: string; value: T | null; options: { id: T; label: string }[]; onChange: (next: T) => void; className?: string; disabled?: boolean;
}) {
  return <div className={`seg ${className}`} role="group" aria-label={label}>
    {options.map(o => <button key={o.id} type="button" className={o.id === value ? 'active' : ''} aria-pressed={o.id === value} disabled={disabled} onClick={() => onChange(o.id)}>{o.label}</button>)}
  </div>;
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="section">
    <div className="section-head"><h3>{title}</h3>{action}</div>
    {children}
  </section>;
}

/** Third and deepest level of the page: a row that opens in place. */
function Fold({ title, aside, warn, children }: { title: string; aside?: ReactNode; warn?: boolean; children: ReactNode }) {
  return <details className="fold">
    <summary className="row">{warn && <i className="dot" aria-label="Needs attention" />}<span className="row-title">{title}</span>{aside}<i className="chev" aria-hidden="true" /></summary>
    <div className="fold-body">{children}</div>
  </details>;
}

function PartRow({ id, item, expanded, onToggle }: { id: Part; item: DeviceSpec; expanded: boolean; onToggle: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (expanded) root.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [expanded]);
  return <div className={`part ${expanded ? 'open' : ''}`} ref={root}>
    <button type="button" className="row" aria-expanded={expanded} onClick={onToggle}>
      <span className="badge">{tags[id].label}</span>
      <span className="row-title">{item.title}</span>
      <i className="chev" aria-hidden="true" />
    </button>
    {expanded && <div className="fold-body">
      <ul>{item.items.map(line => <li key={line}>{line}</li>)}</ul>
      {item.status && <p className="fine">{item.status}</p>}
    </div>}
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>(startView);
  const [body, setBody] = useState<Body>(startBody);
  const [selected, setSelected] = useState<Part | null>(null);
  const [limit, setLimit] = useState(false);
  const [rearFrame, setRearFrame] = useState(false);
  const [requested, setRequested] = useState(false);
  const [doorSwing, setDoorSwing] = useState(false);
  const [provision, setProvision] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [layout, setLayout] = useState<Layout>(startLayout);
  const [phase, setPhase] = useState<Phase>('full');
  const [seatSide, setSeatSide] = useState(true);
  const [gantryLevel, setGantryLevel] = useState<GantryLevel>('roof');
  const [panel, setPanel] = useState<Tab>('parts');
  const [displayOpen, setDisplayOpen] = useState(false);
  const [hintSeen, setHintSeen] = useState(false);
  const [flipAngle, setFlipAngle] = useState(0);
  const [flipLocked, setFlipLocked] = useState(true);
  const [flipEnvelope, setFlipEnvelope] = useState(true);
  const [flipMotion, setFlipMotion] = useState({ angle: 0, height: heightCases(startBody).roof + FLIP.pivotRise + FLIP.sensorTop });
  const [annotations, setAnnotations] = useState<Annotation[]>(savedPoints);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [copiedPoints, setCopiedPoints] = useState(false);
  const tools = useRef<HTMLDivElement>(null);
  useEffect(() => { setCopiedPoints(false); try { localStorage.setItem('gtsv-custom-points', JSON.stringify(annotations)); } catch { /* browser storage may be disabled */ } }, [annotations]);
  useEffect(() => {
    if (!displayOpen) return;
    const away = (e: PointerEvent) => { if (!tools.current?.contains(e.target as Node)) setDisplayOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setDisplayOpen(false); };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', escape); };
  }, [displayOpen]);

  const heights = heightCases(body);
  const first = phase === 'phase1';
  const flipping = !first && layout === 'flip';
  const browing = !first && layout === 'brow';
  const scheme: Scheme = first ? 'phase1' : layout === 'hybrid' ? 'sheet' : layout;
  const pickScheme = (next: Scheme) => {
    setSelected(null);
    setSelectedAnnotation(null);
    if (next === 'phase1') { setPhase('phase1'); setView('interior'); return; }
    setPhase('full');
    setLayout(next);
    if (next === 'brow') setView('front');
    else if (first || view === 'front' || view === 'cover') setView('exterior');
  };
  const flipSettled = Math.abs(flipMotion.angle - flipAngle) < 0.05;
  const flipEndStop = flipSettled && (flipAngle === 0 || flipAngle === 180);
  const metres = (v: number) => `${v.toFixed(2)} m`;
  const money = (v: number) => showPrices ? `$${v.toLocaleString('en-US')}` : '$ — — —';
  const detailFor = (p: Part) => (layout === 'brow' && p === 'rack' ? { ...detail.rack, items: detail.rack.items.slice(1), status: 'Rack size and inventory TBD. With the sensors on the brow, the rear doors stay free for loading.' } : null) || (layout === 'pathrunner' && pathrunnerDetail[p]) || (layout === 'flip' && p === 'acRear' ? { ...detail.acRear, title: 'Forward roof A/C', status: 'Moved ahead of the flip hatch in this concept. Its roof projection still determines the stowed vehicle height.' } : detail[p]);
  const length = body === 'extended' ? '263.9 in / 6.70 m' : '235.5 in / 5.98 m';
  const roofHeight = body === 'extended' ? '110.4 in / 2.80 m' : '109.6 in / 2.78 m';

  const choose = (part: Part) => {
    setSelected(previous => previous === part ? null : part);
    setSelectedAnnotation(null);
    setPanel('parts');
    const tone = tags[part].tone;
    if (tone === 'requested') setRequested(true);
    if (tone === 'reference') setRearFrame(true);
    if (part === 'browCable') setView('interior');
    else if (part === 'browTail') { if (view !== 'cover') setView('exterior'); }
    else if (part.startsWith('brow')) { if (view !== 'front' && view !== 'cover') setView('front'); }
    else if (part === 'flipLatch' || part === 'flipHandle') setView('interior');
    else if (part === 'flipHatch' || part === 'flipPackage') { /* keep the chosen mechanism view */ }
    else if (tone === 'reference') setView('rear');
    else if (tags[part].views.includes('interior')) setView('interior');
    else if (view === 'interior' || view === 'rear') setView('roof');
  };
  const addAnnotation = (point: Annotation['point'], markView: View) => {
    const id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAnnotations(previous => [...previous, { id, name: `New item ${previous.length + 1}`, point, view: markView }]);
    setSelectedAnnotation(id);
    setSelected(null);
    setPanel('parts');
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

  const viewOptions: { id: View; label: string }[] = browing
    ? [{ id: 'front', label: 'Front' }, { id: 'cover', label: 'Coverage' }, { id: 'exterior', label: 'Exterior' }, { id: 'roof', label: 'Roof' }, { id: 'plan', label: 'Plan' }, { id: 'interior', label: 'Interior' }]
    : [{ id: 'exterior', label: 'Exterior' }, { id: 'roof', label: 'Roof' }, { id: 'plan', label: 'Plan' }, { id: 'interior', label: 'Interior' }, ...(first ? [] : [{ id: 'rear' as View, label: 'Rear' }])];

  const readout = first
    ? { label: 'Phase 1 top', value: metres(heights.ac), note: 'Roof A/C is the highest point' }
    : browing ? { label: 'Sensor stack top', value: metres(heights.browTop), note: `A/C stays highest at ${metres(heights.ac)}` }
    : flipping ? { label: flipMotion.angle > 179.95 ? 'Stowed inside' : flipMotion.angle < 0.05 ? 'Working position' : 'Turning', value: metres(flipMotion.height), note: `${flipLocked ? 'Latched' : 'Released'} · ${flipMotion.angle.toFixed(0)}°` }
    : { label: 'Scenario top', value: metres(layout === 'sheet' ? heights.sheet : gantryLevel === 'roof' ? heights.pathrunner : heights.lowered), note: '2.60 m target exceeded' };

  const intro: Record<Scheme, { summary: string; alertTitle: string; alert: string }> = {
    phase1: {
      summary: 'What Leonard USA quoted on 30 October: A/C, insulation, liners, an inverter and wiring, with two crew seats as an option. Prices and terms are on the Quote tab.',
      alertTitle: 'Phase one only',
      alert: `No rear carrier, no sensors and no workstation. The gold patch on the rear roof is held clear for the phase-two sensor carrier. The translucent volumes inside are the shelving and worktop discussed on 21 October, which appear on neither quote. The A/C at ${metres(heights.ac)} is the highest point on the van in this scope.`,
    },
    brow: {
      summary: 'One rigid aluminium frame above the windshield carries eight HD cameras, the LiDAR, the GNSS antenna and the IMU. Two more HD cameras on the rear roof edge cover the view behind the van. Open Coverage to see what the cameras see.',
      alertTitle: 'Confirm before fabrication',
      alert: `The glass stays clear and the array does not raise the van above the ${metres(heights.ac)} A/C. The tail cameras close the view behind the van, but the LiDAR still cannot see the road behind it. Confirm the body structure behind the brow, the total weight and Ford’s mounting limits.`,
    },
    flip: {
      summary: 'A single carrier keeps the camera, LiDAR and GNSS together. Release the latches, turn the grab rail by hand, and latch at the other end. The teal outline reserves the full movement space inside the cabin.',
      alertTitle: 'Sensor height folds away; the van and A/C stay tall',
      alert: `The full package turns through the roof opening and hangs inside the reserved cabin space. Stowed height remains approximately ${metres(heights.ac)}, above the 2.60 m target. Illustrative geometry; confirm package weight, manual handling, roof reinforcement and latch capacity before fabrication.`,
    },
    sheet: {
      summary: 'The sensors sit on a rear roof carrier, following our annotated requirement sheet.',
      alertTitle: 'No 2.60 m solution on this high-roof van',
      alert: `With the mounts lowered the sensing package tops out at ${metres(heights.sensors)}, but the rear A/C fitted later still reaches ${metres(heights.ac)} and becomes the highest point. Tsai must choose the sensor architecture and parking plan before fabrication.`,
    },
    pathrunner: {
      summary: 'A raised rear gantry with two elevated sensor housings, modelled on the PathRunner reference photo.',
      alertTitle: 'No 2.60 m solution on this high-roof van',
      alert: `Lowering the rear crossarm brings the upper sensors to ${metres(heights.loweredHead)}, below the ${metres(heights.roof)} roof, so the body can block forward views. The rear A/C still reaches ${metres(heights.ac)}. Tsai must choose the sensor architecture and parking plan before fabrication.`,
    },
  };

  const heightRows: { label: string; note: string; value: string; active?: boolean }[] = first ? [
    { label: 'Bare high roof', note: 'Ford published', value: metres(heights.roof) },
    { label: 'With rear A/C', note: 'Highest point in this scope', value: `≈ ${metres(heights.ac)}`, active: true },
  ] : browing ? [
    { label: 'Bare high roof', note: 'Ford published', value: metres(heights.roof) },
    { label: 'Fairing top', note: 'Below the roof line', value: `≈ ${metres(heights.browFairing)}`, active: true },
    { label: 'LiDAR + GNSS top', note: 'Centre mast only', value: `≈ ${metres(heights.browTop)}` },
    { label: 'With rear A/C', note: 'Still the highest point', value: `≈ ${metres(heights.ac)}` },
  ] : flipping ? [
    { label: 'Working', note: 'Complete assembly above roof', value: `≈ ${metres(heights.roof + FLIP.pivotRise + FLIP.sensorTop)}`, active: flipAngle === 0 },
    { label: 'Stowed', note: 'A/C remains the highest point', value: `≈ ${metres(heights.ac)}`, active: flipAngle === 180 },
    { label: 'Cabin under stowed sensor', note: 'Clear height above cargo floor', value: `≈ ${metres(heights.roof + FLIP.pivotRise - FLIP.sensorTop - (body === 'extended' ? 28.0 : 28.7) * 0.0254)}` },
  ] : [
    { label: 'Bare high roof', note: 'Ford published', value: metres(heights.roof) },
    { label: 'Sensors only', note: 'Lowered mounts; A/C not yet fitted', value: `≈ ${metres(heights.sensors)}`, active: layout === 'sheet' },
    { label: 'With rear A/C', note: 'Later addition, becomes the tallest', value: `≈ ${metres(heights.ac)}` },
    { label: 'Raised rear gantry', note: 'Photo proportions; unmeasured', value: `≈ ${metres(heights.pathrunner)}`, active: layout === 'pathrunner' && gantryLevel === 'roof' },
    { label: 'Lowered gantry', note: 'A/C remains highest', value: `≈ ${metres(heights.lowered)}`, active: layout === 'pathrunner' && gantryLevel === 'lowered' },
  ];

  const check = (label: string, value: boolean, onChange: (next: boolean) => void) =>
    <label className="check"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />{label}</label>;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">GT</span><div><strong>Sensing Van</strong><small>Unit 503-1705 · 2026 Transit-350</small></div></div>
      <Segmented className="scheme-switch" label="Scheme" value={scheme} options={SCHEMES} onChange={pickScheme} />
    </header>

    <main className="workspace">
      <section className="model-pane" aria-label="Vehicle model" onPointerDownCapture={() => setHintSeen(true)}>
        <VanScene view={view} body={body} selected={selected} showPins={showPins} showLimit={limit} showRearFrame={rearFrame && !first} showRequested={requested && !first} showDoorSwing={doorSwing} showProvision={provision && !first} layout={first ? 'sheet' : layout} phase={phase} seatSide={seatSide} gantryLevel={gantryLevel} onSelect={choose}
          flipAngle={flipAngle} flipLocked={flipLocked} showFlipEnvelope={flipEnvelope} onFlipMotion={(angle, height) => setFlipMotion({ angle, height })}
          annotations={annotations} addMode={addMode} selectedAnnotation={selectedAnnotation} onAddAnnotation={addAnnotation} onMoveAnnotation={moveAnnotation}
          onSelectAnnotation={id => { setSelectedAnnotation(id); setSelected(null); setPanel('parts'); }} />

        <div className="readout float"><span>{readout.label}</span><strong>≈ {readout.value}</strong><small>{readout.note}</small></div>

        <div className="tools" ref={tools}>
          <button type="button" className={`float tool ${addMode ? 'active' : ''}`} aria-pressed={addMode} onClick={() => setAddMode(value => !value)}>{addMode ? 'Cancel' : 'Add point'}</button>
          <button type="button" className={`float tool ${displayOpen ? 'active' : ''}`} aria-expanded={displayOpen} aria-controls="display-menu" onClick={() => setDisplayOpen(value => !value)}>Display</button>
          {displayOpen && <div className="menu float" id="display-menu" role="group" aria-label="Display options">
            <span className="menu-label">Body length</span>
            <Segmented label="Vehicle body length" value={body} options={[{ id: 'extended', label: 'Extended 263.9″' }, { id: 'long', label: 'Long 235.5″' }]} onChange={setBody} />
            <span className="menu-label">Show on model</span>
            {check('Pin labels', showPins, setShowPins)}
            {check('2.60 m clearance plane', limit, setLimit)}
            {check('Rear door swing', doorSwing, setDoorSwing)}
            {!first && check('Cab provisioning', provision, setProvision)}
            {!first && layout === 'sheet' && check('Requested upgrades', requested, setRequested)}
          </div>}
        </div>

        <div className="viewport-foot">
          {addMode ? <p className="hint float">Click the van or equipment to place a point</p>
            : browing && view === 'cover' ? <p className="hint float legend"><span><i className="fan-front" />Forward and corner</span><span><i className="fan-side" />Rear-side</span><span><i className="fan-tail" />Tail</span><span>Fan length is schematic</span></p>
            : !hintSeen ? <p className="hint float">Drag to orbit · Scroll to zoom · Click a pin for details</p> : null}
          <Segmented className="view-switch float" label="Camera view" value={view} options={viewOptions} onChange={next => { setView(next); if (next === 'rear') setRearFrame(true); }} />
        </div>
      </section>

      <aside className="side-pane" aria-label="Build details">
        <nav className="tabs" aria-label="Details">
          {TABS.map(tab => <button key={tab.id} type="button" className={panel === tab.id ? 'active' : ''} aria-current={panel === tab.id ? 'page' : undefined} onClick={() => setPanel(tab.id)}>{tab.label}</button>)}
        </nav>
        <div className="side-content" key={panel}>
          {panel === 'parts' && <>
            <header className="pane-head"><h2>{SCHEMES.find(s => s.id === scheme)?.label}</h2><p>{intro[scheme].summary}</p></header>
            <div className="alert"><strong>{intro[scheme].alertTitle}</strong><p>{intro[scheme].alert}</p></div>

            {first && <Section title="Bench rotation">
              <Segmented className="fill" label="Connected bench rotation" value={seatSide ? 'aisle' : 'forward'} options={[{ id: 'aisle', label: 'Face the aisle' }, { id: 'forward', label: 'Face forward' }]}
                onChange={next => { setSeatSide(next === 'aisle'); if (view !== 'interior' && view !== 'plan') setView('plan'); }} />
            </Section>}

            {!first && layout === 'pathrunner' && <Section title="Gantry height">
              <Segmented className="fill" label="PathRunner crossarm height" value={gantryLevel} options={[{ id: 'roof', label: `Raised ${metres(heights.raisedBar)}` }, { id: 'lowered', label: `Lower ${metres(heights.loweredDeck)}` }]} onChange={setGantryLevel} />
            </Section>}

            {flipping && <Section title="Operate" action={<span className={`state ${flipLocked ? '' : 'released'}`} role="status">{flipLocked ? 'Latched' : 'Released'}</span>}>
              <div className="stack">
                <button type="button" className="btn" disabled={!flipLocked && !flipEndStop} onClick={() => setFlipLocked(value => !value)}>{flipLocked ? '1. Release latches' : flipEndStop ? '3. Latch at end stop' : 'Reach an end stop to latch'}</button>
                <Segmented className="fill" label="Flip direction" disabled={flipLocked} value={flipAngle === 0 ? 'outside' : flipAngle === 180 ? 'inside' : null} options={[{ id: 'outside', label: '2. Flip outside' }, { id: 'inside', label: '2. Flip inside' }]} onChange={next => setFlipAngle(next === 'inside' ? 180 : 0)} />
                <label className="slider" htmlFor="flip-angle">
                  <span>Manual position<output>{flipMotion.angle.toFixed(0)}°</output></span>
                  <input id="flip-angle" type="range" min="0" max="180" step="1" value={flipAngle} disabled={flipLocked} onChange={e => setFlipAngle(Number(e.target.value))} />
                  <span className="scale"><small>0° Working</small><small>90° Through hatch</small><small>180° Stowed</small></span>
                </label>
                {check('Sweep and cabin space', flipEnvelope, setFlipEnvelope)}
                <button type="button" className="link" onClick={() => setView('interior')}>See from inside</button>
              </div>
            </Section>}

            {annotations.length > 0 && <Section title="Your points" action={<button type="button" className="link" onClick={copyPointsLink}>{copiedPoints ? 'Link copied' : 'Copy link'}</button>}>
              {annotations.map((mark, index) => <div className={`part ${selectedAnnotation === mark.id ? 'open' : ''}`} key={mark.id}>
                <button type="button" className="row" aria-expanded={selectedAnnotation === mark.id} onClick={() => { setSelectedAnnotation(mark.id); setSelected(null); setView(mark.view); }}>
                  <span className="badge">U{index + 1}</span><span className="row-title">{mark.name}</span><i className="chev" aria-hidden="true" />
                </button>
                {selectedAnnotation === mark.id && <div className="fold-body point-editor">
                  <label>Name<input value={mark.name} onChange={e => setAnnotations(previous => previous.map(item => item.id === mark.id ? { ...item, name: e.target.value } : item))} /></label>
                  <p className="fine">Drag U{index + 1} on the model to move it.</p>
                  <button type="button" className="link danger" onClick={() => { setAnnotations(previous => previous.filter(item => item.id !== mark.id)); setSelectedAnnotation(null); }}>Delete point</button>
                </div>}
              </div>)}
            </Section>}

            {first
              ? <Section title="What lands in the van">
                {PHASE1_PARTS.map(id => <PartRow key={id} id={id} item={detail[id]} expanded={selected === id} onToggle={() => choose(id)} />)}
              </Section>
              : lists.filter(l => !l.layouts || l.layouts.includes(layout)).map(list => <Section title={list.title} key={list.title}>
                {list.items.map(id => <PartRow key={id} id={id} item={detailFor(id)} expanded={selected === id} onToggle={() => choose(id)} />)}
              </Section>)}
          </>}

          {panel === 'quote' && <>
            <header className="pane-head"><h2>Quoted, waiting on a decision</h2><p>Leonard USA walked the van on 21 October and quoted the phase-one interior on 30 October: air conditioning, insulation and liners, an inverter and wiring, with two crew seats as a separate option. The rear sensor carrier and the sensing package are phase two and are deliberately not in this quote.</p></header>
            <div className="quote-choice">
              <div><span>Option A</span><strong>{money(7449)}</strong><small>368-QUO-100610. A/C, insulation, liners, inverter, wiring</small></div>
              <div><span>Option B</span><strong>{money(11574)}</strong><small>368-QUO-100657. Option A plus two captain seats</small></div>
            </div>
            <p className="fine">Both quotes are dated 30 October 2026 and are identical apart from the seat kit, which adds {money(4125)} installed. Listed discounts of $288.97 are already applied and no sales tax is shown.</p>
            {!showPrices && <p className="fine notice">Figures are hidden on the shared link, because this URL has also been sent to competing upfitters. Add <code>?quote=1</code> to the address to show the quoted amounts.</p>}

            <Section title="Line items">
              {quoteGroups.map(group => <Fold key={group.title} title={group.title} aside={<span className="num">{money(group.lines.reduce((sum, line) => sum + line.ext, 0))}</span>}>
                <dl className="kv">{group.lines.map(line => <div key={line.name}><dt>{line.name}</dt><dd>{money(line.ext)}</dd></div>)}</dl>
              </Fold>)}
            </Section>
            <Section title="Schedule and terms">
              <dl className="kv">{quoteFacts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            </Section>
            <Section title="Open against this quote">
              {openItems.map(item => <Fold key={item.title} title={item.title} warn={!item.neutral}><p>{item.body}</p></Fold>)}
              <Fold title="Phase two stays open"><p>The rear carrier, the LiDAR and camera package, the survey-grade GNSS and the depth cameras are not priced here and are not fixed. The Parts tab holds that list, and the rack still needs measured equipment dimensions and weights before American Custom Design Vehicles can design or quote it.</p></Fold>
            </Section>
            <Section title="What Georgia Tech still owes Patrick">
              <ul className="plain">{gtOwes.map(line => <li key={line}>{line}</li>)}</ul>
            </Section>
          </>}

          {panel === 'dimensions' && <>
            <header className="pane-head"><h2>Dimensions</h2><p>Ford’s published 2026 Transit figures set the vehicle envelope. Hardware sizes and mounting positions stay conceptual until measured on the vehicle.</p></header>
            <Section title={`Heights · ${SCHEMES.find(s => s.id === scheme)?.label}`}>
              <dl className="kv">{heightRows.map(row => <div key={row.label} className={row.active ? 'active' : ''}><dt>{row.label}<small>{row.note}</small></dt><dd>{row.value}</dd></div>)}</dl>
            </Section>
            <Section title="Vehicle envelope">
              <dl className="kv"><div><dt>Overall length</dt><dd>{length}</dd></div><div><dt>Overall height, bare roof</dt><dd>{roofHeight}</dd></div><div><dt>Width, mirrors excluded</dt><dd>81.3 in / 2.07 m</dd></div><div><dt>Width, mirrors included</dt><dd>97.4 in / 2.47 m</dd></div><div><dt>Wheelbase</dt><dd>147.6 in / 3.75 m</dd></div><div><dt>Cargo length at floor</dt><dd>{body === 'extended' ? '172.2 in / 4.37 m' : '143.7 in / 3.65 m'}</dd></div><div><dt>Between wheelhouses</dt><dd>54.8 in / 1.39 m</dd></div></dl>
            </Section>
            <Section title="Open questions">
              <Fold warn title="Clearance conflict"><p>The sheet requests a finished height below 2.60 m for the 14th Street garage. Ford’s bare high roof is already {body === 'extended' ? '2.80' : '2.78'} m. Measure the actual vehicle and garage opening before any roof hardware is ordered.</p></Fold>
              <Fold warn title="Architecture decision"><p>Sheet beam: {metres(heights.sheet)}. Photo-style raised gantry: {metres(heights.pathrunner)}. Lowered crossarm: {metres(heights.lowered)} overall because the A/C remains on the roof; its sensor head at {metres(heights.loweredHead)} sits below the van roof and needs a sight-line test. Hardware heights are illustrative, not measured.</p></Fold>
              <Fold title="Body length still unconfirmed"><p>The VIN and photos do not settle whether this van is the 235.5 in long body or 263.9 in extended body. Use Display on the model to compare both.</p></Fold>
              <Fold title="Equipment measurements missing"><p>The rear carrier, LiDAR, cameras, A/C and reused rack have no measured dimensions in the sheets. Their 3D footprints are representative; request drawings and weigh the parts before installation.</p></Fold>
            </Section>
          </>}

          {panel === 'sources' && <>
            <header className="pane-head"><h2>Sources</h2><p>Ford supplies the vehicle envelope. Sensor and bracket dimensions in the model are assumptions for review, not fabrication measurements.</p></header>
            <Section title="Your sheets">
              <div className="source"><img src="sheets/sheet-layout.jpg" alt="Annotated roof layout sheet" /><div><strong>02 · Annotated sketch</strong><p className="fine">Per your clarification, the front object is A/C and the rear section is a PathRunner-like sensing setup. Handwritten labels in the sketch are not authoritative positions.</p><a href="sheets/sheet-layout.jpg" target="_blank" rel="noreferrer">Open image ↗</a></div></div>
              <div className="source"><img src="sheets/sheet-requirements.jpg" alt="Vehicle requirements table" /><div><strong>03 · Requirements</strong><p className="fine">Seats, workstation, storage, power and cabling, plus the handwritten sensor additions at the foot.</p><a href="sheets/sheet-requirements.jpg" target="_blank" rel="noreferrer">Open image ↗</a></div></div>
              <div className="source"><img src="sheets/sheet-inventory.jpg" alt="Old van equipment inventory" /><div><strong>Old van inventory</strong><p className="fine">Rack, 3 × LiDAR, industrial PC, bench and tool box as reuse candidates. Two lines are illegible and need a physical count.</p><a href="sheets/sheet-inventory.jpg" target="_blank" rel="noreferrer">Open image ↗</a></div></div>
              <div className="source"><img src="sheets/flip-sensor-reference.png" alt="User reference: complete sensor stack with Insta360 camera, GNSS, LiDAR and shared mounting plates" /><div><strong>Flip-in assembly reference</strong><p className="fine">Complete sensor stack on shared mounting plates. Model dimensions are illustrative.</p><a href="sheets/flip-sensor-reference.png" target="_blank" rel="noreferrer">Open image ↗</a></div></div>
              <Fold warn title="Roof openings still need a drawing"><p>Sheet 03 proposes a shared reinforced A/C and cable opening. The PathRunner reference photo instead shows two rear cable entries, while your corrected layout puts A/C at the front. The model shows the two-entry reference arrangement; actual cutouts and routes need a drawing.</p></Fold>
            </Section>
            <Section title="Vehicle data">
              <Fold title="VIN 1FTBW3X83TKA11541"><p>Decodes clean through NHTSA vPIC: 2026 Ford Transit-350 cargo van, high roof, RWD, 3.5 L V6, 147.6 in wheelbase, GVWR 9,500 lb, built at Claycomo. It cannot separate the 235.5 in body from the 263.9 in extended body — both use that wheelbase.</p></Fold>
              <Fold title="Ford dimensions"><p>Length, height, width, overhangs, load floor height and every cargo dimension come from Ford&rsquo;s published Transit table. The built model measures 6.703 × 2.804 × 2.065 m, matching 263.9 / 110.4 / 81.3 in exactly.</p></Fold>
            </Section>
            <Section title="PathRunner: what is worth copying">
              <Fold title="Comparable chassis, different roof problem"><p>Pathway Services list an extended-wheelbase Transit as a preferred chassis. The photo shows a rear cantilever and two sensor housings well above the roof. Their actual dimensions are not published here; the frame and height in this model are visual estimates for our high-roof van.</p></Fold>
              <Fold title="Rear sensing, two levels of detail"><p>The corrected base concept places the existing sensors on a rear carrier and the A/C forward. The PathRunner view adds the raised cantilever, two upper housings, lower pavement bar, DMI and front carrier as a reference. The lower crossarm option is hypothetical and may block forward views.</p></Fold>
              <Fold title="Reference computer stack"><p>NJDOT&rsquo;s operator manual shows a master Profiler computer plus separate roadway-camera and 3D computers, each slaved to the profiler for sync, each with its own removable hard drive, and a DMI control box in the cabin. Our sheet lists one industrial PC. If Tsai wants that full PathRunner-style collection set, size the rack and power for it.</p></Fold>
              <Fold title="DMI"><p>An optical wheel encoder on a road wheel, with a documented bounce, block and calibration procedure. The old van&rsquo;s flight case is labelled &ldquo;DMI, Encoder, GPS&rdquo;, so we may already own one.</p></Fold>
            </Section>
            <Section title="Not sourced">
              <Fold warn title="Every equipment size"><p>Sensor bodies, the crossbeam, the A/C unit, the reused rack and all cabin furniture are representative volumes in plausible positions. None are measured. Get drawings and weigh the parts before anything is fabricated.</p></Fold>
            </Section>
            <Section title="References">
              <div className="links">
                <a href="https://vpic.nhtsa.dot.gov/decoder/" target="_blank" rel="noreferrer">NHTSA VIN decoder ↗</a>
                <a href="https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2026/specs/2026_Ford_Transit_Specs.pdf" target="_blank" rel="noreferrer">Ford Transit technical specifications (PDF) ↗</a>
                <a href="https://www.pathwayservices.com/technology/" target="_blank" rel="noreferrer">Pathway Services · PathRunner technology ↗</a>
                <a href="https://idot.illinois.gov/about-idot/stay-connected/idot-blog/bureaus-of-research-and-programming-get-new-data-collection-vehi.html" target="_blank" rel="noreferrer">Illinois DOT · PathRunner on a Ford Transit ↗</a>
                <a href="https://dot.nj.gov/transportation/eng/pavement/pdf/Pathway-Startup.pdf" target="_blank" rel="noreferrer">NJDOT · PathRunner operator manual (PDF) ↗</a>
                <a href="https://dot.nj.gov/transportation/eng/pavement/pdf/Pathrunner-Calibrate.pdf" target="_blank" rel="noreferrer">NJDOT · PathRunner DMI calibration (PDF) ↗</a>
                <a href="https://www.pavemetrics.com/laser-crack-measurement-system-lcms-2/" target="_blank" rel="noreferrer">Pavemetrics · LCMS-2 ↗</a>
              </div>
            </Section>
          </>}
        </div>
      </aside>
    </main>
  </div>;
}
