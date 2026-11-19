"""Cookie sessions and shared-workspace role enforcement. No production bypass."""
from contextvars import ContextVar
from datetime import datetime,timedelta,timezone
from hashlib import sha256
import hmac
import os
import re
import secrets
from typing import Literal
from uuid import UUID,uuid4
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError,InvalidHashError
from fastapi import APIRouter,HTTPException,Request,Response
from pydantic import BaseModel,Field,field_validator
from starlette.concurrency import run_in_threadpool
import database

ROLES=('administrator','officer','approver')
USER_COLUMNS='id,username,display_name,role,active,must_change,created_at,updated_at'
HASHER=PasswordHasher(time_cost=3,memory_cost=65536,parallelism=1)
DUMMY_HASH=HASHER.hash(secrets.token_urlsafe(32))
SESSION_HOURS=8
IDLE_MINUTES=30
_actor=ContextVar('sdss_actor',default=None)
router=APIRouter(prefix='/api/auth')


def actor():
    value=_actor.get()
    if value is None:raise HTTPException(401,'Sign in to continue.')
    return value


def actor_label():
    user=actor();return f"{user['display_name']} ({user['username']})"


def actor_id():return actor().get('id')


def username(value):
    value=value.strip().lower()
    if not re.fullmatch(r'[a-z0-9][a-z0-9._@+\-]{2,79}',value):
        raise ValueError('Use 3–80 letters, numbers, dots, underscores, @, + or hyphens for the username.')
    return value


def password(value):
    if not isinstance(value,str) or not 15<=len(value)<=128:
        raise ValueError('Use a password of 15–128 characters. Spaces are allowed.')
    return value


def verify_password(encoded,value):
    try:return HASHER.verify(encoded,value)
    except (VerificationError,InvalidHashError):return False


def public_user(row):
    return {k:(str(row[k]) if k=='id' else row[k].isoformat() if k in ('created_at','updated_at') else row[k]) for k in USER_COLUMNS.split(',')}


def origins():
    raw=os.getenv('SDSS_ALLOWED_ORIGINS','http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000,http://localhost:8000')
    from urllib.parse import urlsplit
    values=set(raw.split(','))
    for value in values:
        parsed=urlsplit(value)
        if parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or not parsed.hostname or parsed.scheme not in ('http','https'):
            raise RuntimeError('Configure exact application origins without paths or credentials.')
        if parsed.scheme=='http' and parsed.hostname not in ('127.0.0.1','localhost'):
            raise RuntimeError('Non-local application origins require HTTPS.')
    return values


def secure_cookie():return any(o.startswith('https://') for o in origins())
def cookie_name():return '__Host-sdss_session' if secure_cookie() else 'sdss_session'
def token_hash(token):return sha256(token.encode()).hexdigest()
def csrf_token(token):return hmac.new(token.encode(),b'sdss-csrf-v1','sha256').hexdigest()


def check_origin(request):
    if request.headers.get('origin') not in origins():raise HTTPException(403,'This request must come from the application.')


def check_csrf(request,token):
    check_origin(request)
    supplied=request.headers.get('x-csrf-token','')
    if not re.fullmatch('[0-9a-f]{64}',supplied) or not hmac.compare_digest(supplied,csrf_token(token)):
        raise HTTPException(403,'The session check failed. Refresh the page and try again.')


def set_cookie(response,token):
    response.set_cookie(cookie_name(),token,max_age=SESSION_HOURS*3600,httponly=True,secure=secure_cookie(),samesite='strict',path='/')
    response.headers['Cache-Control']='no-store'


def issue_session(connection,user_id):
    now=datetime.now(timezone.utc)
    connection.execute('DELETE FROM auth_sessions WHERE expires_at<=%s OR last_seen<%s',(now,now-timedelta(minutes=IDLE_MINUTES)))
    # Bound retained active sessions per user.
    connection.execute('DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE user_id=%s ORDER BY created_at DESC OFFSET 9)',(user_id,))
    raw=secrets.token_urlsafe(32)
    connection.execute('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES (%s,%s,%s)',(token_hash(raw),user_id,now+timedelta(hours=SESSION_HOURS)))
    return raw


