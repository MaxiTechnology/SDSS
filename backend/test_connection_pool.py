"""Connection reuse must preserve transaction boundaries and schema isolation."""
import os
from uuid import uuid4
import pytest
import database
from psycopg import sql
from psycopg_pool import PoolTimeout

@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit isolated cloud opt-in required')
def test_reuse_reset_rollback_broken_connection_and_shutdown():
    schema='sdss_pool_test_'+uuid4().hex
    with database.connect() as c:
        c.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
        c.execute(sql.SQL('CREATE TABLE {}.pool_probe(value integer)').format(sql.Identifier(schema)))
        default_path=c.execute('SHOW search_path').fetchone()['search_path']
    try:
        database.open_pool(min_size=1,max_size=1)
        with database.connect() as c:
            first=id(c)
            c.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
            c.execute('INSERT INTO pool_probe VALUES (1)')
        with database.connect() as c:
            assert id(c)==first
            assert c.execute('SHOW search_path').fetchone()['search_path']==default_path
            assert c.execute(sql.SQL('SELECT count(*) AS n FROM {}.pool_probe').format(sql.Identifier(schema))).fetchone()['n']==1
        with pytest.raises(RuntimeError):
            with database.connect() as c:
                c.execute(sql.SQL('INSERT INTO {}.pool_probe VALUES (2)').format(sql.Identifier(schema)))
                raise RuntimeError('Synthetic aborted save')
        with database.connect() as c:
            assert c.execute(sql.SQL('SELECT count(*) AS n FROM {}.pool_probe').format(sql.Identifier(schema))).fetchone()['n']==1
        # An explicitly closed transport is discarded instead of leaking a lease.
        with database.connect() as c:c.close()
        with database.connect() as c:
            assert id(c)!=first
            assert c.execute('SELECT 1 AS n').fetchone()['n']==1
        pool=database._pool
        held=database.connect()
        pool.timeout=.1
        try:
            with pytest.raises(PoolTimeout):database.connect()
        finally:held.__exit__(None,None,None)
        pool.timeout=8
        with database.connect() as c:assert c.execute('SELECT 1 AS n').fetchone()['n']==1
    finally:
        database.close_pool()
        assert database._pool is None
        with database.connect() as c:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
