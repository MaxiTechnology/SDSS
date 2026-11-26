import json
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import cloudflare_ai
from recommendation import build_context, parse_recommendation


def sample_snapshot():
    return {
        "method": "TOPSIS vector normalization v1",
        "currency": "USD",
        "entries": {
            "a": {"price": "100", "quality": "90"},
            "b": {"price": "120", "quality": "80"},
        },
        "suppliers": [
            {"id": "a", "name": "Confidential Alpha"},
            {"id": "b", "name": "Confidential Beta"},
        ],
        "criteria": [
            {"id": "price", "name": "Price", "unit": "USD", "direction": "cost"},
            {"id": "quality", "name": "Quality", "unit": "points", "direction": "benefit"},
        ],
        "weights": {"price": "60.00", "quality": "40.00"},
        "result": {
            "normalized": {
                "a": {"price": "0.64", "quality": "0.75"},
                "b": {"price": "0.77", "quality": "0.66"},
            },
            "rows": [
                {"id": "a", "name": "Confidential Alpha", "rank": 1, "score": "0.75"},
                {"id": "b", "name": "Confidential Beta", "rank": 2, "score": "0.25"},
            ]
        },
    }


def test_recommendation_context_uses_anonymous_supplier_references():
    context = build_context(
        {"category": "IT"},
        sample_snapshot(),
        [],
    )

    assert "Confidential Alpha" not in str(context)
    assert "Confidential Beta" not in str(context)
    assert context["supplier_aliases"]["a"] == "S1"
    assert context["criterion_aliases"]["quality"] == "C2"


def test_recommendation_context_includes_saved_sensitivity_results():
    context = build_context(
        {"category": "IT"},
        sample_snapshot(),
        [{
            "name": "Cost priority",
            "weights": {"price": "90.00", "quality": "10.00"},
            "notes": "Synthetic scenario",
            "result": {
                "rows": [
                    {"id": "b", "name": "Confidential Beta", "rank": 1, "score": "0.80"},
                    {"id": "a", "name": "Confidential Alpha", "rank": 2, "score": "0.20"},
                ]
            },
        }],
    )

    assert context["sensitivity_scenarios"][0]["highest_rank_references"] == ["S2"]


def test_parse_recommendation_accepts_supplier_and_tie_shapes():
    supplier = parse_recommendation(
        '{"reason_criteria":["C1","C2"]}'
    )
    assert len(supplier.reason_criteria) == 2

    tie = parse_recommendation('{"reason_criteria":[]}')
    assert tie.reason_criteria == []


def test_parse_recommendation_rejects_invalid_or_duplicate_json():
    with pytest.raises(cloudflare_ai.AIConnectionError):
        parse_recommendation("not-json")
    with pytest.raises(cloudflare_ai.AIConnectionError):
        parse_recommendation(
            '{"reason_criteria":["C1"],"reason_criteria":["C2"]}'
        )


def test_fenced_json_is_unwrapped_without_weakening_validation():
    response = {
        "reason_criteria": ["C1", "C2"],
    }
    assert parse_recommendation("```json\n" + json.dumps(response) + "\n```").reason_criteria == ["C1", "C2"]
    assert parse_recommendation("```\r\n" + json.dumps(response) + "\r\n```").reason_criteria == ["C1", "C2"]
    for text in [
        "Explanation\n```json\n" + json.dumps(response) + "\n```",
        "```python\n" + json.dumps(response) + "\n```",
        "```json\n" + json.dumps({**response, "extra": "unexpected"}) + "\n```",
        '```json\n{"recommendation_type":"supplier","recommendation_type":"tie"}\n```',
    ]:
        with pytest.raises(cloudflare_ai.AIConnectionError):
            parse_recommendation(text)


