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
