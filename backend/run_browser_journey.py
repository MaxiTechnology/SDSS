"""Opt-in real-browser integration runner; never adds test switches to the app API."""
import os
import re
import socket
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4
import database
from psycopg import sql

ROOT=Path(__file__).resolve().parent.parent
BACKEND_PORT=8001
PATTERN=r'sdss_browser_test_[0-9a-f]{32}'


def serve(schema):
    if not re.fullmatch(PATTERN,schema):raise ValueError('Invalid isolated schema')
    original=database.connect
    def isolated():
        connection=original()
        connection.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
        return connection
    # Missing test tables must fail; public is deliberately absent from search_path.
    database.connect=isolated
    # Substitute only the provider boundary, inside this isolated test process.
    # Parsing, consent, persistence and approval still run through the real API.
    import json,cloudflare_ai
    fixture={'calls':0}
    cloudflare_ai.settings=lambda:{'synthetic_browser_fixture':True}
    cloudflare_ai.MODEL='synthetic-browser-fixture'
    def generate(settings,messages,*,max_tokens):
        fixture['calls']+=1
        if fixture['calls']==1:
            raise cloudflare_ai.AIConnectionError('Synthetic provider outage. Your saved work was kept. Try again.')
        incoming=json.loads(messages[-1]['content'])
        ids={c['id'] for c in incoming['context']['criteria']}
        weights={'price':'40.00','quality':'30.00','delivery':'15.00','reliability':'10.00','warranty':'5.00'}
        if ids!=set(weights):raise RuntimeError('Unexpected synthetic AI test criteria')
        return json.dumps({'weights':weights,'rationales':{cid:'Synthetic rationale for '+cid for cid in weights},'summary':'Synthetic advisory suggestion for browser verification.'})
    cloudflare_ai.generate=generate
    from app import app
    @app.get('/api/test-isolation')
    def isolation():return {'schema':schema,'ai_mode':'synthetic-provider-fixture','ai_calls':fixture['calls']}
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=BACKEND_PORT,log_level='warning')


def run():
    if os.environ.get('SDSS_RUN_BROWSER_DATABASE_TESTS')!='1':
        print('Set SDSS_RUN_BROWSER_DATABASE_TESTS=1 to opt into isolated cloud browser tests.')
        return 2
    for port in (BACKEND_PORT,5174):
        with socket.socket() as probe:
            try:probe.bind(('127.0.0.1',port))
            except OSError:
                print(f'Test port {port} is busy. The existing service was left running.')
                return 2
    schema='sdss_browser_test_'+uuid4().hex
    process=None;vite=None;created=False
    output=ROOT/'frontend'/'test-results';output.mkdir(exist_ok=True)
    try:
        with database.connect() as connection:
            connection.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
        created=True
        with database.connect() as connection:
            connection.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
            database.migrate(connection)
        print('Created isolated browser test storage. Starting test services.',flush=True)
        with (output/'live-backend.log').open('w',encoding='utf-8') as log:
            process=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--serve',schema],cwd=ROOT/'backend',stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            for _ in range(100):
                if process.poll() is not None:raise RuntimeError('Test backend failed to start; see ignored test log.')
                try:
                    import json
                    with urlopen(f'http://127.0.0.1:{BACKEND_PORT}/api/test-isolation',timeout=1) as response:
                        if json.load(response).get('schema')==schema:break
                except OSError:pass
                time.sleep(.2)
            else:raise RuntimeError('Test backend did not become ready.')
            node=shutil.which('node')
            if not node:raise RuntimeError('Node is required for the browser test.')
            vite=subprocess.Popen([node,str(ROOT/'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--config','vite.live.config.js','--port','5174','--strictPort'],cwd=ROOT/'frontend',stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            for _ in range(100):
                if vite.poll() is not None:raise RuntimeError('Test frontend failed to start; existing services were not reused.')
                try:
                    with urlopen('http://127.0.0.1:5174/api/test-isolation',timeout=1) as response:
                        if json.load(response).get('schema')==schema:break
                except OSError:pass
                time.sleep(.2)
            else:raise RuntimeError('Test frontend did not become ready.')
            env={**os.environ,'SDSS_BROWSER_TEST_SCHEMA':schema}
            command=[node,str(ROOT/'frontend/node_modules/@playwright/test/cli.js'),'test','--config','playwright.live.config.ts']
            result=subprocess.run(command,cwd=ROOT/'frontend',env=env)
            if result.returncode==0:
                from pypdf import PdfReader
                checks={
                    'live-report.pdf':('Browser Supplier A','Mandatory maximum price: 110','Browser cost emphasis','synthetic-A.txt','synthetic-C.txt'),
                    'live-ahp-report.pdf':('AHP pairwise weighting (approved)','AHP consistency','CR: 0.000000','Browser Supplier A'),
                    'live-ai-report.pdf':('AI-assisted weighting (approved)','synthetic-browser-fixture','Synthetic rationale for price','Original AI weight: 40.00%','Approved weight: 45.00%'),
                }
                for filename,expected_values in checks.items():
                    text='\n'.join(page.extract_text() for page in PdfReader(output/filename).pages)
                    for expected in expected_values:
                        if expected not in text:raise RuntimeError('Downloaded PDF did not contain the expected saved journey details.')
                print('Verified real downloaded PDF contents.',flush=True)
            return result.returncode
    finally:
        for child in (vite,process):
            if child and child.poll() is None:
                child.terminate()
                try:child.wait(timeout=10)
                except subprocess.TimeoutExpired:child.kill();child.wait(timeout=10)
        if created:
            # The identifier is generated here, never read from input or guessed.
            assert re.fullmatch(PATTERN,schema)
            with database.connect() as connection:
                connection.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
            print('Removed isolated browser test storage. Demonstration projects were not edited.',flush=True)


if __name__=='__main__':
    if len(sys.argv)==3 and sys.argv[1]=='--serve':serve(sys.argv[2])
    else:
        try:raise SystemExit(run())
        except (database.psycopg.Error,OSError,RuntimeError):
            print('Browser test setup or cleanup failed. Check local test ports and private database settings; credentials were not printed.')
            raise SystemExit(1) from None
