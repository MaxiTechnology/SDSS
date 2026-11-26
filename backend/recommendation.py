"""AI selection of verified ranking evidence, with private supplier references."""

import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, ConfigDict, Field

import cloudflare_ai


class CandidateSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reference: str
    weight_percent: str


class RecommendationSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reason_criteria: list[str | CandidateSelection] = Field(max_length=3)


@dataclass(frozen=True)
class SupplierRecommendation:
    recommendation_type: str
    supplier_reference: str | None
    key_reasons: list[str]
    supplier_comparison: str
    decision: str


def parse_recommendation(text):
    try:
        # Cloudflare may wrap an otherwise valid JSON object in one code fence.
        text = text.strip()
        fenced = re.fullmatch(r"```(?:json)?[ \t]*\r?\n(.*?)\r?\n```", text, re.DOTALL | re.IGNORECASE)
        if fenced:
            text = fenced.group(1)
        return RecommendationSelection.model_validate(
            json.loads(text, object_pairs_hook=cloudflare_ai.unique_json_pairs)
        )
    except (ValueError, TypeError, AttributeError):
        raise cloudflare_ai.AIConnectionError(
            "The AI returned an invalid recommendation. The TOPSIS ranking is unchanged."
        ) from None


def build_context(project, snapshot, sensitivity_scenarios):
    """Prepare anonymized, derived data; retain the ID maps locally only."""
    suppliers = snapshot["suppliers"]
    aliases = {supplier["id"]: f"S{index}" for index, supplier in enumerate(suppliers, start=1)}
    criterion_aliases = {
        criterion["id"]: f"C{index}"
        for index, criterion in enumerate(snapshot["criteria"], start=1)
    }
    scenario_context = [
        {
            "weights": {criterion_aliases[cid]: weight for cid, weight in scenario["weights"].items()},
            "highest_rank_references": [
                aliases[row["id"]] for row in scenario["result"]["rows"] if row["rank"] == 1
            ],
        }
        for scenario in sensitivity_scenarios
    ]
    return {
        "supplier_aliases": aliases,
        "criterion_aliases": criterion_aliases,
        "sensitivity_scenarios": scenario_context,
    }


def comparison_facts(snapshot, context):
    """Compare the leading supplier with the next-ranked eligible supplier."""
    rows = snapshot["result"]["rows"]
    leaders = [row for row in rows if row["rank"] == 1]
    if len(leaders) != 1 or len(rows) < 2:
        return [], []
    leader = leaders[0]
    competitor = next(row for row in rows if row["id"] != leader["id"])
    advantages, tradeoffs = [], []
    for criterion in snapshot["criteria"]:
        cid = criterion["id"]
        weight = Decimal(str(snapshot["weights"][cid]))
        if weight <= 0:
            continue
        leader_value = Decimal(str(snapshot["entries"][leader["id"]][cid]))
        competitor_value = Decimal(str(snapshot["entries"][competitor["id"]][cid]))
        if leader_value == competitor_value:
            continue
        better = leader_value > competitor_value if criterion["direction"] == "benefit" else leader_value < competitor_value
        fact = {
            "reference": context["criterion_aliases"][cid],
            "criterion": criterion,
            "weight": weight,
        }
        (advantages if better else tradeoffs).append(fact)
    advantages.sort(key=lambda fact: -fact["weight"])
    tradeoffs.sort(key=lambda fact: -fact["weight"])
    return advantages, tradeoffs


def generate_recommendation(project, snapshot, sensitivity_scenarios):
    context = build_context(project, snapshot, sensitivity_scenarios)
    advantages, tradeoffs = comparison_facts(snapshot, context)
    provider_context = {
        "reason_candidates": [
            {"reference": fact["reference"], "weight_percent": str(fact["weight"])}
            for fact in advantages
        ],
        "sensitivity_scenarios": context["sensitivity_scenarios"],
    }
    instructions = """Select relevant evidence for a completed supplier ranking.
Each candidate is a verified advantage over the next-ranked supplier. Use the approved
weights to consider importance. Return ONLY JSON with one key: "reason_criteria",
an array of up to three distinct candidate items. Each item must be a complete candidate
object with its reference and weight_percent unchanged. Select at least one when candidates
are available, or an empty array when none are available. Do not add any other fields."""
    text = cloudflare_ai.generate(
        cloudflare_ai.settings(),
        [
            {"role": "system", "content": instructions},
            {"role": "user", "content": json.dumps(provider_context)},
        ],
        max_tokens=500,
    )
    selection = parse_recommendation(text)
    rows = snapshot["result"]["rows"]
    leaders = [row for row in rows if row["rank"] == 1]
    is_tie = len(leaders) > 1
    expected_reference = None if is_tie else context["supplier_aliases"][leaders[0]["id"]]
    candidates = {fact["reference"]: fact["weight"] for fact in advantages}
    selected_references = []
    incorrect_weight = False
    for choice in selection.reason_criteria:
        if isinstance(choice, str):
            reference = choice
        else:
            reference = choice.reference
            try:
                weight = Decimal(choice.weight_percent)
                if not weight.is_finite() or weight != candidates.get(reference):
                    incorrect_weight = True
            except InvalidOperation:
                incorrect_weight = True
        selected_references.append(reference)
    if (
        incorrect_weight
        or len(set(selected_references)) != len(selected_references)
        or any(reference not in candidates for reference in selected_references)
        or (bool(candidates) != bool(selected_references))
    ):
        raise cloudflare_ai.AIConnectionError(
            "The AI response did not match the saved evaluation. The TOPSIS ranking is unchanged."
        )

    if is_tie:
        return SupplierRecommendation(
            "tie", None,
            ["The leading suppliers share the highest ranking."],
            "Review the leading suppliers against the approved criteria before selecting one.",
            "Consider the tied suppliers and record the reason for the final choice.",
        ), context

    leader, competitor = leaders[0], next(row for row in rows if row["id"] != leaders[0]["id"])
    selected_reference_set = set(selected_references)
    if advantages and not any(
        fact["reference"] in selected_reference_set and fact["weight"] == advantages[0]["weight"]
        for fact in advantages
    ):
        selected_reference_set.add(advantages[0]["reference"])
    selected = [fact for fact in advantages if fact["reference"] in selected_reference_set][:3]
    names = [fact["criterion"]["name"] for fact in selected]
    reasons = [
        f"{leader['name']} has {'higher' if fact['criterion']['direction'] == 'benefit' else 'lower'} "
        f"{fact['criterion']['name']} than {competitor['name']}."
        for fact in selected
    ]
    if not reasons:
        reasons = ["No advantage over the next-ranked supplier was identified in the weighted criteria."]
    if selected:
        comparison = f"{leader['name']} performs better on {', '.join(names)}."
    else:
        comparison = f"No weighted criterion advantage over {competitor['name']} was identified."
    if tradeoffs:
        comparison += f" {competitor['name']} performs better on {tradeoffs[0]['criterion']['name']}."
        if selected:
            if selected[0]["weight"] > tradeoffs[0]["weight"]:
                comparison += f" {names[0]} has greater approved importance."
            elif selected[0]["weight"] < tradeoffs[0]["weight"]:
                comparison += f" {tradeoffs[0]['criterion']['name']} has greater approved importance."
            else:
                comparison += " These criteria have equal approved importance."
    else:
        comparison += f" {competitor['name']} has no advantage on the weighted criteria."
    decision = (
        f"Consider {leader['name']} for selection based on its stronger performance on {names[0]}."
        if names else f"Review {leader['name']} against the approved criteria before making a decision."
    )
    return SupplierRecommendation("supplier", expected_reference, reasons, comparison, decision), context
