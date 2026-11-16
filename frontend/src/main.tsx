import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./style.css";
type Project = {
  id: string;
  reference: string;
  name: string;
  category: string;
  currency: string;
  estimated_budget: string | null;
  target_date: string | null;
  description: string;
  status: string;
  updated_at: string;
};
const empty = {
  name: "",
  category: "",
  currency: "USD",
  estimated_budget: "",
  target_date: "",
  description: "",
};
function Icon({ n, list = false }: { n: number; list?: boolean }) {
  return (
    <span className="icon">
      <img alt="" src={`/assets/${list ? "list-" : ""}imgIcon${n || ""}.svg`} />
    </span>
  );
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw Error(
      typeof b.detail === "string"
        ? b.detail
        : "Please check your entries and try again.",
    );
  }
  return r.json();
}
function App() {
  const [route, setRoute] = useState(location.hash.slice(1));
  const [items, setItems] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [id, setId] = useState(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const fresh = route === "/new",
    detail = route.startsWith("/projects/"),
    formView = fresh || detail;
  function go(path: string) {
    location.hash = path;
  }
  useEffect(() => {
    const f = () => setRoute(location.hash.slice(1));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  async function load() {
    setLoading(true);
    setError("");
    setProject(null);
    try {
      if (detail) {
        const p = await api<Project>(`/api/projects/${route.split("/")[2]}`);
        setProject(p);
        setForm({
          ...p,
          estimated_budget: p.estimated_budget ?? "",
          target_date: p.target_date ?? "",
        });
      } else setItems(await api<Project[]>("/api/projects"));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load projects. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (fresh) {
      setForm({ ...empty });
      setId(crypto.randomUUID());
      setError("");
      setNotice("");
      setLoading(false);
    } else void load();
  }, [route]);
  function update(key: keyof typeof empty, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const p = await api<Project>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          id,
          name: form.name.trim(),
          estimated_budget: form.estimated_budget || null,
          target_date: form.target_date || null,
        }),
      });
      setNotice("Project saved successfully.");
      go(`/projects/${p.id}`);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "Saving could not be confirmed. Your entries are kept. Try saving again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visible = items.filter((p) =>
    `${p.name} ${p.reference}`.toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(visible.length / 6));
  return (
    <div className="layout">
      <aside>
        <div className="brand">
          <b>SD</b>
          <div>
            SDSS<small>DECISION SUPPORT</small>
          </div>
        </div>
        <p className="suite">PROCUREMENT SUITE</p>
        <nav>
          {[
            "Dashboard",
            "Purchasing Projects",
            "Suppliers",
            "Criteria & Weighting",
            "Evaluations",
            "Reports",
            "Settings",
          ].map((v, i) => (
            <button
              key={v}
              disabled={i !== 1}
              title={i !== 1 ? "Available in a later update" : undefined}
              className={i === 1 ? "active" : ""}
              onClick={() => go("/")}
            >
              <Icon n={14 + i} />
              {v}
            </button>
          ))}
        </nav>
        <div className="account">
          <b>DU</b>
          <div>
            Demo User<small>Procurement Officer</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="global-search">
            <Icon n={10} />
            Search projects, suppliers…
          </div>
          <span className="demo">DEMO WORKSPACE • SYNTHETIC DATA</span>
          <b className="avatar">DU</b>
          <div className="user">
            Demo User<small>Procurement Analyst (Demo)</small>
          </div>
        </header>
        <main className={formView ? "form-page" : "list-page"}>
          {formView ? (
            <>
              <button className="breadcrumb" onClick={() => go("/")}>
                ← Purchasing Projects{" "}
                <span>
                  /{" "}
                  {detail
                    ? project?.reference || "Project Details"
                    : "New Project Initialization"}
                </span>
              </button>
              <h1>
                {detail
                  ? "Purchasing Project Details"
                  : "Create Purchasing Project"}
              </h1>
              <p className="subtitle">
                {detail
                  ? "Saved project details. Supplier setup is coming in a later update."
                  : "Set up the basic details for your purchasing project to get started."}
              </p>
              <div className="stepper">
                {[
                  "Project Details",
                  "Add Suppliers",
                  "Criteria & Weights",
                  "Evaluate & Decide",
                ].map((v, i) => (
                  <div className={i === 0 ? "current" : ""} key={v}>
                    <b>{i + 1}</b>
                    <span>
                      {i + 1}. {v}
                      <small>{i === 0 ? "Active" : "Upcoming"}</small>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="list-heading">
              <div>
                <h1>Purchasing Projects</h1>
                <p className="subtitle">
                  Manage multi-criteria supplier evaluation projects and
                  decision workflows.
                </p>
              </div>
              <button className="primary" onClick={() => go("/new")}>
                <Icon n={0} list />
                Create Project
              </button>
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              {notice}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              {!fresh && <button onClick={() => void load()}>Try again</button>}
            </div>
          )}
          {loading ? (
            <p role="status">Loading projects…</p>
          ) : formView ? (
            (!detail || project) && (
              <form className="project-form" onSubmit={save}>
                <div className="card-heading">
                  <h2>
                    <Icon n={1} />
                    Project Details
                  </h2>
                  <small>* Required fields</small>
                </div>
                <fieldset disabled={detail || busy}>
                  <div className="fields">
                    <label className="wide">
                      Project Name <em>*</em>
                      <input
                        required
                        maxLength={200}
                        placeholder="Enter project name"
                        value={form.name}
                        onChange={(e) => update("name", e.target.value)}
                      />
                    </label>
                    <label>
                      Purchasing Category <small>(Optional)</small>
                      <select
                        value={form.category}
                        onChange={(e) => update("category", e.target.value)}
                      >
                        <option value="">Select a category</option>
                        {[
                          "IT & Hardware",
                          "Cloud Services",
                          "Manufacturing & Raw Materials",
                          "Energy Storage",
                          "Logistics & Supply Chain",
                          "Security & Compliance",
                          "Other",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Currency <em>*</em>
                      <select
                        value={form.currency}
                        onChange={(e) => update("currency", e.target.value)}
                      >
                        {["USD", "EUR", "GBP", "RUB", "GHS"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Estimated Budget <small>(Optional)</small>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max="99999999999999.99"
                        placeholder="0.00"
                        value={form.estimated_budget}
                        onChange={(e) =>
                          update("estimated_budget", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Target Completion Date <small>(Optional)</small>
                      <input
                        type="date"
                        value={form.target_date}
                        onChange={(e) => update("target_date", e.target.value)}
                      />
                    </label>
                    <label className="wide">
                      Project Description <small>(Optional)</small>
                      <textarea
                        maxLength={5000}
                        placeholder="Describe the purchasing project and what you want to compare."
                        value={form.description}
                        onChange={(e) => update("description", e.target.value)}
                      />
                    </label>
                  </div>
                </fieldset>
                <div className="info">
                  <Icon n={6} />
                  <div>
                    <strong>
                      {detail
                        ? `Saved as ${project?.reference} • Draft`
                        : "Save your project details"}
                    </strong>
                    <small>
                      {detail
                        ? "These details are stored in your cloud database."
                        : "Supplier setup will be available in a later update."}
                    </small>
                  </div>
                </div>
                <footer>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => go("/")}
                  >
                    {detail ? "← Back to Projects" : "Cancel"}
                  </button>
                  {!detail && (
                    <button className="primary" disabled={busy}>
                      {busy ? "Saving…" : "Create Project"}
                      <Icon n={9} />
                    </button>
                  )}
                </footer>
              </form>
            )
          ) : (
            <>
              <div className="toolbar">
                <label className="search">
                  <Icon n={1} list />
                  <input
                    aria-label="Search projects"
                    placeholder="Search by project name or reference…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <span className="tab">All ({items.length})</span>
              </div>
              <section className="table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Project Name & Reference",
                          "Category",
                          "Suppliers",
                          "Status",
                          "Last Updated",
                          "Actions",
                        ].map((v) => (
                          <th key={v}>{v}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible
                        .slice(
                          (Math.min(page, pages) - 1) * 6,
                          Math.min(page, pages) * 6,
                        )
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              <div className="project-name">
                                <span className="project-icon">
                                  <Icon n={3} list />
                                </span>
                                <div>
                                  <strong>{p.name}</strong>
                                  <small>{p.reference}</small>
                                </div>
                              </div>
                            </td>
                            <td>{p.category || "Not specified"}</td>
                            <td>0 Added</td>
                            <td>
                              <span className="chip">Draft</span>
                            </td>
                            <td>
                              {new Date(p.updated_at).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )}
                            </td>
                            <td>
                              <button
                                className="open-project"
                                onClick={() => {
                                  setNotice("");
                                  go(`/projects/${p.id}`);
                                }}
                              >
                                Open Project
                                <Icon n={5} list />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!visible.length && (
                  <div className="empty">
                    <h2>
                      {items.length
                        ? "No matching projects"
                        : "No purchasing projects yet"}
                    </h2>
                    <p>
                      {items.length
                        ? "Try another project name or reference."
                        : "Create your first purchasing project to get started."}
                    </p>
                    {!items.length && (
                      <button className="primary" onClick={() => go("/new")}>
                        Create Project
                      </button>
                    )}
                  </div>
                )}
                <div className="pagination">
                  <span>
                    {visible.length} project{visible.length === 1 ? "" : "s"}
                  </span>
                  <div>
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      {Math.min(page, pages)} / {pages}
                    </span>
                    <button
                      disabled={page >= pages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