def test_generation_sends_only_anonymous_derived_data_and_restores_names(monkeypatch):
    import recommendation

    snapshot = sample_snapshot()
    snapshot["suppliers"][0]["id"] = "private-supplier-id"
    snapshot["entries"]["private-supplier-id"] = snapshot["entries"].pop("a")
    snapshot["result"]["normalized"]["private-supplier-id"] = snapshot["result"]["normalized"].pop("a")
    snapshot["result"]["rows"][0]["id"] = "private-supplier-id"
    scenario = {
        "name": "Private scenario name",
        "notes": "Private scenario notes",
        "weights": {"price": "90", "quality": "10"},
        "result": {"rows": [{"id": "b", "rank": 1}]},
    }
    monkeypatch.setattr(cloudflare_ai, "settings", lambda: {})

    def generate(config, messages, max_tokens):
        context = json.loads(messages[1]["content"])
        payload = json.dumps(context)
        for secret in ("private-supplier-id", "Confidential Alpha", "Private scenario",
                       "Private category", '"100"', '"120"', '"price"'):
            assert secret not in payload
        assert context["reason_candidates"] == [
            {"reference": "C1", "weight_percent": "60.00"},
            {"reference": "C2", "weight_percent": "40.00"},
        ]
        assert context["sensitivity_scenarios"][0]["highest_rank_references"] == ["S2"]
        return '```json\n' + json.dumps({
            "reason_criteria": ["C1", "C2"],
        }) + '\n```'

    monkeypatch.setattr(cloudflare_ai, "generate", generate)
    result, context = recommendation.generate_recommendation(
        {"category": "Private category"}, snapshot, [scenario]
    )
    assert result.supplier_reference == "S1"
    assert result.key_reasons == [
        "Confidential Alpha has lower Price than Confidential Beta.",
        "Confidential Alpha has higher Quality than Confidential Beta.",
    ]
    assert "Confidential Beta has no advantage" in result.supplier_comparison
    assert context["supplier_aliases"]["private-supplier-id"] == "S1"

    monkeypatch.setattr(cloudflare_ai, "generate", lambda *args, **kwargs: json.dumps({
        "reason_criteria": ["C99"],
    }))
    with pytest.raises(cloudflare_ai.AIConnectionError, match="saved evaluation"):
        recommendation.generate_recommendation({}, snapshot, [])


@pytest.mark.parametrize(
    ("weights", "supplier", "criterion", "advantage", "tradeoff"),
    [
        ({"price": "80", "quality": "20"}, "Confidential Alpha", "C1", "lower Price", "Quality"),
        ({"price": "20", "quality": "80"}, "Confidential Beta", "C2", "higher Quality", "Price"),
    ],
)
def test_explanations_follow_actual_ranking_and_priorities(
    monkeypatch, weights, supplier, criterion, advantage, tradeoff
):
    import recommendation
    import topsis

    snapshot = sample_snapshot()
    snapshot["entries"]["a"]["quality"] = "70"
    snapshot["weights"] = weights
    snapshot["result"] = topsis.calculate(
        snapshot["entries"], snapshot["suppliers"], snapshot["criteria"], weights
    )
    before = deepcopy(snapshot)
    monkeypatch.setattr(cloudflare_ai, "settings", lambda: {})
    monkeypatch.setattr(cloudflare_ai, "generate", lambda *args, **kwargs: json.dumps({
        "reason_criteria": [criterion],
    }))
    result, _ = recommendation.generate_recommendation({}, snapshot, [])
    assert snapshot["result"]["rows"][0]["name"] == supplier
    assert advantage in result.key_reasons[0]
    assert tradeoff in result.supplier_comparison
    assert "greater approved importance" in result.supplier_comparison
    assert "score" not in result.supplier_comparison.lower()
    assert snapshot == before


