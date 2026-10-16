import { useEffect, useMemo, useState } from "react";
import { seedProjects } from "./seed-projects";
import LocationMap from "./LocationMap";
import { isSupabaseConfigured, loadBusinessSignals, loadIngestionHealth, loadProjects } from "./supabase";
import type { BusinessSignal, IngestionHealth, Project } from "./types";

const labels = { all: "All", apartments: "Apartments", "mixed-use": "Mixed use", commercial: "Commercial" } as const;
const signalLabels = { all: "Current signals", pending_application: "Pending applications", recently_changed: "Recently changed" } as const;
const evidenceLabels = { baseline_pending: "Baseline pending", new_pending: "New pending", changed: "Recently changed" } as const;
const formatDate = (value: string) => new Date(value.includes("T") ? value : `${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const formatAddress = (value: string) => value.toLowerCase().replace(/(^|[\s,.-])([a-z])/g, (_, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`).replace(/, Ca\b/, ", CA");

function SignalDetails({ signal }: { signal: BusinessSignal }) {
  return <details className="signal-details">
    <summary>Application details</summary>
    <dl>
      <div><dt>Legal applicant</dt><dd>{signal.legalApplicant ?? "Not listed"}</dd></div>
      <div><dt>Last verified</dt><dd>{formatDate(signal.lastSeenAt)}</dd></div>
    </dl>
  </details>;
}

function CountyCheck({ signal }: { signal: BusinessSignal }) {
  const check = signal.countyCheck;
  if (!check) return <div className="county-check no-match"><strong>County food permit</strong><span>No matching facility found in the latest County snapshot.</span></div>;
  const exact = check.matchLevel === "name_and_address";
  return <div className={`county-check ${exact ? "exact" : "address-only"}`}>
    <div><strong>{exact ? "County facility match" : "County permit at this address"}</strong><span>{check.facilityName}{check.permitStatus ? ` · ${check.permitStatus}` : ""}{check.activePermit === "A" ? " · Active" : ""}</span></div>
    <a href={check.sourceUrl} target="_blank" rel="noreferrer">County source<span aria-hidden="true">↗</span></a>
    {!exact && <small>The address matches, but the County facility name differs. This may be a prior tenant or a separate suite.</small>}
  </div>;
}

