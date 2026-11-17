"""Cloudflare connection settings; credentials never enter source or API responses."""
import json
import os
import re
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
SETTINGS_FILE = Path(__file__).with_name('ai.local.json')


class AIConnectionError(Exception):
    pass


def validate_settings(account_id, token):
    account_id=account_id.strip();token=token.strip()
    if not re.fullmatch(r'[a-fA-F0-9]{32}',account_id):
        raise AIConnectionError('Copy the 32-character Account ID from the Cloudflare REST API page.')
    if not 20<=len(token)<=512 or any(c.isspace() or not 33<=ord(c)<=126 or c=='*' for c in token):
        raise AIConnectionError('Paste the complete API token, without quotes or masked stars.')
    return {'account_id':account_id,'token':token,'model':MODEL}


def settings():
    try:
        if os.environ.get('CLOUDFLARE_ACCOUNT_ID') or os.environ.get('CLOUDFLARE_API_TOKEN'):
            return validate_settings(os.environ.get('CLOUDFLARE_ACCOUNT_ID',''),os.environ.get('CLOUDFLARE_API_TOKEN',''))
        data=json.loads(SETTINGS_FILE.read_text(encoding='utf-8'))
        return validate_settings(data['account_id'],data['token'])
    except (OSError,ValueError,KeyError):
        raise AIConnectionError('AI is not configured. Open Connect AI service.cmd to save the private connection.') from None


def unique_json_pairs(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise ValueError('Duplicate JSON key')
        result[key]=value
    return result


def generate(config, messages, max_tokens=1024):
    config=validate_settings(config['account_id'],config['token'])
    request=urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{config['account_id']}/ai/run/{MODEL}",
        data=json.dumps({'messages':messages,'max_tokens':max_tokens,'temperature':0}).encode(),
        headers={'Authorization':'Bearer '+config['token'],'Content-Type':'application/json','User-Agent':'SDSS/0.1'},method='POST')
    try:
        with urllib.request.urlopen(request,timeout=25) as response:
            content=response.read(1048577)
        if len(content)>1048576:raise AIConnectionError('The AI response was too large. Please retry.')
        data=json.loads(content,object_pairs_hook=unique_json_pairs)
        text=data.get('result',{}).get('response')
        # Cloudflare can return JSON output as an object instead of a JSON string.
        if isinstance(text,dict):text=json.dumps(text)
        if data.get('success') is not True or not isinstance(text,str) or not text.strip():
            raise AIConnectionError('The AI service did not return a usable response. Existing settings were kept.')
        return text
    except urllib.error.HTTPError as error:
        if error.code in (401,403):
            raise AIConnectionError('Connection rejected. Check the Account ID and token Workers AI Read/Edit permissions.') from None
        if error.code==429:
            raise AIConnectionError('Cloudflare usage limit reached. Try again after your allowance resets.') from None
        raise AIConnectionError('Cloudflare could not complete the request. Try again later. Existing settings were kept.') from None
    except (urllib.error.URLError,TimeoutError,OSError):
        raise AIConnectionError('Could not reach Cloudflare. Check your internet connection and try again.') from None
    except (ValueError,AttributeError,TypeError):
        raise AIConnectionError('Cloudflare returned an unexpected response. Please retry.') from None


def verify_and_save(account_id, token, target=SETTINGS_FILE):
    config=validate_settings(account_id,token)
    generate(config,[{'role':'user','content':'Reply with OK only. This is a connection check.'}],max_tokens=8)
    descriptor,temporary=tempfile.mkstemp(prefix='ai.local.',suffix='.tmp',dir=target.parent)
    try:
        with os.fdopen(descriptor,'w',encoding='utf-8') as stream:json.dump(config,stream)
        os.replace(temporary,target)
    finally:
        Path(temporary).unlink(missing_ok=True)
