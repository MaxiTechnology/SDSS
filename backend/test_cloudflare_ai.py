import json
from pathlib import Path
import urllib.error
import pytest
import cloudflare_ai as ai

ACCOUNT='a'*32
TOKEN='synthetic-token-not-a-real-credential'


def test_validation_and_fixed_endpoint():
    assert ai.validate_settings(' '+ACCOUNT+' ',TOKEN)['model']==ai.MODEL
    for account,token in [('https://example.com',TOKEN),('a'*31,TOKEN),(ACCOUNT,'*****'),(ACCOUNT,'bad\nheader token that is long')]:
        with pytest.raises(ai.AIConnectionError):ai.validate_settings(account,token)


def test_verified_save_and_failure_keep_previous_credentials(tmp_path,monkeypatch):
    target=tmp_path/'ai.local.json';target.write_text('previous settings',encoding='utf-8')
    seen=[]
    def verify(config,messages,max_tokens):
        seen.append((config,messages,max_tokens));return 'OK'
    monkeypatch.setattr(ai,'generate',verify)
    ai.verify_and_save(ACCOUNT,TOKEN,target)
    assert json.loads(target.read_text())['token']==TOKEN
    assert seen[0][2]==8 and 'connection check' in seen[0][1][0]['content']
    before=target.read_bytes()
    def reject(*args,**kwargs):raise ai.AIConnectionError('Connection rejected.')
    monkeypatch.setattr(ai,'generate',reject)
    with pytest.raises(ai.AIConnectionError):ai.verify_and_save(ACCOUNT,'new-synthetic-token-not-real',target)
    assert target.read_bytes()==before and not list(tmp_path.glob('*.tmp'))


def test_transport_payload_and_private_errors(monkeypatch):
    class Reply:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,limit):return b'{"success":true,"result":{"response":"OK"}}'
    def send(request,timeout):
        assert request.full_url==f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/run/{ai.MODEL}'
        assert request.get_header('Authorization')=='Bearer '+TOKEN
        assert json.loads(request.data)['max_tokens']==8 and timeout==25
        return Reply()
    monkeypatch.setattr(ai.urllib.request,'urlopen',send)
    assert ai.generate(ai.validate_settings(ACCOUNT,TOKEN),[{'role':'user','content':'Check'}],8)=='OK'
    for status,expected in [(403,'Connection rejected'),(429,'usage limit'),(500,'could not complete')]:
        def fail(*args,**kwargs):raise urllib.error.HTTPError('https://api.cloudflare.com',status,TOKEN,None,None)
        monkeypatch.setattr(ai.urllib.request,'urlopen',fail)
        with pytest.raises(ai.AIConnectionError,match=expected) as error:ai.generate(ai.validate_settings(ACCOUNT,TOKEN),[])
        assert TOKEN not in str(error.value)


def test_malformed_response_is_private(monkeypatch):
    class Reply:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,limit):return ('broken '+TOKEN).encode()
    monkeypatch.setattr(ai.urllib.request,'urlopen',lambda *args,**kwargs:Reply())
    with pytest.raises(ai.AIConnectionError) as error:ai.generate(ai.validate_settings(ACCOUNT,TOKEN),[])
    assert TOKEN not in str(error.value)
