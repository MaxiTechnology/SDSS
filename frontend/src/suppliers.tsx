import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";

type Supplier = { id: string; name: string; location: string; description: string; updated_at: string };
const blank = { name: "", location: "", description: "" };

export function Suppliers({ projectId, reference }: { projectId: string; reference: string }) {
  const base = `/api/projects/${projectId}/suppliers`;
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState(blank);
  const [saveId, setSaveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  async function load() {
    setLoading(true); setError("");
    try { setRows(await api<Supplier[]>(base)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load suppliers."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [projectId]);
  useEffect(() => {
    if (modal) {
      dialog.current?.showModal();
      if (!edit) dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    } else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!modal || edit) return;
    if (busy) dialog.current?.focus();
    else if (formError) dialog.current?.querySelector<HTMLButtonElement>(".dialog-footer .primary")?.focus();
  }, [modal, edit, busy, formError]);
  function open(row: Supplier | null = null) {
    setEdit(row); setForm(row ? { name: row.name, location: row.location, description: row.description } : { ...blank });
    setSaveId(crypto.randomUUID()); setFormError(""); setNotice(""); setModal(true);
  }
  function close() {
    if (busy) return;
    const initial = edit ?? blank;
    const dirty = Object.keys(blank).some(key => form[key as keyof typeof blank] !== initial[key as keyof typeof blank]);
    if (dirty && !window.confirm("Discard your unsaved supplier changes?")) return;
    setModal(false);
  }
  function keepAddDialogFocus(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (edit || e.key !== "Tab" || !dialog.current) return;
    const controls = dialog.current.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)");
    const first = controls[0], last = controls[controls.length - 1];
    if (!first || !last) { e.preventDefault(); dialog.current.focus(); return; }
    if (document.activeElement === dialog.current) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return; setBusy(true); setFormError("");
    try {
      const saved = await api<Supplier>(edit ? `${base}/${edit.id}` : base, {
        method: edit ? "PUT" : "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({...form, name:form.name.trim(), ...(edit ? {expected_updated_at:edit.updated_at} : {id:saveId})})
      });
      setRows(previous => edit ? previous.map(r => r.id === saved.id ? saved : r) : [...previous, saved]);
      setModal(false); setNotice(edit ? "Supplier changes saved." : "Supplier added.");
    } catch (e) { setFormError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Saving could not be confirmed. Your entries are kept. Try saving again."); }
    finally { setBusy(false); }
  }
  async function remove(row: Supplier) {
    if (busy || !window.confirm(`Remove ${row.name} from this project?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`${base}/${row.id}?expected_updated_at=${encodeURIComponent(row.updated_at)}`, {method:"DELETE"});
      setRows(previous => previous.filter(r => r.id !== row.id)); setNotice("Supplier removed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove supplier."); }
    finally { setBusy(false); }
  }
  return <section className="supplier-page project-suppliers" aria-label="Project suppliers">
    <div className="card-heading"><div><h2>Project suppliers</h2><p>Project {reference}</p></div><button className="primary" disabled={loading || busy || !!error} onClick={() => open()}>+ Add Supplier</button></div>
    {error && <div className="error" role="alert">{error}<button onClick={() => void load()}>Refresh suppliers</button></div>}
    {notice && <div className="success" role="status">{notice}</div>}
    {loading ? <p role="status">Loading suppliers…</p> : !error && <>
      <div className={rows.length >= 2 ? "success" : "info"} role="status"><span><strong>{rows.length} saved supplier{rows.length === 1 ? "" : "s"}</strong> · {rows.length === 0 ? "Add at least two suppliers to continue." : rows.length === 1 ? "Add at least one more supplier to continue." : "Minimum of two met."}</span></div>
      <div className="table-card">
        {rows.length === 0 ? <div className="empty"><h2>No suppliers added yet</h2><p>Add your first supplier to begin.</p></div> : <div className="table-scroll" role="region" aria-label="Project suppliers table" tabIndex={0}><table><thead><tr><th>Supplier name</th><th>Location</th><th>Description</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><div className="project-name"><span className="project-icon">{row.name.split(/\s+/).map(v=>v[0]).slice(0,2).join("").toUpperCase()}</span><strong>{row.name}</strong></div></td><td>{row.location || "Not specified"}</td><td className="supplier-description">{row.description || "Not specified"}</td><td><div className="actions"><button className="secondary" disabled={busy} aria-label={`Edit ${row.name}`} onClick={() => open(row)}>Edit</button><button className="secondary supplier-remove" disabled={busy} aria-label={`Remove ${row.name}`} onClick={() => void remove(row)}>Remove</button></div></td></tr>)}</tbody></table></div>}
      </div>
    </>}
    <div className="supplier-footer"><button className="secondary" onClick={() => {location.hash=`/projects/${projectId}`;}}>← Back to Project Details</button><div><button className="primary" disabled={loading || busy || !!error || rows.length < 2} onClick={async () => {try {await api(`/api/projects/${projectId}/supplier-readiness`); location.hash=`/projects/${projectId}/criteria`;} catch(e) {setError(e instanceof Error ? e.message : "Could not verify suppliers.");}}} title="Configure scoring criteria and mandatory requirements">Continue to Criteria & Weights →</button></div></div>
    <dialog ref={dialog} className={!edit ? "add-supplier-dialog" : undefined} aria-labelledby="supplier-dialog-title" onKeyDown={keepAddDialogFocus} onCancel={e => {e.preventDefault(); close();}} onClick={e => {if(e.target === dialog.current) {const box=dialog.current.getBoundingClientRect(); if(e.clientX<box.left || e.clientX>box.right || e.clientY<box.top || e.clientY>box.bottom) close();}}}>
      <form onSubmit={save}><div className="dialog-heading"><h2 id="supplier-dialog-title">{edit ? "Edit Supplier" : "Add Supplier"}</h2><button type="button" className="secondary" aria-label="Close supplier dialog" disabled={busy} onClick={close}>×</button></div>
      <div className="dialog-body">{formError && <div className="error" role="alert">{formError}{!edit && <div>Review the message before retrying.</div>}</div>}<fieldset disabled={busy}><label>Supplier Name <em>*</em>{!edit && <small> (Required)</small>}<input autoFocus required maxLength={200} aria-describedby={!edit ? "supplier-name-help" : undefined} value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Enter supplier name" /></label><small id={!edit ? "supplier-name-help" : undefined}>{edit ? "Required for project identification and evaluation matrix." : "Use the name that identifies this supplier in the project."}</small><label>Location <small>(Optional)</small><input maxLength={200} value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder="e.g. Austin, TX, USA or European Union" /></label><label>Description <small>(Optional)</small><textarea maxLength={5000} value={form.description} onChange={e => setForm({...form,description:e.target.value})} placeholder="Brief description of supplier capabilities, category, or core offering…" /></label></fieldset>{edit && <p><em>*</em> Required fields must be completed before saving.</p>}</div>
      <div className="dialog-footer"><button type="button" className="secondary" disabled={busy} onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : edit ? "Save Supplier" : "Add Supplier"}</button></div></form>
    </dialog>
  </section>;
}