def resolve_session(raw):
    if not raw or not re.fullmatch(r'[a-zA-Z0-9_\-]{40,100}',raw):return None
    now=datetime.now(timezone.utc)
    with database.connect() as connection:
        row=connection.execute('SELECT u.*,s.last_seen,s.expires_at FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=%s',(token_hash(raw),)).fetchone()
        if not row or not row['active'] or row['expires_at']<=now or row['last_seen']<now-timedelta(minutes=IDLE_MINUTES):return None
        if row['last_seen']<now-timedelta(minutes=5):connection.execute('UPDATE auth_sessions SET last_seen=%s WHERE token_hash=%s',(now,token_hash(raw)))
        return public_user(row)


def permitted(role,method,path):
    if path.startswith('/api/auth/users'):return role=='administrator'
    if method in ('GET','HEAD','OPTIONS'):return role in ROLES
    if path in ('/api/auth/logout','/api/auth/change-password'):return role in ROLES
    if re.fullmatch(r'/api/projects/[0-9a-fA-F-]+/decisions',path) and method=='POST':return role in ('administrator','approver')
    return role in ('administrator','officer') and (path.startswith('/api/projects') or path.startswith('/api/workspace/templates'))


async def authorize(request:Request):
    path=request.url.path
    public=path in ('/api/health','/api/auth/session','/api/auth/login','/api/auth/logout')
    if public:
        if request.method not in ('GET','HEAD','OPTIONS'):check_origin(request)
        yield
        return
    raw=request.cookies.get(cookie_name())
    user=await run_in_threadpool(resolve_session,raw)
    if not user:raise HTTPException(401,'Your session has ended. Sign in to continue.')
    if user['must_change'] and path!='/api/auth/change-password':raise HTTPException(403,'Change your initial password before continuing.')
    if not permitted(user['role'],request.method,path):raise HTTPException(403,'Your role does not allow this action.')
    if request.method not in ('GET','HEAD','OPTIONS'):check_csrf(request,raw)
    request.state.user=user
    marker=_actor.set(user)
    try:yield
    finally:_actor.reset(marker)


class Login(BaseModel):
    username:str=Field(min_length=1,max_length=80)
    password:str=Field(min_length=1,max_length=128,repr=False)


class NewUser(BaseModel):
    id:UUID
    username:str=Field(min_length=3,max_length=80)
    display_name:str=Field(min_length=1,max_length=100)
    role:Literal['administrator','officer','approver']
    password:str=Field(min_length=15,max_length=128,repr=False)
    @field_validator('username')
    @classmethod
    def normalize_username(cls,value):return username(value)
    @field_validator('display_name',mode='before')
    @classmethod
    def trim_name(cls,value):return value.strip() if isinstance(value,str) else value


class UpdateUser(BaseModel):
    display_name:str=Field(min_length=1,max_length=100)
    role:Literal['administrator','officer','approver']
    active:bool
    expected_updated_at:datetime
    @field_validator('display_name',mode='before')
    @classmethod
    def trim_name(cls,value):return value.strip() if isinstance(value,str) else value


class ChangePassword(BaseModel):
    current_password:str=Field(min_length=1,max_length=128,repr=False)
    new_password:str=Field(min_length=15,max_length=128,repr=False)


class ResetPassword(BaseModel):
    new_password:str=Field(min_length=15,max_length=128,repr=False)
    expected_updated_at:datetime


@router.get('/session')
def session(request:Request,response:Response):
    response.headers['Cache-Control']='no-store'
    raw=request.cookies.get(cookie_name());user=resolve_session(raw)
    if user:return {'user':user,'csrf_token':csrf_token(raw),'setup_required':False}
    with database.connect() as connection:exists=connection.execute('SELECT 1 FROM auth_users LIMIT 1').fetchone()
    return {'user':None,'csrf_token':None,'setup_required':not bool(exists)}


