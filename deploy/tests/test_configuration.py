import importlib.util
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location('deployment_config',Path(__file__).resolve().parents[2]/'backend/deployment_config.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

@pytest.mark.parametrize('origin',['','http://example.com','https://example.com/','https://example.com/path','https://user:secret@example.com','https://example.com?secret=x'])
def test_rejects_unsafe_or_ambiguous_origins(origin):
    with pytest.raises(RuntimeError):module.validate_environment({'DATABASE_URL':'postgresql://user:secret@example.com/db?sslmode=require','SDSS_ALLOWED_ORIGINS':origin})

def test_no_local_database_fallback():
    with pytest.raises(RuntimeError):module.validate_environment({'SDSS_ALLOWED_ORIGINS':'https://ssdss.example.com'})

def test_valid_separate_https_service():
    module.validate_environment({'DATABASE_URL':'postgresql://user:secret@example.com/db?sslmode=require','SDSS_ALLOWED_ORIGINS':'https://ssdss.example.com'})

def test_database_transport_must_require_tls():
    with pytest.raises(RuntimeError):module.validate_environment({'DATABASE_URL':'postgresql://user:secret@example.com/db?sslmode=disable','SDSS_ALLOWED_ORIGINS':'https://ssdss.example.com'})

def test_render_uses_assigned_address_before_validating_login_origin():
    env={'DATABASE_URL':'postgresql://user:secret@example.com/db?sslmode=require','SDSS_ALLOWED_ORIGINS':'render','RENDER':'true','RENDER_EXTERNAL_URL':'https://ssdss-actual-host.onrender.com'}
    module.resolve_environment(env)
    assert env['SDSS_ALLOWED_ORIGINS']=='https://ssdss-actual-host.onrender.com'
    module.validate_environment(env)

@pytest.mark.parametrize('address',['','http://example.onrender.com','https://other.example.com','https://example.onrender.com/path','https://user:secret@example.onrender.com','https://example.onrender.com:443'])
def test_render_mode_rejects_unexpected_runtime_addresses(address):
    env={'SDSS_ALLOWED_ORIGINS':'render','RENDER':'true','RENDER_EXTERNAL_URL':address}
    with pytest.raises(RuntimeError):module.resolve_environment(env)
    assert env['SDSS_ALLOWED_ORIGINS']=='render'

def test_render_mode_requires_render_runtime():
    with pytest.raises(RuntimeError):module.resolve_environment({'SDSS_ALLOWED_ORIGINS':'render','RENDER_EXTERNAL_URL':'https://example.onrender.com'})

def test_explicit_custom_domain_is_not_replaced_by_render_address():
    env={'SDSS_ALLOWED_ORIGINS':'https://ssdss.example.com','RENDER':'true','RENDER_EXTERNAL_URL':'https://other.onrender.com'}
    module.resolve_environment(env)
    assert env['SDSS_ALLOWED_ORIGINS']=='https://ssdss.example.com'
