"""Real authentication: no dependency override; cloud checks use a disposable schema."""
import os
from uuid import uuid4
import pytest
from psycopg import sql
from fastapi.testclient import TestClient
import auth,database
from app import app
pytestmark=pytest.mark.auth_required


def test_passwords_roles_and_origins(monkeypatch):
    secret=' Spaces and Unicode Ω are allowed '
    encoded=auth.HASHER.hash(secret)
    assert encoded.startswith('$argon2id$') and encoded!=auth.HASHER.hash(secret)
    assert auth.verify_password(encoded,secret) and not auth.verify_password(encoded,secret.strip())
    assert auth.password(secret)==secret
    assert auth.username('  Student.Test  ')=='student.test'
    for role in auth.ROLES:
        assert auth.permitted(role,'GET','/api/projects')
        assert auth.permitted(role,'POST','/api/projects/abc-123/decisions')==(role!='officer')
        assert auth.permitted(role,'PUT','/api/projects/abc-123/matrix')==(role!='approver')
        assert auth.permitted(role,'GET','/api/auth/users')==(role=='administrator')
    monkeypatch.setenv('SDSS_ALLOWED_ORIGINS','http://example.com')
    with pytest.raises(RuntimeError):auth.origins()
    monkeypatch.setenv('SDSS_ALLOWED_ORIGINS','https://example.com')
    assert auth.secure_cookie() and auth.cookie_name().startswith('__Host-')