def test_valid_lower_weight_selection_keeps_highest_priority_without_rejection(monkeypatch):
    import recommendation

    snapshot = sample_snapshot()
    before = deepcopy(snapshot)
    monkeypatch.setattr(cloudflare_ai, "settings", lambda: {})
    monkeypatch.setattr(cloudflare_ai, "generate", lambda *args, **kwargs: json.dumps({
        "reason_criteria": ["C2"],
    }))
    result, _ = recommendation.generate_recommendation({}, snapshot, [])
    assert result.key_reasons == [
        "Confidential Alpha has lower Price than Confidential Beta.",
        "Confidential Alpha has higher Quality than Confidential Beta.",
    ]
    assert snapshot == before


def test_accepts_provider_returning_verified_candidate_objects(monkeypatch):
    import recommendation

    monkeypatch.setattr(cloudflare_ai, "settings", lambda: {})
    monkeypatch.setattr(cloudflare_ai, "generate", lambda *args, **kwargs: json.dumps({
        "reason_criteria": [
            {"reference": "C1", "weight_percent": "60.00"},
            {"reference": "C2", "weight_percent": "40.00"},
        ],
    }))
    result, _ = recommendation.generate_recommendation({}, sample_snapshot(), [])
    assert len(result.key_reasons) == 2
    assert "lower Price" in result.key_reasons[0]
    assert "higher Quality" in result.key_reasons[1]


def test_model_can_select_a_verified_advantage_outside_top_three(monkeypatch):
    import recommendation

    snapshot = sample_snapshot()
    for cid, name, weight in [("delivery", "Delivery", "20"), ("service", "Service", "10")]:
        snapshot["criteria"].append({"id": cid, "name": name, "direction": "benefit"})
        snapshot["entries"]["a"][cid] = "2"
        snapshot["entries"]["b"][cid] = "1"
        snapshot["weights"][cid] = weight
    snapshot["weights"].update(price="40", quality="30")
    monkeypatch.setattr(cloudflare_ai, "settings", lambda: {})

    def generate(config, messages, max_tokens):
        context = json.loads(messages[1]["content"])
        assert [fact["reference"] for fact in context["reason_candidates"]] == ["C1", "C2", "C3", "C4"]
        return '{"reason_criteria":["C4"]}'

    monkeypatch.setattr(cloudflare_ai, "generate", generate)
    result, _ = recommendation.generate_recommendation({}, snapshot, [])
    assert result.key_reasons == [
        "Confidential Alpha has lower Price than Confidential Beta.",
        "Confidential Alpha has higher Service than Confidential Beta.",
    ]


@pytest.mark.parametrize("selection", [
    {"reason_criteria": ["C99"]},
    {"reason_criteria": ["C1", "C1"]},
    {"reason_criteria": []},
    {"reason_criteria": ["C1"], "supplier_reference": "S3"},
    {"reason_criteria": ["C1"], "decision": "Invented claim"},
    {"reason_criteria": ["C1", "C2", "C3", "C4"]},
    {"reason_criteria": [{"reference": "C1", "weight_percent": "40.00"}]},
    {"reason_criteria": [{"reference": "C99", "weight_percent": "60.00"}]},
    {"reason_criteria": [{"reference": "C1", "weight_percent": "NaN"}]},
    {"reason_criteria": [{"reference": "C1", "weight_percent": "60.00", "claim": "Unsupported"}]},
    {"reason_criteria": ["C1", {"reference": "C1", "weight_percent": "60.00"}]},
])
def test_rejects_unsupported_model_selections(monkeypatch, selection):
    import recommendation

    monkeypatch.setattr(cloudflare_ai, "settings", lambda: {})
    monkeypatch.setattr(cloudflare_ai, "generate", lambda *args, **kwargs: json.dumps(selection))
    with pytest.raises(cloudflare_ai.AIConnectionError):
        recommendation.generate_recommendation({}, sample_snapshot(), [])


