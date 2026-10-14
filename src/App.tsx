import { useEffect, useMemo, useState } from "react";
import { seedProjects } from "./seed-projects";
import { isSupabaseConfigured, loadProjects } from "./supabase";
import type { Project } from "./types";

const labels = { all: "All", apartments: "Apartments", "mixed-use": "Mixed use", commercial: "Commercial" } as const;

export default function App() {
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<keyof typeof labels>("all");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState(isSupabaseConfigured ? "Connecting to the live catalog…" : "Previewing the verified research seed. Connect Supabase for live data.");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    loadProjects().then((rows) => {
      if (rows?.length) { setProjects(rows); setNotice("Live catalog connected."); }
      else setNotice("The live catalog is empty, so the research seed is shown.");
    }).catch(() => setNotice("The live catalog could not be loaded, so the research seed is shown.")).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => (category === "all" || project.category === category) && (!needle || `${project.name} ${project.locationText} ${project.status}`.toLowerCase().includes(needle)));
  }, [projects, query, category]);

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
        <p className="source-notice" aria-live="polite">{loading ? "Loading…" : notice}</p>
      </section>

      <section className="catalog" aria-labelledby="catalog-title">
        <div className="section-heading"><div><p className="eyebrow">Current catalog</p><h2 id="catalog-title">Tracked projects</h2></div><strong>{visible.length} result{visible.length === 1 ? "" : "s"}</strong></div>
        <div className="filters" role="group" aria-label="Filter projects by category">
          {Object.entries(labels).map(([value, label]) => <button key={value} className={category === value ? "active" : ""} onClick={() => setCategory(value as keyof typeof labels)}>{label}</button>)}
        </div>
        <div className="grid">
          {visible.map((project) => <article className="card" key={project.id}>
            <div className="card-top"><span className={`category ${project.category}`}>{labels[project.category]}</span><time dateTime={project.statusAsOf}>{new Date(`${project.statusAsOf}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time></div>
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
      <section className="method"><p className="eyebrow">How to read this</p><h2>A record is a signal, not a promise.</h2><p>Planning approval, a permit, and an opening are different events. This catalog keeps the source and date visible so you can see exactly what is known—and what is not.</p></section>
    </main>
    <footer><p>What’s Coming? Carlsbad</p><p>Research prototype · Updated October 14, 2026</p></footer>
  </>;
}