@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit isolated cloud opt-in required')
def test_real_sessions_permissions_account_lifecycle_and_attribution(monkeypatch):
    original=database.connect;schema='sdss_test_'+uuid4().hex
    with original() as c:c.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        c=original();c.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return c
    monkeypatch.setattr(database,'connect',isolated)
    monkeypatch.setenv('SDSS_ALLOWED_ORIGINS','http://127.0.0.1:8000')
    secret='Initial password for test only 42!';changed='Replacement test password only 43!'
    clients=[]
    def client():
        c=TestClient(app,base_url="http://127.0.0.1:8000");c.headers['Origin']='http://127.0.0.1:8000';clients.append(c);return c
    def login(c,name,password=secret,status=200):
        r=c.post('/api/auth/login',json={'username':name,'password':password});assert r.status_code==status,r.text
        if status==200:c.headers['X-CSRF-Token']=r.json()['csrf_token']
        return r
    def req(c,method,path,body=None,status=200):
        r=c.request(method,path,json=body);assert r.status_code==status,(path,r.text)
        return r.json() if r.content else None
    try:
        database.open_pool(min_size=1,max_size=4)
        with isolated() as c:database.migrate(c);database.migrate(c)
        anonymous=client();assert req(anonymous,'GET','/api/auth/session')['setup_required']
        req(anonymous,'GET','/api/projects',status=401)
        req(anonymous,'POST','/api/auth/users',{},401)
        # No public browser bootstrap; offline first administrator only.
        admin=auth.bootstrap_administrator('test-admin','Administrator',secret)
        with pytest.raises(ValueError):auth.bootstrap_administrator('second','Second',secret)
        a=client();response=login(a,'test-admin')
        assert 'httponly' in response.headers['set-cookie'].lower() and 'samesite=strict' in response.headers['set-cookie'].lower()
        assert 'password' not in response.text and not req(a,'GET','/api/auth/session')['setup_required']
        raw=a.cookies.get(auth.cookie_name())
        with isolated() as c:
            stored=c.execute('SELECT * FROM auth_sessions').fetchone();assert stored['token_hash']==auth.token_hash(raw) and raw!=stored['token_hash']
        a.headers.pop('X-CSRF-Token');req(a,'POST','/api/projects',{},403);a.headers['X-CSRF-Token']=auth.csrf_token(raw)
        a.headers['Origin']='http://evil.example';req(a,'POST','/api/projects',{},403);a.headers['Origin']='http://127.0.0.1:8000'
        malformed=a.post('/api/auth/change-password',json={'current_password':secret,'new_password':'short-secret'})
        assert malformed.status_code==422 and secret not in malformed.text and 'short-secret' not in malformed.text
        req(a,'PUT','/api/auth/users/'+admin['id'],{'display_name':'Administrator','role':'officer','active':True,'expected_updated_at':admin['updated_at']},422)
        users={}
        for role in ('officer','approver'):
            users[role]=req(a,'POST','/api/auth/users',{'id':str(uuid4()),'username':role,'display_name':role.title(),'role':role,'password':secret},201)
        officer=client();login(officer,'officer');req(officer,'GET','/api/projects',status=403)
        old=officer.cookies.get(auth.cookie_name())
        result=req(officer,'POST','/api/auth/change-password',{'current_password':secret,'new_password':changed})
        officer.headers['X-CSRF-Token']=result['csrf_token'];assert not result['user']['must_change']
        assert not auth.resolve_session(old)
        approver=client();login(approver,'approver');result=req(approver,'POST','/api/auth/change-password',{'current_password':secret,'new_password':changed});approver.headers['X-CSRF-Token']=result['csrf_token']
        req(approver,'GET','/api/projects');req(approver,'GET','/api/auth/users',status=403)
        req(approver,'POST','/api/projects',{},403)
        for name in ('suppliers','templates','evaluations','reports'):req(approver,'GET','/api/workspace/'+name)
        req(approver,'POST','/api/workspace/templates',{},403)
        req(approver,'PUT','/api/workspace/templates/'+str(uuid4()),{},403)
        req(officer,'POST','/api/workspace/templates',{},422)
        pid=str(uuid4());base='/api/projects/'+pid
        req(officer,'POST','/api/projects',{'id':pid,'name':'Authenticated synthetic workflow','currency':'RUB'},201)
        suppliers=[req(officer,'POST',base+'/suppliers',{'id':str(uuid4()),'name':n},201) for n in ('Alpha','Beta')]
        req(officer,'PUT',base+'/criteria',{'criteria':[{'id':'price','name':'Price','unit':'RUB','direction':'cost'},{'id':'quality','name':'Quality','unit':'points','direction':'benefit'}],'expected_revision':0})
        req(officer,'PUT',base+'/weights/manual',{'weights':{'price':'50','quality':'50'},'criteria_revision':1,'expected_revision':0,'approved':True})
        m=req(officer,'GET',base+'/matrix')
        req(officer,'PUT',base+'/matrix',{'context':m['context'],'expected_revision':0,'entries':{s['id']:{'price':str(100+i*20),'quality':str(90-i*10)} for i,s in enumerate(suppliers)}})
        run=req(officer,'POST',base+'/rankings',{'context':m['context'],'matrix_revision':1})
        decision={'id':str(uuid4()),'ranking_id':run['id'],'expected_version':0,'action':'approve','supplier_id':suppliers[0]['id'],'confirmed':True}
        req(officer,'POST',base+'/decisions',decision,403)
        req(approver,'PUT',base+'/matrix',{},403)
        saved=req(approver,'POST',base+'/decisions',decision)
        assert saved['actor']=='Approver (approver)'
        with isolated() as c:
            row=c.execute('SELECT actor_id,snapshot FROM project_decisions WHERE id=%s',(saved['id'],)).fetchone()
            assert str(row['actor_id'])==users['approver']['id'] and row['snapshot']['actor_role']=='approver'
        report=req(approver,'GET',base+'/decisions/'+saved['id']+'/report')
        assert 'signed-in account' in report['notice']
        # Shared templates remain preparation actions; an Approver can only inspect them.
        meta=next(p for p in req(officer,'GET','/api/workspace/templates')['projects'] if p['id']==pid)
        template=req(officer,'POST','/api/workspace/templates',{'id':str(uuid4()),'name':'Authenticated template','source_project_id':pid,'expected_source_updated_at':meta['updated_at'],'expected_criteria_revision':meta['criteria_revision'],'expected_weight_revision':meta['weight_revision'],'include_weights':True},201)
        preview=req(officer,'GET','/api/workspace/templates/'+template['id']+'/preview?project_id='+pid)
        apply={'id':str(uuid4()),'project_id':pid,'expected_project_updated_at':preview['project_updated_at'],'expected_criteria_revision':preview['criteria_revision'],'expected_weight_revision':preview['weight_revision'],'expected_template_version':template['version'],'confirmed':True}
        req(approver,'POST','/api/workspace/templates/'+template['id']+'/apply',apply,403)
        req(officer,'POST','/api/workspace/templates/'+template['id']+'/apply',apply)
        assert req(officer,'GET',base+'/weights/manual')['approved'] is False
        assert req(approver,'GET',base+'/decisions/'+saved['id']+'/report')==report
        with isolated() as c:
            assert str(c.execute('SELECT created_by FROM criteria_templates WHERE id=%s',(template['id'],)).fetchone()['created_by'])==users['officer']['id']
        # Logout invalidates the server session, even if its old cookie is replayed.
        old=approver.cookies.get(auth.cookie_name());req(approver,'POST','/api/auth/logout',status=204);assert not auth.resolve_session(old)
        req(approver,'GET','/api/projects',status=401)
        # Account edits revoke every session; optimistic edits and final admin protection.
        current=req(a,'GET','/api/auth/users')['users'];u=next(u for u in current if u['role']=='officer')
        updated=req(a,'PUT','/api/auth/users/'+u['id'],{'display_name':'Officer renamed','role':'officer','active':True,'expected_updated_at':u['updated_at']})
        req(officer,'GET','/api/projects',status=401)
        req(a,'PUT','/api/auth/users/'+u['id'],{'display_name':'Stale','role':'officer','active':True,'expected_updated_at':u['updated_at']},409)
        req(a,'POST','/api/auth/users/'+u['id']+'/reset-password',{'new_password':secret,'expected_updated_at':updated['updated_at']})
        login(officer,'officer');assert req(officer,'GET','/api/auth/session')['user']['must_change']
        req(officer,'GET','/api/projects',status=403)
        # Password confirmation cannot be brute-forced through an already signed-in session.
        for _ in range(5):req(a,'POST','/api/auth/change-password',{'current_password':'wrong password','new_password':changed},422)
        req(a,'POST','/api/auth/change-password',{'current_password':secret,'new_password':changed},429)
        # Absolute and idle expiry are both enforced at the server.
        with isolated() as c:c.execute("UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=%s",(admin['id'],))
        req(a,'GET','/api/projects',status=401);login(a,'test-admin')
        with isolated() as c:c.execute("UPDATE auth_sessions SET last_seen=clock_timestamp()-interval '31 minutes' WHERE user_id=%s",(admin['id'],))
        req(a,'GET','/api/projects',status=401)
        bad=client()
        for _ in range(5):login(bad,'unknown','wrong password',401)
        limited=login(bad,'unknown','wrong password',429);assert limited.headers['Retry-After']=='300'
    finally:
        for c in clients:c.close()
        database.close_pool()
        with original() as c:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