def test_rejects_competitor_advantage_as_a_reason(monkeypatch):
    import recommendation

    snapshot = sample_snapshot()
    snapshot["entries"]["b"]["quality"] = "95"
    monkeypatch.setattr(cloudflare_ai, "settings", lambda: {})
    monkeypatch.setattr(cloudflare_ai, "generate", lambda *args, **kwargs: json.dumps({
        "reason_criteria": ["C2"],
    }))
    with pytest.raises(cloudflare_ai.AIConnectionError):
        recommendation.generate_recommendation({}, snapshot, [])


def test_recommendation_endpoint_uses_saved_ranking_and_handles_failures(monkeypatch):
    import app as application

    project_id, ranking_id = uuid4(), uuid4()
    snapshot = sample_snapshot()
    original_snapshot = deepcopy(snapshot)
    matrix = {"revision": 1}
    row = {
        "id": ranking_id, "created_at": datetime.now(timezone.utc), "context": "current",
        "matrix_revision": 1, "snapshot": snapshot,
    }

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, query, params):
            self.query = query
            return self

        def fetchone(self):
            if "purchasing_projects" in self.query:
                return {"category": "Synthetic", "currency": "USD"}
            if "project_matrix" in self.query:
                return matrix
            if "ranking_runs" in self.query:
                return row
            raise AssertionError("Unexpected query")

        def fetchall(self):
            assert "sensitivity_scenarios" in self.query
            return []

    monkeypatch.setattr(application.database, "connect", Connection)
    monkeypatch.setattr(application, "require_project", lambda connection, project_id: None)
    monkeypatch.setattr(application, "matrix_context", lambda connection, project_id: (None, None, None, "current"))
    monkeypatch.setattr(cloudflare_ai, "settings", lambda: {})
    response = {
        "reason_criteria": ["C1", "C2"],
    }
    monkeypatch.setattr(cloudflare_ai, "generate", lambda *args, **kwargs: "```json\n" + json.dumps(response) + "\n```")

    client = TestClient(application.app)
    url = f"/api/projects/{project_id}/rankings/recommendation"
    for _ in range(2):
        result = client.post(url)
        assert result.status_code == 200
        data = result.json()
        assert data["ranking_id"] == str(ranking_id)
        assert (data["recommended_supplier"], data["ranking_position"], data["topsis_score"]) == (
            "Confidential Alpha", 1, "0.75"
        )
        assert data["key_reasons"] == [
            "Confidential Alpha has lower Price than Confidential Beta.",
            "Confidential Alpha has higher Quality than Confidential Beta.",
        ]
        assert data["next_best_supplier"] == "Confidential Beta"

    response["supplier_reference"] = "S2"
    assert client.post(url).status_code == 503
    del response["supplier_reference"]

    response.update(reason_criteria=[])
    snapshot["result"]["rows"][1]["rank"] = 1
    result = client.post(url)
    assert result.status_code == 200
    assert result.json()["recommended_supplier"] is None
    response["reason_criteria"] = ["C1"]
    assert client.post(url).status_code == 503
    response["reason_criteria"] = []
    snapshot["result"]["rows"][1]["rank"] = 2
    assert client.post(url).status_code == 503

    response.update(reason_criteria=["C1"])
    def change_matrix_during_generation(*args, **kwargs):
        matrix["revision"] = 2
        return json.dumps(response)
    monkeypatch.setattr(cloudflare_ai, "generate", change_matrix_during_generation)
    assert client.post(url).status_code == 409
    matrix["revision"] = 1

    monkeypatch.setattr(cloudflare_ai, "generate", lambda *args, **kwargs: "not JSON")
    assert client.post(url).status_code == 503

    def fail(*args, **kwargs):
        raise cloudflare_ai.AIConnectionError("Synthetic provider outage.")
    monkeypatch.setattr(cloudflare_ai, "generate", fail)
    assert client.post(url).status_code == 503
    assert snapshot == original_snapshot


@pytest.mark.auth_required
def test_recommendation_requires_authentication():
    from app import app

    response = TestClient(app).post(f"/api/projects/{uuid4()}/rankings/recommendation")
    assert response.status_code == 401
