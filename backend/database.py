"""Database access; credentials are loaded privately and never logged."""
import json
import os
import threading
from pathlib import Path

postgres_bin = Path("C:/Program Files/PostgreSQL/18/bin")
if os.name == "nt" and postgres_bin.exists():
    os.environ["PATH"] = str(postgres_bin) + os.pathsep + os.environ.get("PATH", "")
    os.environ["PSYCOPG_IMPL"] = "python"
    dll_directory = os.add_dll_directory(str(postgres_bin))
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

class _PooledConnection(psycopg.Connection):
    def __exit__(self, exc_type, exc_val, exc_tb):
        owner = getattr(self, '_pool', None)
        try:
            super().__exit__(exc_type, exc_val, exc_tb)
        finally:
            if owner is not None:
                owner.putconn(self)


_pool = None
_pool_lock = threading.Lock()


def settings():
    if os.environ.get("DATABASE_URL"):
        return {"conninfo": os.environ["DATABASE_URL"]}
    return json.loads(Path(__file__).with_name("database.local.json").read_text(encoding="utf-8"))


def _reset_connection(connection):
    # Session settings (especially test-schema search_path) must never cross leases.
    connection.autocommit = True
    try:
        connection.execute('RESET ALL')
    finally:
        connection.autocommit = False


def open_pool(*, min_size=2, max_size=6):
    """Enabled by the API lifespan only; standalone migrations keep raw connections."""
    global _pool
    with _pool_lock:
        if _pool is not None:
            return
        config = dict(settings())
        conninfo = config.pop('conninfo', '')
        config.update(connect_timeout=15, row_factory=dict_row, prepare_threshold=None)
        _pool = ConnectionPool(conninfo, connection_class=_PooledConnection, kwargs=config, min_size=min_size,
            max_size=max_size, max_waiting=24, timeout=8, max_idle=60,
            max_lifetime=1800, reset=_reset_connection,
            check=ConnectionPool.check_connection, open=False, name='sdss-api')
        _pool.open(wait=False)


def close_pool():
    global _pool
    with _pool_lock:
        pool, _pool = _pool, None
    if pool is not None:
        pool.close()


