import { Dashboard, WORKFLOW_STATUSES } from './dashboard';
import { AIWeighting } from './ai';
import { AhpWeighting } from './ahp';
import { DecisionReport } from './report';
import { FinalDecision } from './decision';
import { Sensitivity } from './sensitivity';
import { Rankings } from './rankings';
import { EvaluationMatrix } from './matrix';
import { Eligibility } from './eligibility';
import { ManualWeighting } from './weighting';
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./style.css";
import { api } from "./api";
import { Suppliers } from "./suppliers";
import { Criteria } from "./criteria";
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
  supplier_count?: number;
  workflow_status?: string;
  workflow_stage?: string;
  resume_path?: string;
  last_activity_at?: string;
  decision_id?: string | null;
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
function App() {
  const [route, setRoute] = useState(location.hash.slice(1));
  const [items, setItems] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [id, setId] = useState(crypto.randomUUID());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter,setStatusFilter]=useState("All");
  const dashboardView=route==="/dashboard";
  const fresh = route === "/new",
    detail = route.startsWith("/projects/"),
    formView = fresh || detail;
  const supplierView = detail && route.endsWith("/suppliers");
  const criteriaView = detail && route.endsWith("/criteria");
  const aiView = detail && route.endsWith("/weights/ai");
  const ahpView = detail && route.endsWith("/weights/ahp");
  const weightingView = detail && route.endsWith("/weights/manual");
  const eligibilityView = detail && route.endsWith("/eligibility");
  const reportView = detail && route.split("/")[3] === "reports";
  const decisionView = detail && route.endsWith("/decision");
  const sensitivityView = detail && route.endsWith("/sensitivity");
  const rankingsView = detail && route.endsWith("/rankings");
  const matrixView = detail && route.endsWith("/matrix");
  const stage = reportView || decisionView || sensitivityView || rankingsView || matrixView || eligibilityView ? 3 : criteriaView || weightingView || ahpView || aiView ? 2 : supplierView ? 1 : 0;
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
    setEditing(false);
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
      const p = await api<Project>(editing && project ? `/api/projects/${project.id}` : "/api/projects", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          id,
          ...(editing && project ? { expected_updated_at: project.updated_at } : {}),
          name: form.name.trim(),
          estimated_budget: form.estimated_budget || null,
          target_date: form.target_date || null,
        }),
      });
      setNotice(editing ? "Project changes saved successfully." : "Project saved successfully.");
      if (editing) {
        setProject(p);
        setForm({ ...p, estimated_budget: p.estimated_budget ?? "", target_date: p.target_date ?? "" });
        setEditing(false);
      }
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
    `${p.name} ${p.reference} ${p.category}`.toLowerCase().includes(search.toLowerCase()) && (statusFilter==="All"||(p.workflow_status||p.status)===statusFilter),
  );
  const pages = Math.max(1, Math.ceil(visible.length / 6));
  useEffect(()=>{setPage(current=>Math.min(current,pages));},[pages]);
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
        <nav aria-label="Main navigation">
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
              aria-current={(i===0&&dashboardView)||(i===1&&!dashboardView)?"page":undefined}
              key={v}
              disabled={i !== 1 && i !== 0}
              title={i !== 1 && i !== 0 ? "Available in a later update" : undefined}
              className={(i===0&&dashboardView)||(i===1&&!dashboardView)?"active":""}
              onClick={() => go(i===0?"/dashboard":"/")}
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
            Supplier decision workspace
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
                  ? reportView ? "Saved Decision Report" : decisionView ? "Final Purchasing Decision" : sensitivityView ? "Sensitivity Analysis" : rankingsView ? "Supplier Rankings" : matrixView ? "Supplier Evaluation Matrix" : eligibilityView ? "Supplier Eligibility Review" : aiView ? "AI Weight Suggestions" : ahpView ? "AHP Weighting" : weightingView ? "Manual Weighting" : criteriaView ? "Evaluation Criteria" : supplierView ? "Add Suppliers" : "Purchasing Project Details"
                  : "Create Purchasing Project"}
              </h1>
              <p className="subtitle">
                {detail
                  ? reportView ? "Review or download the report for a saved decision version." : decisionView ? "Record the human purchasing decision and its reasons." : sensitivityView ? "Compare rankings under different criterion weights." : rankingsView ? "Review calculated supplier scores." : matrixView ? "Enter supplier values for comparison." : eligibilityView ? "Review mandatory supplier requirements." : aiView ? "Request, review and approve advisory criterion weights." : ahpView ? "Compare criteria in pairs and review consistency." : weightingView ? "Assign and approve criterion importance." : criteriaView ? "Configure scoring criteria and mandatory requirements." : supplierView ? "Add the suppliers you want to compare for this project." : "Review your project details or continue to supplier setup."
                  : "Set up the basic details for your purchasing project to get started."}
              </p>
              <div className="stepper">
                {[
                  "Project Details",
                  "Add Suppliers",
                  "Criteria & Weights",
                  "Evaluate & Decide",
                ].map((v, i) => (
                  <div className={i === stage ? "current" : ""} key={v}>
                    <b>{i + 1}</b>
                    <span>
                      {i + 1}. {v}
                      <small>{i === stage ? "Active" : i < stage ? "Completed" : "Upcoming"}</small>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="list-heading">
              <div>
                <h1>{dashboardView?"Dashboard":"Purchasing Projects"}</h1>
                <p className="subtitle">
                  {dashboardView?"Track saved projects, current approvals and work needing review.":"Manage multi-criteria supplier evaluation projects and decision workflows."}
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
              {!fresh && !editing && <button onClick={() => void load()}>Try again</button>}
            </div>
          )}
          {loading ? (
            <p role="status">Loading projects…</p>
          ) : error && !formView ? (<p role="status">Saved project data could not be refreshed. Use Try again above.</p>) : dashboardView ? (
            <Dashboard onRefresh={()=>void load()} projects={items} onFilter={status=>{setStatusFilter(status);setSearch("");setPage(1);go("/");}} onOpen={p=>{setNotice("");go(p.resume_path||`/projects/${p.id}`);}} onReport={p=>go(`/projects/${p.id}/reports/${p.decision_id}`)} />
          ) : reportView && project ? (
            <DecisionReport key={route} projectId={project.id} decisionId={route.split("/")[4]} />
          ) : decisionView && project ? (
            <FinalDecision key={project.id} projectId={project.id} />
          ) : sensitivityView && project ? (
            <Sensitivity key={project.id} projectId={project.id} />
          ) : rankingsView && project ? (
            <Rankings key={project.id} projectId={project.id} />
          ) : matrixView && project ? (
            <EvaluationMatrix key={project.id} projectId={project.id} />
          ) : eligibilityView && project ? (
            <Eligibility key={project.id} projectId={project.id} />
          ) : aiView && project ? (
              <AIWeighting key={project.id} projectId={project.id} />
            ) : ahpView && project ? (
              <AhpWeighting key={project.id} projectId={project.id} />
            ) : weightingView && project ? (
            <ManualWeighting key={project.id} projectId={project.id} />
          ) : criteriaView && project ? (
            <Criteria key={project.id} projectId={project.id} />
          ) : supplierView && project ? (
            <Suppliers key={project.id} projectId={project.id} reference={project.reference} />
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
                <fieldset disabled={(detail && !editing) || busy}>
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
                {editing && project && form.currency !== project.currency && (
                  <p className="info" role="status">Currency changed. The budget number has not been converted. Please review the budget before saving.</p>
                )}
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
                        : "After saving, you can add suppliers to this project."}
                    </small>
                  </div>
                </div>
                <footer>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (editing && project) {
                        setForm({ ...project, estimated_budget: project.estimated_budget ?? "", target_date: project.target_date ?? "" });
                        setEditing(false); setError(""); setNotice("");
                      } else go("/");
                    }}
                  >
                    {editing ? "Cancel Editing" : detail ? "← Back to Projects" : "Cancel"}
                  </button>
                  {detail && !editing && <div className="actions"><button type="button" className="secondary" onClick={() => { setEditing(true); setNotice(""); }}>Edit Project</button><button type="button" className="primary" onClick={() => {setNotice(""); go(`/projects/${project?.id}/suppliers`);}}>Continue to Add Suppliers →</button></div>}
                  {(!detail || editing) && (
                    <button className="primary" disabled={busy}>
                      {busy ? "Saving…" : editing ? "Save Changes" : "Create Project"}
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
                <label className="project-status-filter">Status<select aria-label="Filter projects by status" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}}><option value="All">All ({items.length})</option>{WORKFLOW_STATUSES.map(status=><option key={status} value={status}>{status} ({items.filter(p=>(p.workflow_status||p.status)===status).length})</option>)}</select></label><button className="secondary" onClick={()=>{setSearch("");setStatusFilter("All");setPage(1);}}>Clear filters</button><button className="secondary" onClick={()=>void load()}>Refresh projects</button>
              </div>
              <section className="table-card">
                <div className="table-scroll" role="region" aria-label="Purchasing projects table" tabIndex={0}>
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
                            <td>{p.supplier_count ?? 0} Added</td>
                            <td>
                              <span className="chip" data-status={p.workflow_status||p.status}>{p.workflow_status||p.status}</span><small className="supplier-note">{p.workflow_stage}</small>
                            </td>
                            <td>
                              {new Date(p.last_activity_at||p.updated_at).toLocaleDateString(
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
                              </button>{p.resume_path&&<button className="secondary" onClick={()=>go(p.resume_path!)}>Continue Workflow</button>}
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
                        ? "Try another project name, reference, category or status filter."
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