def login_attempt(payload,ip):
    now=datetime.now(timezone.utc)
    name=payload.username.strip().lower()
    keys=[token_hash('ip:'+ip),token_hash('account:'+name)]
    with database.connect() as connection:
        for key in sorted(keys):connection.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',('sdss-login:'+key,))
        limits=connection.execute('SELECT * FROM auth_login_limits WHERE key=ANY(%s)',(keys,)).fetchall()
        if any(r['blocked_until'] and r['blocked_until']>now for r in limits):return None,None,429
        row=connection.execute('SELECT * FROM auth_users WHERE username=%s FOR UPDATE',(name,)).fetchone()
        valid=verify_password(row['password_hash'] if row else DUMMY_HASH,payload.password)
        if not row or not row['active'] or not valid:
            for key,maximum in zip(keys,(20,5)):
                previous=next((r for r in limits if r['key']==key),None)
                fresh=not previous or previous['window_started']<now-timedelta(minutes=5)
                failures=1 if fresh else previous['failures']+1
                start=now if fresh else previous['window_started']
                blocked=now+timedelta(minutes=5) if failures>=maximum else None
                connection.execute('INSERT INTO auth_login_limits(key,failures,window_started,blocked_until) VALUES (%s,%s,%s,%s) ON CONFLICT(key) DO UPDATE SET failures=EXCLUDED.failures,window_started=EXCLUDED.window_started,blocked_until=EXCLUDED.blocked_until',(key,failures,start,blocked))
            return None,None,401
        connection.execute('DELETE FROM auth_login_limits WHERE key=%s',(keys[1],))
        if HASHER.check_needs_rehash(row['password_hash']):connection.execute('UPDATE auth_users SET password_hash=%s WHERE id=%s',(HASHER.hash(payload.password),row['id']))
        token=issue_session(connection,row['id'])
        return public_user(row),token,200


@router.post('/login')
def login(payload:Login,request:Request,response:Response):
    user,raw,status=login_attempt(payload,request.client.host if request.client else 'unknown')
    if status==429:raise HTTPException(429,'Too many sign-in attempts. Wait five minutes and try again.',headers={'Retry-After':'300'})
    if status!=200:raise HTTPException(401,'Invalid username or password.')
    set_cookie(response,raw)
    return {'user':user,'csrf_token':csrf_token(raw),'setup_required':False}


@router.post('/logout',status_code=204)
def logout(request:Request,response:Response):
    raw=request.cookies.get(cookie_name())
    if resolve_session(raw):
        check_csrf(request,raw)
        with database.connect() as connection:connection.execute('DELETE FROM auth_sessions WHERE token_hash=%s',(token_hash(raw),))
    response.delete_cookie(cookie_name(),path='/',secure=secure_cookie(),httponly=True,samesite='strict')
    response.headers['Cache-Control']='no-store'


@router.get('/users')
def users():
    with database.connect() as connection:return {'users':[public_user(r) for r in connection.execute(f'SELECT {USER_COLUMNS} FROM auth_users ORDER BY created_at,id').fetchall()]}


@router.post('/users',status_code=201)
def create_user(payload:NewUser):
    encoded=HASHER.hash(payload.password)
    with database.connect() as connection:
        connection.execute('SELECT pg_advisory_xact_lock(73120402)')
        old=connection.execute('SELECT * FROM auth_users WHERE id=%s OR username=%s',(payload.id,payload.username)).fetchone()
        if old:
            if old['id']==payload.id and old['username']==payload.username and old['display_name']==payload.display_name and old['role']==payload.role and verify_password(old['password_hash'],payload.password):return public_user(old)
            raise HTTPException(409,'This username or account identifier is already in use. Reload the account list.')
        row=connection.execute(f'INSERT INTO auth_users(id,username,display_name,role,password_hash) VALUES (%s,%s,%s,%s,%s) RETURNING {USER_COLUMNS}',(payload.id,payload.username,payload.display_name,payload.role,encoded)).fetchone()
        return public_user(row)


@router.put('/users/{user_id}')
def update_user(user_id:UUID,payload:UpdateUser):
    with database.connect() as connection:
        connection.execute('SELECT pg_advisory_xact_lock(73120402)')
        old=connection.execute('SELECT * FROM auth_users WHERE id=%s FOR UPDATE',(user_id,)).fetchone()
        if not old:raise HTTPException(404,'Account not found.')
        if old['updated_at']!=payload.expected_updated_at:raise HTTPException(409,'This account changed. Reload before editing it.')
        if old['active'] and old['role']=='administrator' and (not payload.active or payload.role!='administrator'):
            count=connection.execute("SELECT count(*) AS total FROM auth_users WHERE active AND role='administrator'").fetchone()['total']
            if count<=1:raise HTTPException(422,'Keep at least one active administrator.')
        row=connection.execute(f'UPDATE auth_users SET display_name=%s,role=%s,active=%s,updated_at=clock_timestamp() WHERE id=%s RETURNING {USER_COLUMNS}',(payload.display_name,payload.role,payload.active,user_id)).fetchone()
        connection.execute('DELETE FROM auth_sessions WHERE user_id=%s',(user_id,))
        return public_user(row)