def connect():
    pool = _pool
    if pool is not None:
        # Preserve the existing connection API; context exit returns its lease.
        return pool.getconn()
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


        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 5").fetchone():
            connection.execute("""
                CREATE TABLE supplier_reviews (
                    supplier_id uuid PRIMARY KEY REFERENCES project_suppliers(id) ON DELETE CASCADE,
                    determinations jsonb NOT NULL,
                    criteria_revision integer NOT NULL,
                    supplier_updated_at timestamptz NOT NULL,
                    revision integer NOT NULL CHECK (revision > 0),
                    reviewer text NOT NULL DEFAULT 'Demo User (unauthenticated)',
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                INSERT INTO sdss_migrations(version) VALUES (5)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 6").fetchone():
            connection.execute("""
                CREATE TABLE project_matrix (
                    project_id uuid PRIMARY KEY REFERENCES purchasing_projects(id) ON DELETE CASCADE,
                    entries jsonb NOT NULL,
                    context text NOT NULL,
                    revision integer NOT NULL CHECK (revision > 0),
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                INSERT INTO sdss_migrations(version) VALUES (6)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 7").fetchone():
            connection.execute("""
                CREATE TABLE ranking_runs (
                    id uuid PRIMARY KEY,
                    project_id uuid NOT NULL REFERENCES purchasing_projects(id),
                    context text NOT NULL,
                    matrix_revision integer NOT NULL,
                    snapshot jsonb NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                    UNIQUE(project_id,context,matrix_revision)
                );
                INSERT INTO sdss_migrations(version) VALUES (7)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 8").fetchone():
            connection.execute("""
                CREATE TABLE project_decisions (
                    id uuid PRIMARY KEY,
                    project_id uuid NOT NULL REFERENCES purchasing_projects(id),
                    ranking_id uuid NOT NULL REFERENCES ranking_runs(id),
                    version integer NOT NULL CHECK (version > 0),
                    request jsonb NOT NULL,
                    snapshot jsonb NOT NULL,
                    actor text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                    UNIQUE(project_id,version)
                );
                INSERT INTO sdss_migrations(version) VALUES (8)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 9").fetchone():
            connection.execute("""
                ALTER TABLE project_weights ADD COLUMN method text NOT NULL DEFAULT 'manual' CHECK (method IN ('manual','ahp'));
                ALTER TABLE project_weights ADD COLUMN provenance jsonb NOT NULL DEFAULT '{}'::jsonb;
                CREATE TABLE project_ahp (
                    project_id uuid PRIMARY KEY REFERENCES purchasing_projects(id) ON DELETE CASCADE,
                    judgments jsonb NOT NULL,
                    criteria_revision integer NOT NULL,
                    revision integer NOT NULL CHECK (revision > 0),
                    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
                );
                CREATE TABLE project_ahp_versions (
                    project_id uuid NOT NULL REFERENCES purchasing_projects(id),
                    revision integer NOT NULL,
                    snapshot jsonb NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                    PRIMARY KEY(project_id,revision)
                );
                INSERT INTO sdss_migrations(version) VALUES (9)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 10").fetchone():
            connection.execute("""
                ALTER TABLE project_weights DROP CONSTRAINT project_weights_method_check;
                ALTER TABLE project_weights ADD CONSTRAINT project_weights_method_check CHECK (method IN ('manual','ahp','ai'));
                CREATE TABLE project_ai_suggestions (
                    id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES purchasing_projects(id),
                    request jsonb NOT NULL, context text NOT NULL, snapshot jsonb NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
                );
                CREATE TABLE project_ai_drafts (
                    project_id uuid PRIMARY KEY REFERENCES purchasing_projects(id),
                    suggestion_id uuid NOT NULL REFERENCES project_ai_suggestions(id),
                    weights jsonb NOT NULL, notes text NOT NULL DEFAULT '', context text NOT NULL,
                    revision integer NOT NULL CHECK (revision>0), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
                );
                CREATE TABLE project_ai_versions (
                    project_id uuid NOT NULL REFERENCES purchasing_projects(id), revision integer NOT NULL,
                    snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                    PRIMARY KEY(project_id,revision)
                );
                INSERT INTO sdss_migrations(version) VALUES (10)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 11").fetchone():
            connection.execute("""
                ALTER TABLE project_suppliers ADD COLUMN evidence_revision integer NOT NULL DEFAULT 0;
                ALTER TABLE supplier_reviews ADD COLUMN evidence_revision integer NOT NULL DEFAULT 0;
                CREATE TABLE supplier_evidence (
                    id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES purchasing_projects(id),
                    supplier_id uuid NOT NULL, supplier_name text NOT NULL,
                    filename text NOT NULL, mime_type text NOT NULL,
                    size_bytes integer NOT NULL CHECK (size_bytes>0 AND size_bytes<=2097152),
                    sha256 varchar(64) NOT NULL, content bytea NOT NULL,
                    check_id text, check_name text, criteria_revision integer NOT NULL,
                    uploaded_by text NOT NULL DEFAULT 'Demo User (unauthenticated)',
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), archived_at timestamptz,
                    CHECK (octet_length(content)=size_bytes)
                );
                CREATE INDEX supplier_evidence_project_supplier_idx ON supplier_evidence(project_id,supplier_id);
                INSERT INTO sdss_migrations(version) VALUES (11)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 12").fetchone():
            connection.execute("""
                CREATE TABLE sensitivity_scenarios (
                    id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES purchasing_projects(id),
                    baseline_id uuid NOT NULL REFERENCES ranking_runs(id), request jsonb NOT NULL,
                    snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
                );
                CREATE INDEX sensitivity_scenarios_baseline_idx ON sensitivity_scenarios(project_id,baseline_id,created_at);
                INSERT INTO sdss_migrations(version) VALUES (12)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 13").fetchone():
            connection.execute("""
                ALTER TABLE project_matrix ADD COLUMN input_basis jsonb;
                INSERT INTO sdss_migrations(version) VALUES (13)
            """)

        if not connection.execute("SELECT 1 FROM sdss_migrations WHERE version = 14").fetchone():
            connection.execute("""
                CREATE TABLE auth_users (
                    id uuid PRIMARY KEY, username varchar(80) UNIQUE NOT NULL CHECK (username=lower(username)),
                    display_name varchar(100) NOT NULL, role text NOT NULL CHECK (role IN ('administrator','officer','approver')),
                    password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
                    must_change boolean NOT NULL DEFAULT true,
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
                );
                CREATE TABLE auth_sessions (
                    token_hash varchar(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth_users(id),
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                    last_seen timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL
                );
                CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
                CREATE TABLE auth_login_limits (
                    key varchar(64) PRIMARY KEY, failures integer NOT NULL,
                    window_started timestamptz NOT NULL, blocked_until timestamptz
                );
                ALTER TABLE supplier_reviews ADD COLUMN reviewer_id uuid REFERENCES auth_users(id);
                ALTER TABLE project_decisions ADD COLUMN actor_id uuid REFERENCES auth_users(id);
                ALTER TABLE supplier_evidence ADD COLUMN uploaded_by_id uuid REFERENCES auth_users(id);
                INSERT INTO sdss_migrations(version) VALUES (14)
            """)

if __name__ == "__main__":
    try:
        with connect() as connection:
            migrate(connection)
        print("Database ready. Project storage migration applied or already present.")
    except (psycopg.Error, OSError, ValueError):
        print("Database setup failed. Check the private connection settings and retry.")
        raise SystemExit(1) from None