function DehqCheck({ signal }: { signal: BusinessSignal }) {
  const check = signal.dehqCheck;
  if (!check) return null;
  const exact = check.matchLevel === "name_and_address";
  return <div className={`government-check dehq-check ${exact ? "exact" : "address-only"}`}>
    <div><strong>{exact ? "DEHQ food-plan match" : "DEHQ food plan at this address"}</strong><span>{check.projectName} · {check.status} · Filed {formatDate(check.openedDate)}</span></div>
    <a href={check.sourceUrl} target="_blank" rel="noreferrer">Plan-check record<span aria-hidden="true">↗</span></a>
    {!exact && <small>The address matches, but the plan name differs. This may be a prior tenant or another suite.</small>}
  </div>;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [signals, setSignals] = useState<BusinessSignal[]>([]);
  const [health, setHealth] = useState<IngestionHealth | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<keyof typeof labels>("all");
  const [signalFilter, setSignalFilter] = useState<keyof typeof signalLabels>("all");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState(isSupabaseConfigured ? "Connecting to the live catalog…" : "Previewing the verified research seed. Connect Supabase for live data.");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    Promise.all([loadProjects(), loadBusinessSignals(), loadIngestionHealth()]).then(([rows, businessSignals, ingestionHealth]) => {
      if (rows?.length) setProjects(rows);
      setSignals(businessSignals);
      setHealth(ingestionHealth);
      setNotice(rows?.length ? "Live Supabase catalog connected." : "The live catalog is empty, so the verified research seed is shown.");
    }).catch(() => setNotice("Live data could not be loaded, so the verified research seed is shown.")).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => (category === "all" || project.category === category) && (!needle || `${project.name} ${project.locationText} ${project.status}`.toLowerCase().includes(needle)));
  }, [projects, query, category]);

  const visibleSignals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return signals.filter((signal) => (signalFilter === "all" || signal.signalKind === signalFilter) && (!needle || `${signal.displayName} ${signal.legalApplicant ?? ""} ${signal.address} ${signal.suite ?? ""} ${signal.status}`.toLowerCase().includes(needle)));
  }, [signals, signalFilter, query]);

  return <>
    <header className="masthead">
      <a className="brand" href="#top" aria-label="What's Coming Carlsbad home"><span className="brand-mark">WC</span><span>What’s Coming?<small>Carlsbad</small></span></a>
      <span className="research-tag">Public-records beta</span>
    </header>
    <main id="top">
      <section className="hero">
        <p className="eyebrow">Find the story behind an address</p>
        <h1>See what may be coming to Carlsbad.</h1>
        <p className="lede">Search proposed housing, mixed-use projects, commercial permits and licensing signals—each tied to its public source.</p>
        <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search an address or project" aria-label="Search an address or project" /></label>
        <p className={`source-notice ${isSupabaseConfigured ? "live" : "demo"}`} aria-live="polite"><strong>{isSupabaseConfigured ? "Live data" : "Demonstration data"}</strong> · {loading ? "Loading…" : notice}</p>
      </section>

      <section className="signals" aria-labelledby="signals-title">
        <div className="section-heading"><div><p className="eyebrow">Licensing intelligence</p><h2 id="signals-title">Restaurant &amp; Business Signals</h2></div><strong>{visibleSignals.length} current signal{visibleSignals.length === 1 ? "" : "s"}</strong></div>
        <div className="health" aria-label="ABC ingestion health">
          <span><small>Last verified import</small>{health?.lastSuccessfulImportAt ? formatDate(health.lastSuccessfulImportAt) : "Not imported yet"}</span>
          <span><small>Data retrieved</small>{health?.dataRetrievedAt ? formatDate(health.dataRetrievedAt) : "Awaiting first run"}</span>
          <span><small>Carlsbad records</small>{health?.trackedRecordCount ?? 0}</span>
        </div>
        <p className="section-intro">This list now includes only APP/PEND records present in the latest ABC export. Baseline records may be longstanding; new records are those first observed after monitoring began. Neither is an opening announcement.</p>
        <div className="filters" role="group" aria-label="Filter restaurant and business signals">
          {Object.entries(signalLabels).map(([value, label]) => <button key={value} className={signalFilter === value ? "active" : ""} onClick={() => setSignalFilter(value as keyof typeof signalLabels)}>{label}</button>)}
        </div>
        <div className="signal-list">
          {visibleSignals.map((signal) => <article className="signal-card" key={signal.id}>
            <div className="signal-identity"><span className={`signal-kind ${signal.evidenceLevel}`}>{evidenceLabels[signal.evidenceLevel]}</span><h3>{signal.displayName}</h3><p className="location">{formatAddress(signal.fullAddress)}</p><LocationMap address={signal.fullAddress} label={`${signal.displayName} at ${formatAddress(signal.fullAddress)}`} /><DehqCheck signal={signal} /><CountyCheck signal={signal} /></div>
            <dl><div><dt>ABC status</dt><dd>{signal.licenseOrApplication} · {signal.status}</dd></div><div><dt>License type{signal.licenseTypes.length === 1 ? "" : "s"}</dt><dd>{signal.licenseTypes.join(", ")}</dd></div><div><dt>{signal.isBaseline ? "Monitoring baseline" : "First detected"}</dt><dd>{formatDate(signal.firstSeenAt)}</dd></div>{signal.sourceDate && <div><dt>Source date</dt><dd>{formatDate(signal.sourceDate)}</dd></div>}</dl>
            <div className="signal-context">
              <p className="uncertainty">{signal.uncertaintyNote}</p>
              <SignalDetails signal={signal} />
              <a className="source-link" href={signal.sourceUrl} target="_blank" rel="noreferrer">View official ABC source<span aria-hidden="true">↗</span></a>
            </div>
          </article>)}
          {!loading && !visibleSignals.length && <p className="empty">No live ABC signals have been published yet. The development catalog below remains available from the verified project data.</p>}
        </div>
      </section>

      <section className="catalog" aria-labelledby="catalog-title">
        <div className="section-heading"><div><p className="eyebrow">Development catalog</p><h2 id="catalog-title">Tracked projects</h2></div><strong>{visible.length} result{visible.length === 1 ? "" : "s"}</strong></div>
        <div className="filters" role="group" aria-label="Filter projects by category">
          {Object.entries(labels).map(([value, label]) => <button key={value} className={category === value ? "active" : ""} onClick={() => setCategory(value as keyof typeof labels)}>{label}</button>)}
        </div>
        <div className="grid">
          {visible.map((project) => <article className="card" key={project.id}>
            <div className="card-top"><span className={`category ${project.category}`}>{labels[project.category]}</span><time dateTime={project.statusAsOf}>{formatDate(project.statusAsOf)}</time></div>
            <h3>{project.name}</h3><p className="location">{project.locationText}</p>
            <dl>
              {project.proposedUnits !== null && <div><dt>Homes</dt><dd>{project.proposedUnits.toLocaleString()}</dd></div>}
              {project.affordableUnits !== null && <div><dt>Affordable</dt><dd>{project.affordableUnits.toLocaleString()}</dd></div>}
              {project.commercialSqft !== null && <div><dt>Commercial</dt><dd>{project.commercialSqft.toLocaleString()} sq ft</dd></div>}
            </dl>
            <div className="status"><span></span><p><small>Documented status</small>{project.status}</p></div>
            <a className="source-link" href={project.sourceUrl} target="_blank" rel="noreferrer">View {project.evidenceLabel}<span aria-hidden="true">↗</span></a>
          </article>)}
          {!visible.length && <p className="empty">No projects match that search yet.</p>}
        </div>
      </section>
      <section className="method"><p className="eyebrow">How to read this</p><h2>A record is a signal, not a promise.</h2><p>Planning approval, a permit, a license application and an opening are different events. This catalog keeps the source and date visible so you can see exactly what is known—and what is not.</p></section>
    </main>
    <footer><p>What’s Coming? Carlsbad</p><p>Public-records beta · Source dates remain visible on every record</p></footer>
  </>;
}
