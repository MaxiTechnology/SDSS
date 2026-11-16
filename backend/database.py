"""Database access; credentials are loaded privately and never logged."""
import json
import os
from pathlib import Path

postgres_bin = Path("C:/Program Files/PostgreSQL/18/bin")
if os.name == "nt" and postgres_bin.exists():
    os.environ["PATH"] = str(postgres_bin) + os.pathsep + os.environ.get("PATH", "")
    os.environ["PSYCOPG_IMPL"] = "python"
    dll_directory = os.add_dll_directory(str(postgres_bin))
import psycopg
from psycopg.rows import dict_row


def settings():
    if os.environ.get("DATABASE_URL"):
        return {"conninfo": os.environ["DATABASE_URL"]}
    return json.loads(Path(__file__).with_name("database.local.json").read_text(encoding="utf-8"))


def connect():
    return psycopg.connect(**settings(), connect_timeout=15, row_factory=dict_row)


def migrate(connection):
    """Apply versioned, additive migrations atomically, once per database."""
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(73120401)")
        connection.execute("CREATE TABLE IF NOT EXISTS sdss_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 1").fetchone():
            connection.execute("""
                CREATE TABLE purchasing_projects (
                    id uuid PRIMARY KEY,
                    project_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
                    name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
                    category varchar(100) NOT NULL DEFAULT '',
                    currency varchar(3) NOT NULL CHECK (currency IN ('USD','EUR','GBP','RUB','GHS')),
                    estimated_budget numeric(16,2) CHECK (estimated_budget >= 0),
                    target_date date,
                    description varchar(5000) NOT NULL DEFAULT '',
                    status varchar(20) NOT NULL DEFAULT 'Draft' CHECK (status = 'Draft'),
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now()
                )
            """)
            connection.execute("INSERT INTO sdss_migrations(version) VALUES (1)")


        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 2").fetchone():
            connection.execute("""
                CREATE TABLE project_suppliers (
                    id uuid PRIMARY KEY,
                    project_id uuid NOT NULL REFERENCES purchasing_projects(id) ON DELETE CASCADE,
                    name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
                    location varchar(200) NOT NULL DEFAULT '',
                    description varchar(5000) NOT NULL DEFAULT '',
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                CREATE INDEX project_suppliers_project_idx ON project_suppliers(project_id);
                INSERT INTO sdss_migrations(version) VALUES (2)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 3").fetchone():
            connection.execute("""
                CREATE TABLE project_criteria (
                    project_id uuid PRIMARY KEY REFERENCES purchasing_projects(id) ON DELETE CASCADE,
                    configuration jsonb NOT NULL,
                    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                INSERT INTO sdss_migrations(version) VALUES (3)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 4").fetchone():
            connection.execute("""
                CREATE TABLE project_weights (
                    project_id uuid PRIMARY KEY REFERENCES purchasing_projects(id) ON DELETE CASCADE,
                    weights jsonb NOT NULL,
                    criteria_revision integer NOT NULL,
                    revision integer NOT NULL CHECK (revision > 0),
                    approved boolean NOT NULL DEFAULT false,
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                INSERT INTO sdss_migrations(version) VALUES (4)
            """)


if __name__ == "__main__":
    try:
        with connect() as connection:
            migrate(connection)
        print("Database ready. Project storage migration applied or already present.")
    except (psycopg.Error, OSError, ValueError):
        print("Database setup failed. Check the private connection settings and retry.")
        raise SystemExit(1) from None
