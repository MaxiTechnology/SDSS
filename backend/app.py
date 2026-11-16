from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
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