@router.post('/users/{user_id}/reset-password')
def reset_password(user_id:UUID,payload:ResetPassword):
    if str(user_id)==actor()['id']:raise HTTPException(422,'Use Change Password for your own account.')
    encoded=HASHER.hash(payload.new_password)
    with database.connect() as connection:
        row=connection.execute(f'UPDATE auth_users SET password_hash=%s,must_change=true,updated_at=clock_timestamp() WHERE id=%s AND updated_at=%s RETURNING {USER_COLUMNS}',(encoded,user_id,payload.expected_updated_at)).fetchone()
        if not row:raise HTTPException(409,'This account changed or no longer exists. Reload before resetting its password.')
        connection.execute('DELETE FROM auth_sessions WHERE user_id=%s',(user_id,))
        return public_user(row)


@router.post('/change-password')
def change_password(payload:ChangePassword,request:Request,response:Response):
    now=datetime.now(timezone.utc);key=token_hash('password-change:'+actor()['id'])
    status=200;message=''
    with database.connect() as connection:
        row=connection.execute('SELECT * FROM auth_users WHERE id=%s FOR UPDATE',(actor()['id'],)).fetchone()
        limit=connection.execute('SELECT * FROM auth_login_limits WHERE key=%s',(key,)).fetchone()
        if limit and limit['blocked_until'] and limit['blocked_until']>now:
            status=429;message='Too many password attempts. Wait five minutes and try again.'
        elif not row or not verify_password(row['password_hash'],payload.current_password):
            fresh=not limit or limit['window_started']<now-timedelta(minutes=5)
            failures=1 if fresh else limit['failures']+1
            connection.execute('INSERT INTO auth_login_limits(key,failures,window_started,blocked_until) VALUES (%s,%s,%s,%s) ON CONFLICT(key) DO UPDATE SET failures=EXCLUDED.failures,window_started=EXCLUDED.window_started,blocked_until=EXCLUDED.blocked_until',(key,failures,now if fresh else limit['window_started'],now+timedelta(minutes=5) if failures>=5 else None))
            status=422;message='The current password is incorrect.'
        elif payload.current_password==payload.new_password:
            status=422;message='Choose a different new password.'
        else:
            row=connection.execute(f'UPDATE auth_users SET password_hash=%s,must_change=false,updated_at=clock_timestamp() WHERE id=%s RETURNING {USER_COLUMNS}',(HASHER.hash(payload.new_password),row['id'])).fetchone()
            connection.execute('DELETE FROM auth_login_limits WHERE key=%s',(key,))
            connection.execute('DELETE FROM auth_sessions WHERE user_id=%s',(row['id'],))
            raw=issue_session(connection,row['id'])
    # Commit failed-attempt counters before raising a response exception.
    if status!=200:raise HTTPException(status,message,headers={'Retry-After':'300'} if status==429 else None)
    set_cookie(response,raw)
    return {'user':public_user(row),'csrf_token':csrf_token(raw),'setup_required':False}


def bootstrap_administrator(name,display_name,secret):
    name=username(name);password(secret);display_name=display_name.strip()
    if not 1<=len(display_name)<=100:raise ValueError('Enter a display name of at most 100 characters.')
    encoded=HASHER.hash(secret)
    with database.connect() as connection:
        connection.execute('SELECT pg_advisory_xact_lock(73120402)')
        if connection.execute('SELECT 1 FROM auth_users LIMIT 1').fetchone():raise ValueError('Accounts already exist. Sign in as an administrator to manage them.')
        row=connection.execute(f'INSERT INTO auth_users(id,username,display_name,role,password_hash,must_change) VALUES (%s,%s,%s,%s,%s,false) RETURNING {USER_COLUMNS}',(uuid4(),name,display_name,'administrator',encoded)).fetchone()
        return public_user(row)
