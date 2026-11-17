from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator
import database
import psycopg

app = FastAPI(title="SDSS API")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "SDSS API"}


@app.exception_handler(psycopg.Error)
@app.exception_handler(OSError)
def database_unavailable(request, error):
    return JSONResponse(status_code=503, content={"detail": "Project storage is unavailable. Please try again. Your form has been kept."})


class ProjectFields(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="", max_length=100)
    currency: Literal["USD", "EUR", "GBP", "RUB", "GHS"]
    estimated_budget: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    target_date: date | None = None
    description: str = Field(default="", max_length=5000)

    @field_validator("name", "category", "description", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class ProjectInput(ProjectFields):
    id: UUID


class ProjectUpdate(ProjectFields):
    expected_updated_at: datetime


def serialize(row):
    return {
        "id": str(row["id"]), "reference": f'PRJ-{row["project_number"]:06d}',
        "name": row["name"], "category": row["category"], "currency": row["currency"],
        "estimated_budget": str(row["estimated_budget"]) if row["estimated_budget"] is not None else None,
        "target_date": row["target_date"].isoformat() if row["target_date"] else None,
        "description": row["description"], "status": row["status"],
        "supplier_count": row.get("supplier_count", 0),
        "created_at": row["created_at"].isoformat(), "updated_at": row["updated_at"].isoformat(),
    }


@app.get("/api/projects")
def projects():
    with database.connect() as connection:
        rows = connection.execute("SELECT p.*, (SELECT count(*) FROM project_suppliers s WHERE s.project_id=p.id) AS supplier_count FROM purchasing_projects p ORDER BY created_at DESC, id DESC").fetchall()
    return [serialize(row) for row in rows]


@app.get("/api/projects/{project_id}")
def project(project_id: UUID):
    with database.connect() as connection:
        row = connection.execute("SELECT * FROM purchasing_projects WHERE id = %s", (project_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Project not found.")
    return serialize(row)


@app.post("/api/projects", status_code=201)
def create_project(payload: ProjectInput, response: Response):
    values = payload.model_dump()
    with database.connect() as connection:
        row = connection.execute("""
            INSERT INTO purchasing_projects(id, name, category, currency, estimated_budget, target_date, description)
            VALUES (%(id)s, %(name)s, %(category)s, %(currency)s, %(estimated_budget)s, %(target_date)s, %(description)s)
            ON CONFLICT (id) DO NOTHING RETURNING *
        """, values).fetchone()
        if not row:
            row = connection.execute("SELECT * FROM purchasing_projects WHERE id = %s", (payload.id,)).fetchone()
            if any(row[key] != value for key, value in values.items()):
                raise HTTPException(409, "This save was already completed with different details. Reopen the saved project from the list.")
            response.status_code = 200
    return serialize(row)


@app.put("/api/projects/{project_id}")
def update_project(project_id: UUID, payload: ProjectUpdate):
    values = payload.model_dump(exclude={"expected_updated_at"})
    with database.connect() as connection:
        row = connection.execute("SELECT * FROM purchasing_projects WHERE id = %s FOR UPDATE", (project_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Project not found.")
        if row["updated_at"] != payload.expected_updated_at:
            if all(row[key] == value for key, value in values.items()):
                return serialize(row)
            raise HTTPException(409, "This project changed since you opened it. Your entries are kept. Cancel editing and reopen the project before trying again.")
        row = connection.execute("""
            UPDATE purchasing_projects SET name=%(name)s, category=%(category)s,
            currency=%(currency)s, estimated_budget=%(estimated_budget)s,
            target_date=%(target_date)s, description=%(description)s,
            updated_at=clock_timestamp() WHERE id=%(id)s RETURNING *
        """, {**values, "id": project_id}).fetchone()
    return serialize(row)


class SupplierFields(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=5000)

    @field_validator("name", "location", "description", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class SupplierInput(SupplierFields):
    id: UUID


class SupplierUpdate(SupplierFields):
    expected_updated_at: datetime


def supplier_json(row):
    return {**{key: str(row[key]) for key in ("id", "project_id", "name", "location", "description")},
            "updated_at": row["updated_at"].isoformat()}


def require_project(connection, project_id):
    if not connection.execute("SELECT id FROM purchasing_projects WHERE id=%s FOR UPDATE", (project_id,)).fetchone():
        raise HTTPException(404, "Project not found.")


def touch_project(connection, project_id):
    connection.execute("UPDATE purchasing_projects SET updated_at=clock_timestamp() WHERE id=%s", (project_id,))


@app.get("/api/projects/{project_id}/suppliers")
def suppliers(project_id: UUID):
    with database.connect() as connection:
        require_project(connection, project_id)
        rows = connection.execute("SELECT * FROM project_suppliers WHERE project_id=%s ORDER BY created_at,id", (project_id,)).fetchall()
    return [supplier_json(row) for row in rows]


@app.post("/api/projects/{project_id}/suppliers", status_code=201)
def add_supplier(project_id: UUID, payload: SupplierInput, response: Response):
    with database.connect() as connection:
        require_project(connection, project_id)
        values = {**payload.model_dump(), "project_id": project_id}
        row = connection.execute("""INSERT INTO project_suppliers(id,project_id,name,location,description)
            VALUES (%(id)s,%(project_id)s,%(name)s,%(location)s,%(description)s)
            ON CONFLICT(id) DO NOTHING RETURNING *""", values).fetchone()
        if row is None:
            row = connection.execute("SELECT * FROM project_suppliers WHERE id=%s AND project_id=%s", (payload.id,project_id)).fetchone()
            if row is None or any(row[key] != value for key,value in values.items()):
                raise HTTPException(409, "This supplier save conflicts with an earlier save. Close and reopen the form.")
            response.status_code=200
        else:
            touch_project(connection,project_id)
    return supplier_json(row)


@app.put("/api/projects/{project_id}/suppliers/{supplier_id}")
def edit_supplier(project_id: UUID, supplier_id: UUID, payload: SupplierUpdate):
    with database.connect() as connection:
        require_project(connection,project_id)
        row=connection.execute("SELECT * FROM project_suppliers WHERE id=%s AND project_id=%s FOR UPDATE", (supplier_id,project_id)).fetchone()
        if row is None:
            raise HTTPException(404,"Supplier not found in this project.")
        values=payload.model_dump(exclude={"expected_updated_at"})
        if row["updated_at"] != payload.expected_updated_at:
            if all(row[key]==value for key,value in values.items()):
                return supplier_json(row)
            raise HTTPException(409,"This supplier changed in another window. Your entries are kept. Close the form and refresh before editing again.")
        row=connection.execute("""UPDATE project_suppliers SET name=%(name)s,location=%(location)s,
            description=%(description)s,updated_at=clock_timestamp() WHERE id=%(id)s AND project_id=%(project_id)s RETURNING *""",
            {**values,"id":supplier_id,"project_id":project_id}).fetchone()
        touch_project(connection,project_id)
    return supplier_json(row)


@app.delete("/api/projects/{project_id}/suppliers/{supplier_id}", status_code=204)
def remove_supplier(project_id: UUID, supplier_id: UUID, expected_updated_at: datetime):
    with database.connect() as connection:
        require_project(connection,project_id)
        row=connection.execute("SELECT * FROM project_suppliers WHERE id=%s AND project_id=%s FOR UPDATE",(supplier_id,project_id)).fetchone()
        if row is None:
            return Response(status_code=204)
        if row["updated_at"] != expected_updated_at:
            raise HTTPException(409,"This supplier changed in another window. Refresh before removing it.")
        connection.execute("DELETE FROM project_suppliers WHERE id=%s AND project_id=%s",(supplier_id,project_id))
        touch_project(connection,project_id)
    return Response(status_code=204)


@app.get("/api/projects/{project_id}/supplier-readiness")
def supplier_readiness(project_id: UUID):
    with database.connect() as connection:
        require_project(connection,project_id)
        count=connection.execute("SELECT count(*) AS total FROM project_suppliers WHERE project_id=%s",(project_id,)).fetchone()["total"]
    if count < 2:
        raise HTTPException(422,"Add at least two suppliers before continuing to Criteria & Weights.")
    return {"ready":True,"supplier_count":count}


class ScoringCriterion(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    name: str = Field(min_length=1, max_length=100)
    unit: str = Field(min_length=1, max_length=40)
    direction: Literal["benefit", "cost"]
    selected: bool = True
    minimum: Decimal | None = Field(default=None, allow_inf_nan=False)
    maximum: Decimal | None = Field(default=None, allow_inf_nan=False)

    @field_validator("name", "unit", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def valid_range(self):
        if self.minimum is not None and self.maximum is not None and self.minimum >= self.maximum:
            raise ValueError("Minimum must be less than maximum.")
        return self


class MandatoryCheck(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    name: str = Field(min_length=1, max_length=100)
    requirement: str = Field(min_length=1, max_length=500)

    @field_validator("name", "requirement", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


class CriteriaConfiguration(BaseModel):
    criteria: list[ScoringCriterion] = Field(min_length=2, max_length=20)
    mandatory_checks: list[MandatoryCheck] = Field(default_factory=list, max_length=20)
    maximum_price: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2, allow_inf_nan=False)

    @model_validator(mode="after")
    def distinct(self):
        if sum(c.selected for c in self.criteria) < 2:
            raise ValueError("Select at least two scoring criteria.")
        all_items = [*self.criteria, *self.mandatory_checks]
        if len({c.id for c in all_items}) != len(all_items):
            raise ValueError("Criterion and check identifiers must be unique.")
        if len({c.name.casefold() for c in all_items}) != len(all_items):
            raise ValueError("Criterion and check names must be unique.")
        return self


class CriteriaSave(CriteriaConfiguration):
    expected_revision: int = Field(ge=0)


def default_criteria(currency):
    definitions = [
        ("price", "Price / Total Purchasing Cost", currency, "cost", "0", None),
        ("quality", "Product or Service Quality", "points / 100", "benefit", "0", "100"),
        ("delivery", "Delivery Time", "days", "cost", "0", None),
        ("reliability", "Supplier Reliability", "points / 5", "benefit", "0", "5"),
        ("warranty", "Warranty", "months", "benefit", "0", None),
    ]
    return {"criteria": [dict(id=i,name=n,unit=u,direction=d,minimum=lo,maximum=hi,selected=True)
            for i,n,u,d,lo,hi in definitions], "mandatory_checks": [], "maximum_price": None}


def criteria_project(connection, project_id):
    require_project(connection, project_id)
    count = connection.execute("SELECT count(*) AS total FROM project_suppliers WHERE project_id=%s", (project_id,)).fetchone()["total"]
    if count < 2:
        raise HTTPException(422, "Add at least two suppliers before configuring criteria.")
    return connection.execute("SELECT currency FROM purchasing_projects WHERE id=%s", (project_id,)).fetchone()


@app.get("/api/projects/{project_id}/criteria")
def get_criteria(project_id: UUID):
    with database.connect() as connection:
        project = criteria_project(connection, project_id)
        row = connection.execute("SELECT * FROM project_criteria WHERE project_id=%s", (project_id,)).fetchone()
    return {"configuration":row["configuration"] if row else default_criteria(project["currency"]),
            "revision":row["revision"] if row else 0, "currency":project["currency"]}


@app.put("/api/projects/{project_id}/criteria")
def save_criteria(project_id: UUID, payload: CriteriaSave):
    from psycopg.types.json import Jsonb
    configuration = payload.model_dump(mode="json", exclude={"expected_revision"})
    with database.connect() as connection:
        project = criteria_project(connection, project_id)
        row = connection.execute("SELECT * FROM project_criteria WHERE project_id=%s FOR UPDATE", (project_id,)).fetchone()
        current = row["revision"] if row else 0
        # Identical retries are safe, including a retry after an uncertain response.
        if row and row["configuration"] == configuration:
            return {"configuration":configuration,"revision":current,"currency":project["currency"]}
        if payload.expected_revision != current:
            raise HTTPException(409, "Criteria changed in another window. Your entries are kept. Reload saved criteria before editing again.")
        connection.execute("""INSERT INTO project_criteria(project_id,configuration,revision)
            VALUES (%s,%s,1) ON CONFLICT(project_id) DO UPDATE SET configuration=EXCLUDED.configuration,
            revision=project_criteria.revision+1,updated_at=clock_timestamp()""", (project_id,Jsonb(configuration)))
        touch_project(connection,project_id)
    return {"configuration":configuration,"revision":current+1,"currency":project["currency"]}


class ManualWeightsSave(BaseModel):
    weights: dict[str, Decimal] = Field(min_length=2, max_length=20)
    criteria_revision: int = Field(gt=0)
    expected_revision: int = Field(ge=0)
    approved: bool = False

    @field_validator("weights")
    @classmethod
    def valid_weights(cls, values):
        if any(not v.is_finite() or v < 0 or v > 100 or v.as_tuple().exponent < -2 for v in values.values()):
            raise ValueError("Weights must be between 0 and 100, with at most two decimal places.")
        return values

    @model_validator(mode="after")
    def approval_total(self):
        if self.approved and sum(self.weights.values()) != Decimal("100"):
            raise ValueError("Approved weights must total exactly 100%.")
        return self


def weighting_criteria(connection, project_id):
    criteria_project(connection, project_id)
    row = connection.execute("SELECT * FROM project_criteria WHERE project_id=%s", (project_id,)).fetchone()
    if not row:
        raise HTTPException(422, "Save your criteria before assigning weights.")
    return row


def weights_json(row, criteria):
    selected = [c for c in criteria["configuration"]["criteria"] if c["selected"]]
    current = bool(row and row["criteria_revision"] == criteria["revision"])
    return {"criteria": selected, "criteria_revision": criteria["revision"],
            "weights": row["weights"] if current else {c["id"]: "0" for c in selected},
            "revision": row["revision"] if row else 0, "approved": bool(current and row["approved"]),
            "needs_review": bool(row and not current)}


@app.get("/api/projects/{project_id}/weights/manual")
def get_manual_weights(project_id: UUID):
    with database.connect() as connection:
        criteria = weighting_criteria(connection, project_id)
        row = connection.execute("SELECT * FROM project_weights WHERE project_id=%s", (project_id,)).fetchone()
    return weights_json(row, criteria)


class CheckReview(BaseModel):
    status: Literal['pending', 'passed', 'failed'] = 'pending'
    notes: str = Field(default='', max_length=2000)

    @model_validator(mode='after')
    def require_notes(self):
        self.notes = self.notes.strip()
        if self.status != 'pending' and not self.notes:
            raise ValueError('Record what you reviewed before passing or failing a check.')
        return self


class EligibilityReviewSave(BaseModel):
    currency: Literal['USD','EUR','GBP','RUB','GHS']
    checks: dict[str, CheckReview] = Field(default_factory=dict, max_length=20)
    total_price: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2, allow_inf_nan=False)
    criteria_revision: int = Field(gt=0)
    supplier_updated_at: datetime
    expected_revision: int = Field(ge=0)


def eligibility_context(connection, project_id):
    criteria = weighting_criteria(connection, project_id)
    criteria['currency'] = connection.execute('SELECT currency FROM purchasing_projects WHERE id=%s', (project_id,)).fetchone()['currency']
    weights = connection.execute('SELECT * FROM project_weights WHERE project_id=%s', (project_id,)).fetchone()
    if not weights or not weights['approved'] or weights['criteria_revision'] != criteria['revision']:
        raise HTTPException(422, 'Approve weights for the current criteria before reviewing eligibility.')
    return criteria


def eligibility_supplier(supplier, review, criteria):
    configuration = criteria['configuration']
    current = bool(review and review['criteria_revision'] == criteria['revision'] and review['supplier_updated_at'] == supplier['updated_at'] and review['determinations'].get('currency') == criteria['currency'])
    stored = review['determinations'] if current else {}
    checks = {c['id']: stored.get('checks', {}).get(c['id'], {'status':'pending','notes':''}) for c in configuration['mandatory_checks']}
    statuses = [c['status'] for c in checks.values()]
    price = stored.get('total_price')
    price_status = None
    if configuration['maximum_price'] is not None:
        price_status = 'pending' if price is None else 'passed' if Decimal(price) <= Decimal(configuration['maximum_price']) else 'failed'
        statuses.append(price_status)
    status = 'ineligible' if 'failed' in statuses else 'pending' if 'pending' in statuses else 'eligible'
    return {**supplier_json(supplier), 'checks':checks, 'total_price':price, 'price_status':price_status,
            'eligibility':status, 'revision':review['revision'] if review else 0,
            'needs_review':bool(review and not current), 'reviewer':review['reviewer'] if current else None,
            'reviewed_at':review['updated_at'].isoformat() if current else None}


@app.get('/api/projects/{project_id}/eligibility')
def get_eligibility(project_id: UUID):
    with database.connect() as connection:
        criteria = eligibility_context(connection, project_id)
        suppliers = connection.execute('SELECT * FROM project_suppliers WHERE project_id=%s ORDER BY created_at,id', (project_id,)).fetchall()
        reviews = {r['supplier_id']:r for r in connection.execute('SELECT r.* FROM supplier_reviews r JOIN project_suppliers s ON s.id=r.supplier_id WHERE s.project_id=%s', (project_id,)).fetchall()}
        rows = [eligibility_supplier(s, reviews.get(s['id']), criteria) for s in suppliers]
        currency = connection.execute('SELECT currency FROM purchasing_projects WHERE id=%s', (project_id,)).fetchone()['currency']
    eligible = sum(s['eligibility'] == 'eligible' for s in rows)
    return {'suppliers':rows, 'mandatory_checks':criteria['configuration']['mandatory_checks'],
            'maximum_price':criteria['configuration']['maximum_price'], 'currency':currency,
            'criteria_revision':criteria['revision'], 'eligible_count':eligible, 'ready':eligible >= 2}


@app.put('/api/projects/{project_id}/eligibility/{supplier_id}')
def save_eligibility(project_id: UUID, supplier_id: UUID, payload: EligibilityReviewSave):
    from psycopg.types.json import Jsonb
    with database.connect() as connection:
        criteria = eligibility_context(connection, project_id)
        supplier = connection.execute('SELECT * FROM project_suppliers WHERE id=%s AND project_id=%s', (supplier_id,project_id)).fetchone()
        if not supplier:
            raise HTTPException(404, 'Supplier not found in this project.')
        if payload.criteria_revision != criteria['revision'] or payload.supplier_updated_at != supplier['updated_at'] or payload.currency != criteria['currency']:
            raise HTTPException(409, 'Supplier or criteria changed. Reload and review again. Your entries are kept.')
        if set(payload.checks) != {c['id'] for c in criteria['configuration']['mandatory_checks']}:
            raise HTTPException(422, 'Review exactly the configured mandatory checks.')
        if criteria['configuration']['maximum_price'] is None and payload.total_price is not None:
            raise HTTPException(422, 'No mandatory price limit is configured.')
        determinations = payload.model_dump(mode='json', include={'checks','total_price','currency'})
        review = connection.execute('SELECT * FROM supplier_reviews WHERE supplier_id=%s FOR UPDATE', (supplier_id,)).fetchone()
        if review and review['criteria_revision'] == payload.criteria_revision and review['supplier_updated_at'] == supplier['updated_at'] and review['determinations'] == determinations:
            return eligibility_supplier(supplier, review, criteria)
        if payload.expected_revision != (review['revision'] if review else 0):
            raise HTTPException(409, 'Review changed in another window. Reload before saving. Your entries are kept.')
        review = connection.execute('''INSERT INTO supplier_reviews(supplier_id,determinations,criteria_revision,supplier_updated_at,revision)
            VALUES (%s,%s,%s,%s,1) ON CONFLICT(supplier_id) DO UPDATE SET determinations=EXCLUDED.determinations,
            criteria_revision=EXCLUDED.criteria_revision,supplier_updated_at=EXCLUDED.supplier_updated_at,
            revision=supplier_reviews.revision+1,updated_at=clock_timestamp() RETURNING *''',
            (supplier_id,Jsonb(determinations),payload.criteria_revision,supplier['updated_at'])).fetchone()
        touch_project(connection, project_id)
    return eligibility_supplier(supplier, review, criteria)


@app.put("/api/projects/{project_id}/weights/manual")
def save_manual_weights(project_id: UUID, payload: ManualWeightsSave):
    from psycopg.types.json import Jsonb
    with database.connect() as connection:
        criteria = weighting_criteria(connection, project_id)
        ids = {c["id"] for c in criteria["configuration"]["criteria"] if c["selected"]}
        if payload.criteria_revision != criteria["revision"]:
            raise HTTPException(409, "Criteria changed. Reload weights and review the selected criteria before saving.")
        if set(payload.weights) != ids:
            raise HTTPException(422, "Assign one weight to every selected scoring criterion, and no weights to mandatory checks.")
        values = {k: format(v, ".2f") for k, v in payload.weights.items()}
        row = connection.execute("SELECT * FROM project_weights WHERE project_id=%s FOR UPDATE", (project_id,)).fetchone()
        revision = row["revision"] if row else 0
        if row and row["weights"] == values and row["approved"] == payload.approved and row["criteria_revision"] == payload.criteria_revision:
            return weights_json(row, criteria)
        if payload.expected_revision != revision:
            raise HTTPException(409, "Weights changed in another window. Your entries are kept. Reload saved weights before editing again.")
        row = connection.execute("""INSERT INTO project_weights(project_id,weights,criteria_revision,revision,approved)
            VALUES (%s,%s,%s,1,%s) ON CONFLICT(project_id) DO UPDATE SET weights=EXCLUDED.weights,
            criteria_revision=EXCLUDED.criteria_revision,revision=project_weights.revision+1,
            approved=EXCLUDED.approved,updated_at=clock_timestamp() RETURNING *""",
            (project_id,Jsonb(values),payload.criteria_revision,payload.approved)).fetchone()
        touch_project(connection, project_id)
    return weights_json(row, criteria)


class MatrixSave(BaseModel):
    entries: dict[str, dict[str, Decimal | None]] = Field(max_length=1000)
    context: str = Field(min_length=64, max_length=64)
    expected_revision: int = Field(ge=0)


def matrix_context(connection, project_id):
    import hashlib
    import json
    criteria = eligibility_context(connection, project_id)
    suppliers = connection.execute('SELECT * FROM project_suppliers WHERE project_id=%s ORDER BY created_at,id', (project_id,)).fetchall()
    reviews = {r['supplier_id']:r for r in connection.execute('SELECT r.* FROM supplier_reviews r JOIN project_suppliers s ON s.id=r.supplier_id WHERE s.project_id=%s', (project_id,)).fetchall()}
    eligible = [eligibility_supplier(s, reviews.get(s['id']), criteria) for s in suppliers]
    eligible = [s for s in eligible if s['eligibility'] == 'eligible']
    if len(eligible) < 2:
        raise HTTPException(422, 'At least two eligible suppliers are required for the evaluation matrix.')
    weights = connection.execute('SELECT * FROM project_weights WHERE project_id=%s', (project_id,)).fetchone()
    token = hashlib.sha256(json.dumps([criteria['revision'],criteria['currency'],weights['revision'],[(s['id'],s['updated_at'],s['revision']) for s in eligible]],default=str).encode()).hexdigest()
    selected = [c for c in criteria['configuration']['criteria'] if c['selected']]
    return criteria, eligible, selected, token


def matrix_errors(entries, suppliers, criteria, maximum_price):
    errors = {}
    for supplier in suppliers:
        sid = supplier['id']
        for criterion in criteria:
            cid = criterion['id']; value = entries.get(sid, {}).get(cid)
            message = None
            if value is None: message = 'Enter a value.'
            else:
                value = Decimal(str(value))
                if not value.is_finite() or abs(value) > Decimal('99999999999999.99') or value.as_tuple().exponent < -4:
                    message = 'Use a finite number with at most four decimal places.'
                elif criterion.get('minimum') is not None and value < Decimal(str(criterion['minimum'])): message = 'Below the configured minimum.'
                elif criterion.get('maximum') is not None and value > Decimal(str(criterion['maximum'])): message = 'Above the configured maximum.'
                elif cid == 'price' and maximum_price is not None and (value > Decimal(str(maximum_price)) or value != Decimal(str(supplier['total_price']))):
                    message = 'Price must match the total price in the eligibility review.'
            if message: errors.setdefault(sid, {})[cid] = message
    return errors


def matrix_json(row, criteria, suppliers, selected, context):
    current = bool(row and row['context'] == context)
    entries = row['entries'] if current else {s['id']:{c['id']:None for c in selected} for s in suppliers}
    errors = matrix_errors(entries,suppliers,selected,criteria['configuration']['maximum_price'])
    return {'entries':entries,'suppliers':[{'id':s['id'],'name':s['name']} for s in suppliers], 'criteria':selected,
            'context':context,'revision':row['revision'] if row else 0,'needs_review':bool(row and not current),
            'errors':errors,'ready':not errors}


@app.get('/api/projects/{project_id}/matrix')
def get_matrix(project_id: UUID):
    with database.connect() as connection:
        criteria,suppliers,selected,context = matrix_context(connection,project_id)
        row = connection.execute('SELECT * FROM project_matrix WHERE project_id=%s',(project_id,)).fetchone()
        return matrix_json(row,criteria,suppliers,selected,context)


@app.put('/api/projects/{project_id}/matrix')
def save_matrix(project_id: UUID, payload: MatrixSave):
    from psycopg.types.json import Jsonb
    with database.connect() as connection:
        criteria,suppliers,selected,context = matrix_context(connection,project_id)
        if context != payload.context: raise HTTPException(409,'Project inputs or eligibility changed. Reload the matrix before saving.')
        if set(payload.entries) != {s['id'] for s in suppliers} or any(set(v) != {c['id'] for c in selected} for v in payload.entries.values()):
            raise HTTPException(422,'Enter values only for current eligible suppliers and selected criteria.')
        errors = matrix_errors(payload.entries,suppliers,selected,criteria['configuration']['maximum_price'])
        if any(message != 'Enter a value.' for cells in errors.values() for message in cells.values()):
            raise HTTPException(422,'Correct out-of-range values before saving. Missing values can be saved as a draft.')
        entries = payload.model_dump(mode='json')['entries']
        row = connection.execute('SELECT * FROM project_matrix WHERE project_id=%s FOR UPDATE',(project_id,)).fetchone()
        if row and row['context'] == context and row['entries'] == entries: return matrix_json(row,criteria,suppliers,selected,context)
        if payload.expected_revision != (row['revision'] if row else 0): raise HTTPException(409,'Matrix changed in another window. Reload before saving. Your entries are kept.')
        row = connection.execute("""INSERT INTO project_matrix(project_id,entries,context,revision) VALUES (%s,%s,%s,1)
            ON CONFLICT(project_id) DO UPDATE SET entries=EXCLUDED.entries,context=EXCLUDED.context,
            revision=project_matrix.revision+1,updated_at=clock_timestamp() RETURNING *""",(project_id,Jsonb(entries),context)).fetchone()
        touch_project(connection,project_id)
        return matrix_json(row,criteria,suppliers,selected,context)

class RankingRequest(BaseModel):
    context: str = Field(min_length=64, max_length=64)
    matrix_revision: int = Field(gt=0)


def ranking_json(row, context, revision):
    return {'id':str(row['id']), 'created_at':row['created_at'].isoformat(),
            'stale':row['context'] != context or row['matrix_revision'] != revision,
            'snapshot':row['snapshot']}


@app.post('/api/projects/{project_id}/rankings')
def create_ranking(project_id: UUID, payload: RankingRequest):
    from uuid import uuid4
    from psycopg.types.json import Jsonb
    from topsis import calculate
    with database.connect() as connection:
        criteria,suppliers,selected,context = matrix_context(connection,project_id)
        matrix = connection.execute('SELECT * FROM project_matrix WHERE project_id=%s',(project_id,)).fetchone()
        if not matrix or matrix['context'] != context or payload.context != context or payload.matrix_revision != matrix['revision']:
            raise HTTPException(409,'Matrix or project inputs changed. Reload and save the matrix before calculating.')
        if not matrix_json(matrix,criteria,suppliers,selected,context)['ready']:
            raise HTTPException(422,'Complete and save every matrix value before calculating.')
        row = connection.execute('SELECT * FROM ranking_runs WHERE project_id=%s AND context=%s AND matrix_revision=%s',(project_id,context,matrix['revision'])).fetchone()
        if not row:
            weights = connection.execute('SELECT weights FROM project_weights WHERE project_id=%s',(project_id,)).fetchone()['weights']
            try: result = calculate(matrix['entries'],[{'id':s['id'],'name':s['name']} for s in suppliers],selected,weights)
            except ValueError as error: raise HTTPException(422,str(error)) from None
            snapshot = {'method':'TOPSIS vector normalization v1', 'entries':matrix['entries'], 'suppliers':[{'id':s['id'],'name':s['name']} for s in suppliers],
                        'criteria':selected,'weights':weights,'currency':criteria['currency'],'result':result}
            row = connection.execute('INSERT INTO ranking_runs(id,project_id,context,matrix_revision,snapshot) VALUES (%s,%s,%s,%s,%s) RETURNING *',
                (uuid4(),project_id,context,matrix['revision'],Jsonb(snapshot))).fetchone()
        return ranking_json(row,context,matrix['revision'])


@app.get('/api/projects/{project_id}/rankings')
def get_ranking(project_id: UUID):
    with database.connect() as connection:
        # Preserve access to historical snapshots even when the current pool is no longer ready.
        project = connection.execute('SELECT id FROM purchasing_projects WHERE id=%s FOR UPDATE',(project_id,)).fetchone()
        if not project: raise HTTPException(404,'Project not found.')
        row = connection.execute('SELECT * FROM ranking_runs WHERE project_id=%s ORDER BY created_at DESC LIMIT 1',(project_id,)).fetchone()
        if not row: raise HTTPException(404,'No rankings yet. Complete the matrix and calculate rankings.')
        try:
            _,_,_,context = matrix_context(connection,project_id)
            matrix = connection.execute('SELECT revision FROM project_matrix WHERE project_id=%s',(project_id,)).fetchone()
            revision = matrix['revision'] if matrix else 0
        except HTTPException:
            context,revision = '',0
        return ranking_json(row,context,revision)


class SensitivityRequest(BaseModel):
    baseline_id: UUID
    weights: dict[str, Decimal] = Field(min_length=2, max_length=20)

    @field_validator('weights')
    @classmethod
    def valid_weights(cls, values):
        ManualWeightsSave.valid_weights(values)
        if sum(values.values()) != Decimal('100'):
            raise ValueError('Scenario weights must total exactly 100%.')
        return values


@app.post('/api/projects/{project_id}/sensitivity')
def simulate_sensitivity(project_id: UUID, payload: SensitivityRequest):
    from topsis import calculate
    with database.connect() as connection:
        _,_,_,context = matrix_context(connection,project_id)
        matrix = connection.execute('SELECT revision FROM project_matrix WHERE project_id=%s',(project_id,)).fetchone()
        row = connection.execute('SELECT * FROM ranking_runs WHERE project_id=%s ORDER BY created_at DESC LIMIT 1',(project_id,)).fetchone()
        if not row or row['id'] != payload.baseline_id or not matrix or ranking_json(row,context,matrix['revision'])['stale']:
            raise HTTPException(409,'The baseline changed. Calculate current rankings before running a scenario.')
        snapshot = row['snapshot']
        if set(payload.weights) != {c['id'] for c in snapshot['criteria']}:
            raise HTTPException(422,'Use exactly the baseline scoring criteria.')
        try:
            result = calculate(snapshot['entries'],snapshot['suppliers'],snapshot['criteria'],payload.weights)
        except ValueError as error:
            raise HTTPException(422,str(error)) from None
        return {'baseline_id':str(row['id']), 'weights':{k:str(v) for k,v in payload.weights.items()}, 'result':result}


class DecisionRequest(BaseModel):
    id: UUID
    ranking_id: UUID
    expected_version: int = Field(ge=0)
    action: Literal['approve', 'alternative', 'defer']
    supplier_id: UUID | None = None
    reason: str = Field(default='', max_length=5000)
    revision_reason: str = Field(default='', max_length=5000)
    confirmed: Literal[True]

    @field_validator('reason', 'revision_reason', mode='before')
    @classmethod
    def trim_reason(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode='after')
    def validate_decision(self):
        if self.action == 'defer' and self.supplier_id is not None:
            raise ValueError('Deferral must not award a supplier.')
        if self.action != 'defer' and self.supplier_id is None:
            raise ValueError('Choose an eligible supplier.')
        if self.action != 'approve' and not self.reason:
            raise ValueError('Explain the alternative selection or deferral.')
        if self.expected_version and not self.revision_reason:
            raise ValueError('Explain why the confirmed decision is being revised.')
        return self


def decision_current(connection, project_id, ranking_id):
    try:
        _, _, _, context = matrix_context(connection, project_id)
    except HTTPException:
        return False
    matrix = connection.execute('SELECT revision FROM project_matrix WHERE project_id=%s', (project_id,)).fetchone()
    run = connection.execute('SELECT * FROM ranking_runs WHERE project_id=%s ORDER BY created_at DESC LIMIT 1', (project_id,)).fetchone()
    return bool(run and run['id'] == ranking_id and matrix and not ranking_json(run, context, matrix['revision'])['stale'])


def decision_json(row, current):
    return {'id': str(row['id']), 'ranking_id': str(row['ranking_id']), 'version': row['version'],
            'snapshot': row['snapshot'], 'actor': row['actor'], 'created_at': row['created_at'].isoformat(),
            'stale': not current}


@app.get('/api/projects/{project_id}/decisions')
def get_decisions(project_id: UUID):
    with database.connect() as connection:
        require_project(connection, project_id)
        rows = connection.execute('SELECT * FROM project_decisions WHERE project_id=%s ORDER BY version DESC', (project_id,)).fetchall()
        current = decision_current(connection, project_id, rows[0]['ranking_id']) if rows else False
        return {'decisions': [decision_json(row, current if index == 0 else False) for index, row in enumerate(rows)]}


@app.post('/api/projects/{project_id}/decisions')
def confirm_decision(project_id: UUID, payload: DecisionRequest):
    from psycopg.types.json import Jsonb
    request = payload.model_dump(mode='json')
    with database.connect() as connection:
        # All input mutations take the same project lock; confirmation sees one coherent version.
        require_project(connection, project_id)
        duplicate = connection.execute('SELECT * FROM project_decisions WHERE id=%s', (payload.id,)).fetchone()
        if duplicate:
            if duplicate['project_id'] != project_id or duplicate['request'] != request:
                raise HTTPException(409, 'This confirmation identifier was already used. Reload the decision.')
            return decision_json(duplicate, decision_current(connection, project_id, duplicate['ranking_id']))
        latest = connection.execute('SELECT * FROM project_decisions WHERE project_id=%s ORDER BY version DESC LIMIT 1', (project_id,)).fetchone()
        if payload.expected_version != (latest['version'] if latest else 0):
            raise HTTPException(409, 'A decision was confirmed in another window. Reload before revising it.')
        if not decision_current(connection, project_id, payload.ranking_id):
            raise HTTPException(409, 'Rankings or project inputs changed. Calculate current rankings before confirming a decision.')
        run = connection.execute('SELECT * FROM ranking_runs WHERE id=%s AND project_id=%s', (payload.ranking_id, project_id)).fetchone()
        rows = run['snapshot']['result']['rows']
        chosen = next((r for r in rows if r['id'] == str(payload.supplier_id)), None)
        leaders = [r for r in rows if r['rank'] == 1]
        if payload.action != 'defer' and chosen is None:
            raise HTTPException(422, 'Choose a supplier from the current eligible ranking.')
        if payload.action == 'approve' and (len(leaders) != 1 or chosen['rank'] != 1):
            raise HTTPException(422, 'Recommended approval requires a single highest-ranked supplier. Explain an alternative selection for ties or other suppliers.')
        if payload.action == 'alternative' and len(leaders) == 1 and chosen['rank'] == 1:
            raise HTTPException(422, 'Use recommended approval for the single highest-ranked supplier.')
        project = connection.execute('SELECT * FROM purchasing_projects WHERE id=%s', (project_id,)).fetchone()
        snapshot = {'action': payload.action, 'supplier': chosen, 'reason': payload.reason,
                    'revision_reason': payload.revision_reason, 'project': ProjectFields(**project).model_dump(mode='json'),
                    'ranking': run['snapshot']}
        criteria, eligible, _, _ = matrix_context(connection, project_id)
        snapshot['reference'] = f"PRJ-{project['project_number']:06d}"
        snapshot['weight_method'] = 'Manual percentage weighting (approved)'
        snapshot['eligibility'] = {'configuration': criteria['configuration'], 'suppliers': eligible}
        row = connection.execute('''INSERT INTO project_decisions(id,project_id,ranking_id,version,request,snapshot,actor)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
            (payload.id, project_id, payload.ranking_id, payload.expected_version + 1, Jsonb(request), Jsonb(snapshot), 'Demo User (unauthenticated)')).fetchone()
        return decision_json(row, True)


def saved_report(project_id, decision_id):
    from reports import report_data
    with database.connect() as connection:
        row = connection.execute('SELECT * FROM project_decisions WHERE project_id=%s AND id=%s', (project_id, decision_id)).fetchone()
        if not row:
            raise HTTPException(404, 'Saved decision not found for this project.')
        return report_data(row)


@app.get('/api/projects/{project_id}/decisions/{decision_id}/report')
def get_decision_report(project_id: UUID, decision_id: UUID):
    return saved_report(project_id, decision_id)


@app.get('/api/projects/{project_id}/decisions/{decision_id}/report.pdf')
def download_decision_report(project_id: UUID, decision_id: UUID):
    from reports import render_pdf
    report = saved_report(project_id, decision_id)
    try:
        content = render_pdf(report)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    return Response(content, media_type='application/pdf', headers={
        'Content-Disposition': f'attachment; filename="SDSS-decision-{decision_id}-v{report["version"]}.pdf"',
        'Cache-Control': 'no-store',
    })
