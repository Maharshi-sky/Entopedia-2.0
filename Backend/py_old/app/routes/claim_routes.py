import re
from datetime import datetime, UTC

from fastapi import APIRouter, Body, Depends, HTTPException

from app.middleware.auth import get_current_user
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(get_current_user)])

# Starter rule-base compliant with WHO household insecticide testing guidelines
CLAIM_RULES = [
    {
        "code": "SAFETY_ABSOLUTE", "category": "Safety",
        "regex": re.compile(r"\b(100%\s*safe|completely\s*safe|totally\s*safe|harmless|non-toxic|chemical-free|zero\s*risk)\b", re.I),
        "severity": "high_regulatory_flag",
        "reason": "Absolute safety or non-toxic claims are prohibited on chemical pesticide and biocidal formulations.",
        "required_evidence": "Not substantiable on chemical insecticides. Mandatory label warning required.",
        "protocol": "CIB&RC / WHO Label Compliance Protocol",
        "suggestion": 'Reword to: "Safe when used strictly according to label directions".',
    },
    {
        "code": "DISEASE_PREVENTION", "category": "Disease Mitigation",
        "regex": re.compile(r"\b(prevents?\s*dengue|protects?\s*from\s*malaria|cures?\s*malaria|stops?\s*chikungunya)\b", re.I),
        "severity": "high_regulatory_flag",
        "reason": "Household products cannot claim clinical disease prevention; they control the insect vector.",
        "required_evidence": "Clinical epidemiological trial data (unobtainable for standard household formulations).",
        "protocol": "WHO/HTM/NTD/WHOPES/2009.3",
        "suggestion": 'Reword to target vector: "Controls dengue-spreading Aedes mosquitoes".',
    },
    {
        "code": "FAST_KNOCKDOWN", "category": "Knockdown Time",
        "regex": re.compile(r"\b(instant\s*knockdown|kills?\s*in\s*(\d+)\s*min(ute)?s?)\b", re.I),
        "severity": "substantiation_required",
        "reason": "Specific kill or knockdown speed claims require standard chamber test substantiation.",
        "required_evidence": "KT50 / KT90 test data in a standard Peet-Grady or 20m³ chamber.",
        "protocol": "WHO Chamber Knockdown Protocol (WHO/CDS/WHOPES/GCDPP/2005.13)",
        "suggestion": "Ensure KT50 laboratory test report is attached to claim dossier.",
    },
    {
        "code": "EXTENDED_DURATION", "category": "Protection Duration",
        "regex": re.compile(r"\b((\d+)[-\s]*hours?\s*protection|all\s*night\s*protection|continuous\s*protection)\b", re.I),
        "severity": "substantiation_required",
        "reason": "Duration claims require continuous active vaporization release rate substantiation.",
        "required_evidence": "Room evaporation chamber residue and mortality monitoring over the stated duration.",
        "protocol": "WHO Vaporizing Mat and Liquid Vaporizer Protocol Section 4.2",
        "suggestion": "State exact tested room dimensions and operational ventilation conditions.",
    },
    {
        "code": "KILL_RATE_ABSOLUTE", "category": "Efficacy Rate",
        "regex": re.compile(r"\b(100%\s*kill|kills?\s*all\s*mosquitoes|eliminates?\s*every)\b", re.I),
        "severity": "high_regulatory_flag",
        "reason": "100% mortality claims violate consumer protection regulations due to natural resistance variations.",
        "required_evidence": "Bioassay testing across multiple susceptible and resistant field strains.",
        "protocol": "WHO Cone Bioassay & Cylinder Test",
        "suggestion": 'Reword to: "Up to 99% mortality against tested susceptible strains".',
    },
    {
        "code": "SUPERLATIVE_COMPARATIVE", "category": "Comparative Claim",
        "regex": re.compile(r"\b(no\.?\s*1|best\s*in\s*market|better\s*than\s*all|most\s*effective)\b", re.I),
        "severity": "substantiation_required",
        "reason": "Comparative supremacy claims require verified side-by-side head-to-head testing data.",
        "required_evidence": "Blind comparative testing against top market competitor formulations.",
        "protocol": "ASCI Standards for Comparative Advertising",
        "suggestion": "Cite accredited laboratory comparison with specific product formats and dates.",
    },
]


@router.post("/assess")
async def assess_claim(body: dict = Body(...)):
    try:
        text = body.get("text")
        format_ = body.get("format")
        active_id = body.get("active_id")

        if not text or not isinstance(text, str):
            raise HTTPException(status_code=400, detail="Claim text is required")

        cleaned_text = text.strip()
        matches = []

        for rule in CLAIM_RULES:
            match = rule["regex"].search(cleaned_text)
            if match:
                matches.append({
                    "rule_code": rule["code"], "category": rule["category"], "severity": rule["severity"],
                    "matched_text": match.group(0), "reason": rule["reason"],
                    "required_evidence": rule["required_evidence"], "protocol": rule["protocol"],
                    "suggestion": rule["suggestion"],
                })

        overall_risk = "low"
        if any(m["severity"] == "high_regulatory_flag" for m in matches):
            overall_risk = "high_regulatory_flag"
        elif any(m["severity"] == "substantiation_required" for m in matches):
            overall_risk = "substantiation_required"

        return {
            "text": cleaned_text, "risk": overall_risk, "format": format_ or "General",
            "active_id": active_id, "matched_rules_count": len(matches), "matches": matches,
            "assessed_at": datetime.now(UTC).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Claim assessment error: {error}")
        raise HTTPException(status_code=500, detail="Failed to assess claim")


@router.get("/evidence-matrix")
async def evidence_matrix():
    try:
        evidence_list = [
            {
                "id": "clm-01", "claim": "Kills dengue mosquitoes in 5 minutes", "category": "Speed of Action",
                "required_protocol": "WHO Chamber Knockdown KT50 Protocol (2009)",
                "compliance_status": "Substantiation Attached", "verification_state": "Verified",
                "evidence_count": 3, "format": "Aerosol",
            },
            {
                "id": "clm-02", "claim": "Continuous 12-hour protection against night mosquitoes", "category": "Duration of Effect",
                "required_protocol": "WHO Liquid Vaporizer Release Rate Standard (Sec 4.2)",
                "compliance_status": "Pending Review", "verification_state": "Pending Review",
                "evidence_count": 1, "format": "Liquid Vaporizer",
            },
            {
                "id": "clm-03", "claim": "100% safe around toddlers and pets", "category": "Safety Claim",
                "required_protocol": "CIB&RC Label Mandatory Warning Protocol",
                "compliance_status": "Non-Compliant (High Risk)", "verification_state": "Disputed",
                "evidence_count": 0, "format": "Mat",
            },
            {
                "id": "clm-04", "claim": "Effective barrier against resistant Culex strains", "category": "Resistance Management",
                "required_protocol": "WHO Bottle Bioassay (WHO/CDS/CPC/MAL/98.6)",
                "compliance_status": "Substantiation Attached", "verification_state": "Verified",
                "evidence_count": 4, "format": "Aerosol",
            },
        ]
        return {"data": evidence_list, "total": len(evidence_list)}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Evidence matrix error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch evidence matrix")
