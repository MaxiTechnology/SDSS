"""Legacy business-logic suites use an explicit test dependency, never a runtime bypass."""
import pytest
import auth
from app import app

@pytest.fixture(autouse=True)
def authenticated_business_test(request):
    if request.node.get_closest_marker('auth_required'):
        yield
        return
    async def test_identity():
        token=auth._actor.set({'id':None,'username':'api-test','display_name':'Test Administrator','role':'administrator','must_change':False})
        try:yield
        finally:auth._actor.reset(token)
    previous=app.dependency_overrides.get(auth.authorize)
    app.dependency_overrides[auth.authorize]=test_identity
    yield
    if previous is None:app.dependency_overrides.pop(auth.authorize,None)
    else:app.dependency_overrides[auth.authorize]=previous
