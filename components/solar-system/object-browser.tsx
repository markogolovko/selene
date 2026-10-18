'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, Orbit } from 'lucide-react';
import { bodies, type BodyName } from '@/lib/solar-data';

export type ObjectBrowserProps = { selected: BodyName | null; onSelect: (name: BodyName | null) => void };
const planetsAndSun = bodies.filter((body) => !('parent' in body) && body.kind !== 'DWARF PLANET' && body.kind !== 'NEAR-EARTH ASTEROID');
const dwarfPlanets = bodies.filter((body) => body.kind === 'DWARF PLANET');
const asteroids = bodies.filter((body) => body.kind === 'NEAR-EARTH ASTEROID');
const groups = [
  { id: 'planets', label: 'SUN & PLANETS', items: planetsAndSun },
  { id: 'dwarfs', label: 'DWARF PLANETS', items: dwarfPlanets },
  { id: 'asteroids', label: 'ASTEROIDS', items: asteroids },
];
const primaryBodies = groups.flatMap((group) => group.items);
const moonsGroupId = (name: string) => `moons-${name.toLowerCase().replaceAll(' ', '-')}`;

export function ObjectBrowser({ selected, onSelect }: ObjectBrowserProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({});
  const body = selected ? bodies.find((item) => item.name === selected) : null;
  const selectedSystem = body && 'parent' in body ? body.parent : body?.name;
  const selectedPrimary = body && 'parent' in body ? bodies.find((item) => item.name === body.parent) : body;
  const selectedGroup = groups.find((group) => group.items.some((item) => item.name === selectedPrimary?.name));

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const updateScrollCue = () => {
      setHasMoreBelow(list.scrollHeight > list.clientHeight + 2 && list.scrollTop + list.clientHeight < list.scrollHeight - 2);
    };
    updateScrollCue();
    list.addEventListener('scroll', updateScrollCue, { passive: true });
    window.addEventListener('resize', updateScrollCue);
    return () => {
      list.removeEventListener('scroll', updateScrollCue);
      window.removeEventListener('resize', updateScrollCue);
    };
  }, [groupOverrides, selected]);

  const toggleGroup = (id: string, isOpen: boolean) => setGroupOverrides((current) => ({ ...current, [id]: !isOpen }));

  return <aside className="object-panel" aria-label="Explore celestial bodies">
    <div className="object-panel-list" ref={listRef}>
      <div className="panel-heading"><span>EXPLORE</span><span>{bodies.length} OBJECTS</span></div>
      <button className={`object-row overview-row ${selected === null ? 'active' : ''}`} onClick={() => onSelect(null)} aria-pressed={selected === null}><Orbit size={17} /><span>Whole system</span><span className="row-index">↗</span></button>
      {groups.map((group) => {
        const groupIsOpen = groupOverrides[group.id] ?? group.id === selectedGroup?.id;
        const groupContentId = `object-group-${group.id}`;
        return <section className="object-group" key={group.id}>
          <button className={`object-group-heading group-toggle ${groupIsOpen ? 'expanded' : ''}`} type="button" onClick={() => toggleGroup(group.id, groupIsOpen)} aria-expanded={groupIsOpen} aria-controls={groupContentId}>
            <span>{group.label}</span><span className="group-count">{group.items.length}</span><ChevronDown size={14} className="group-chevron" />
          </button>
          <div className="object-group-items" id={groupContentId} hidden={!groupIsOpen}>
            {group.items.map((item) => {
              const index = primaryBodies.indexOf(item);
              const satellites = bodies.filter((candidate) => 'parent' in candidate && candidate.parent === item.name);
              const itemMoonsGroupId = moonsGroupId(item.name);
              const moonsContentId = `object-group-${itemMoonsGroupId}`;
              const moonsAreOpen = groupOverrides[itemMoonsGroupId] ?? selectedSystem === item.name;
              return <Fragment key={item.name}>
                <button className={`object-row ${selected === item.name ? 'active' : ''}`} onClick={() => {
                  if (satellites.length > 0) setGroupOverrides((current) => ({ ...current, [itemMoonsGroupId]: true }));
                  onSelect(item.name);
                }} aria-pressed={selected === item.name}><span className="body-dot" style={{ background: item.color }} /><span>{item.name}</span><span className="row-index">{String(index).padStart(2, '0')}</span></button>
                {selectedSystem === item.name && satellites.length > 0 && <div className="moon-group">
                  <button className={`object-group-heading moon-group-heading group-toggle ${moonsAreOpen ? 'expanded' : ''}`} type="button" onClick={() => toggleGroup(itemMoonsGroupId, moonsAreOpen)} aria-expanded={moonsAreOpen} aria-controls={moonsContentId}>
                    <span>MOONS OF {item.name.toUpperCase()}</span><span className="group-count">{satellites.length}</span><ChevronDown size={13} className="group-chevron" />
                  </button>
                  <div className="object-group-items moon-group-items" id={moonsContentId} hidden={!moonsAreOpen}>
                    {satellites.map((satellite) => <button key={satellite.name} className={`object-row satellite-row ${selected === satellite.name ? 'active' : ''}`} onClick={() => onSelect(satellite.name)} aria-pressed={selected === satellite.name}><span className="body-dot" style={{ background: satellite.color }} /><span>{satellite.name}</span><span className="row-index">↳ {item.name.toUpperCase()}</span></button>)}
                  </div>
                </div>}
              </Fragment>;
            })}
          </div>
        </section>;
      })}
    </div>
    {hasMoreBelow && <div className="object-scroll-cue" aria-hidden="true">SCROLL TO EXPLORE MORE <ChevronDown size={13} /></div>}
  </aside>;
}
