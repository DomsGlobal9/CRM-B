/* Inventory > Racks & shelves: where inside a location the stock sits
   (apps/inventory/shelves.py). Area -> rack / cupboard -> shelf -> box, each
   with an address (FLOOR-C2-1) and a QR label. The location keeps the one
   official quantity; shelves only say where some of it is, and the rest is
   "Not shelved". Every screen is phone-first and scan-first: a shelf label's
   QR (camera or a USB / Bluetooth scanner typing into the box) or a typed
   address ("c2 1"). Who sees which view follows the inventory work the owner
   handed the role (move: stock or transfer; set up: items). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, AlertTriangle, ClipboardCheck, Layers, MapPin, Move, PackagePlus } from 'lucide-react';
import { api } from '../../../api';
import Loader from '../../../components/ui/Loader';
import CountShelf from './CountShelf';
import MoveStock from './MoveStock';
import Problems from './Problems';
import PutAway from './PutAway';
import RackSetup from './RackSetup';
import WhereIsIt from './WhereIsIt';
import './shelves.css';
import { SHELVES_LOCATION_KEY, SHELVES_VIEW_KEY } from '../../../constants/storageKeys';

const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

const recall = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };

export default function ShelvesTab({ canMove = false, canManage = false }) {
  const [locations, setLocations] = useState(null);
  const [locationId, setLocationId] = useState(recall(SHELVES_LOCATION_KEY));
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [openIssues, setOpenIssues] = useState(0);
  const views = useMemo(() => [
    { key: 'where', label: 'Where is it?', icon: Search },
    canMove && { key: 'putaway', label: 'Put away', icon: PackagePlus },
    canMove && { key: 'move', label: 'Move', icon: Move },
    canMove && { key: 'count', label: 'Count a shelf', icon: ClipboardCheck },
    { key: 'problems', label: 'Problems', icon: AlertTriangle },
    canManage && { key: 'setup', label: 'Set up racks', icon: Layers },
  ].filter(Boolean), [canMove, canManage]);
  const [viewPick, setViewPick] = useState(recall(SHELVES_VIEW_KEY));
  const view = views.some((v) => v.key === viewPick) ? viewPick : 'where';
  const setView = (key) => { setViewPick(key); remember(SHELVES_VIEW_KEY, key); };

  useEffect(() => {
    api.getStockLocations({ active: 'true' })
      .then((rows) => setLocations(rows || []))
      .catch((err) => { setError(err.message || 'Could not load the locations.'); setLocations([]); });
  }, []);
  const location = (locations || []).find((l) => String(l.id) === String(locationId))
    || (locations || []).find((l) => l.is_default) || (locations || [])[0] || null;

  const reload = useCallback(() => {
    if (!location) return Promise.resolve();
    return Promise.all([
      api.getShelfTree(location.id).then(setTree),
      api.getShelfIssues({ status: 'OPEN', location: location.id }).then((d) => setOpenIssues(d?.open_count || 0)),
    ]).catch((err) => setError(err.message || 'Could not load the shelves.'));
  }, [location]);
  useEffect(() => { reload(); }, [reload]);

  if (locations === null) return <Loader page label="Loading shelves…" />;
  if (!location) {
    return <div className="sh-empty">Add a location (a store or a godown) first, on the Locations tab.</div>;
  }
  const leaves = (tree || []).filter((s) => s.is_leaf);

  return (
    <div className="sh">
      <div className="sh-top">
        <div className="sh-top-left">
          <label className="sh-location">
            <span className="sh-location-label">Location</span>
            <MapPin size={15} aria-hidden="true" className="sh-location-icon" />
            <select className="form-control" value={location.id} aria-label="Location"
                    onChange={(e) => { setLocationId(e.target.value); remember(SHELVES_LOCATION_KEY, e.target.value); setTree(null); }}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>
        <div className="sh-views" role="tablist" aria-label="Racks & shelves">
          {views.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" role="tab" aria-selected={view === key}
                    className={`sh-view${view === key ? ' is-on' : ''}`} onClick={() => setView(key)}>
              <Icon size={15} /> {label}
              {key === 'problems' && openIssues > 0 && <span className="sh-badge">{openIssues}</span>}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="sh-error" role="alert">{error}</div>}
      {tree === null ? <Loader label="Loading shelves…" /> : (
        <>
          {tree.length === 0 && view !== 'setup' && (
            <div className="sh-empty">
              No racks or shelves at {location.name} yet.
              {canManage
                ? <> <button type="button" className="at-link" onClick={() => setView('setup')}>Set up racks</button> to start.</>
                : ' The owner can set them up.'}
            </div>
          )}
          {view === 'where' && <WhereIsIt location={location} />}
          {view === 'putaway' && tree.length > 0 && <PutAway location={location} leaves={leaves} onDone={reload} />}
          {view === 'move' && tree.length > 0 && <MoveStock location={location} leaves={leaves} onDone={reload} />}
          {view === 'count' && tree.length > 0 && <CountShelf location={location} leaves={leaves} onDone={reload} />}
          {view === 'problems' && <Problems location={location} canManage={canManage} onChange={reload} />}
          {view === 'setup' && <RackSetup location={location} tree={tree} onDone={reload} />}
        </>
      )}
    </div>
  );
}
