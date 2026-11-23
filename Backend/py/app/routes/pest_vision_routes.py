import base64
import binascii
import hashlib
import os
import re
import uuid
from datetime import datetime, UTC

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user, get_current_user_optional
from app.services.activity import log_ai_query
from app.services.ollama_service import ollama_service
from app.utils.logger import logger

router = APIRouter()

OLLAMA_HOST = (os.getenv("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")
PREFERRED_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL") or "qwen2.5vl:7b"
TEXT_CLASSIFIER_MODEL = os.getenv("OLLAMA_MODEL") or "qwen2.5:7b"

SPECIES_PROFILES: dict[str, dict] = {
    "Aedes aegypti": {
        "species": "Aedes aegypti", "common_name": "Yellow Fever & Dengue Mosquito", "pest_type": "Mosquito",
        "similar_species": ["Aedes albopictus", "Culex quinquefasciatus"],
        "biology": {
            "order": "Diptera", "family": "Culicidae",
            "regions": ["Tropics & Subtropics", "South Asia", "Southeast Asia"],
            "habitats": "Clean standing water containers, indoor dark corners",
            "vector_transmission": "Dengue, Zika, Chikungunya, Yellow Fever",
            "resistance_notes": "Widespread resistance to Organochlorines; rising pyrethroid knock-down resistance (kdr).",
        },
        "recommended_actives": ["Transfluthrin", "Prallethrin", "Chlorfenapyr", "Pyriproxyfen"],
    },
    "Anopheles gambiae": {
        "species": "Anopheles gambiae", "common_name": "African Malaria Mosquito", "pest_type": "Mosquito",
        "similar_species": ["Anopheles stephensi", "Anopheles funestus"],
        "biology": {
            "order": "Diptera", "family": "Culicidae", "regions": ["Sub-Saharan Africa", "Tropical Asia"],
            "habitats": "Temporary sunlit rain pools, agricultural runoffs",
            "vector_transmission": "Plasmodium falciparum (Malaria)",
            "resistance_notes": "High resistance observed across standard permethrin bednets.",
        },
        "recommended_actives": ["Chlorfenapyr", "Clothianidin", "Pirimiphos-methyl", "D-Trans Allethrin"],
    },
    "Culex quinquefasciatus": {
        "species": "Culex quinquefasciatus", "common_name": "Southern House Mosquito", "pest_type": "Mosquito",
        "similar_species": ["Culex pipiens", "Aedes aegypti"],
        "biology": {
            "order": "Diptera", "family": "Culicidae", "regions": ["Global", "Sub-Saharan Africa", "South Asia"],
            "habitats": "Stagnant polluted drain waters, septic tanks",
            "vector_transmission": "Lymphatic Filariasis, West Nile Virus",
            "resistance_notes": "Moderate pyrethroid resistance reported across urban clusters.",
        },
        "recommended_actives": ["Transfluthrin", "Prallethrin", "Bti (Bacillus thuringiensis israelensis)"],
    },
    "Blattella germanica": {
        "species": "Blattella germanica", "common_name": "German Cockroach", "pest_type": "Cockroach",
        "similar_species": ["Periplaneta americana", "Supella longipalpa"],
        "biology": {
            "order": "Blattodea", "family": "Ectobiidae", "regions": ["Global", "Urban indoor environments", "Commercial kitchens"],
            "habitats": "Warm, humid cracks, food storage areas",
            "vector_transmission": "Salmonella, E. coli, respiratory allergens",
            "resistance_notes": "Extreme behavioral aversion to glucose baits and cross-resistance to synthetic pyrethroids.",
        },
        "recommended_actives": ["Imiprothrin", "Permethrin", "Fipronil", "Indoxacarb"],
    },
    "Musca domestica": {
        "species": "Musca domestica", "common_name": "House Fly", "pest_type": "Fly",
        "similar_species": ["Fannia canicularis", "Lucilia sericata"],
        "biology": {
            "order": "Diptera", "family": "Muscidae", "regions": ["Global"],
            "habitats": "Decaying organic matter, waste sites",
            "vector_transmission": "Mechanical vector for over 100 pathogens (Cholera, Typhoid)",
            "resistance_notes": "Multi-class insecticide resistance including organophosphates and spinosyns.",
        },
        "recommended_actives": ["Cypermethrin", "D-Allethrin", "Dinotefuran"],
    },
    "Cimex lectularius": {
        "species": "Cimex lectularius", "common_name": "Common Bed Bug", "pest_type": "Bed bug",
        "similar_species": ["Cimex hemipterus"],
        "biology": {
            "order": "Hemiptera", "family": "Cimicidae", "regions": ["Global"],
            "habitats": "Mattress seams, headboards, wall cracks",
            "vector_transmission": "Secondary skin infections, allergic dermatological reactions",
            "resistance_notes": "High resistance to standard deltamethrin sprays.",
        },
        "recommended_actives": ["Chlorfenapyr", "Neonicotinoids", "Silica gel"],
    },
    "Monomorium pharaonis": {
        "species": "Monomorium pharaonis", "common_name": "Pharaoh Ant", "pest_type": "Ant",
        "similar_species": ["Linepithema humile", "Solenopsis invicta"],
        "biology": {
            "order": "Hymenoptera", "family": "Formicidae", "regions": ["Global indoor"],
            "habitats": "Wall cavities, subfloor voids, moisture leaks",
            "vector_transmission": "Mechanical pathogen transport in food facilities",
            "resistance_notes": "Repellent sprays induce colony budding/spreading.",
        },
        "recommended_actives": ["Fipronil", "Hydramethylnon", "Boric acid"],
    },
    "Rattus norvegicus": {
        "species": "Rattus norvegicus", "common_name": "Brown Rat", "pest_type": "Rodent",
        "similar_species": ["Rattus rattus", "Mus musculus"],
        "biology": {
            "order": "Rodentia", "family": "Muridae", "regions": ["Global urban"],
            "habitats": "Sewer systems, underground burrows, basements",
            "vector_transmission": "Leptospirosis, Hantavirus, Plague",
            "resistance_notes": "Warfarin-resistance observed in select port cities.",
        },
        "recommended_actives": ["Bromadiolone", "Brodifacoum", "Zinc Phosphide"],
    },
    "Aedes albopictus": {
        "species": "Aedes albopictus", "common_name": "Asian Tiger Mosquito", "pest_type": "Mosquito",
        "similar_species": ["Aedes aegypti", "Culex quinquefasciatus"],
        "biology": {
            "order": "Diptera", "family": "Culicidae", "regions": ["South & Southeast Asia", "Europe", "Americas"],
            "habitats": "Tree holes, discarded tyres, outdoor water containers, shaded vegetation",
            "vector_transmission": "Dengue, Chikungunya, Zika",
            "resistance_notes": "Emerging pyrethroid resistance in parts of Asia; day-biting outdoors limits indoor-only control.",
        },
        "recommended_actives": ["Transfluthrin", "Prallethrin", "Pyriproxyfen", "Bti (Bacillus thuringiensis israelensis)"],
    },
    "Periplaneta americana": {
        "species": "Periplaneta americana", "common_name": "American Cockroach", "pest_type": "Cockroach",
        "similar_species": ["Blattella germanica", "Periplaneta australasiae"],
        "biology": {
            "order": "Blattodea", "family": "Blattidae", "regions": ["Global", "Warm climates", "Urban sewers"],
            "habitats": "Sewers, drains, basements, warm damp service ducts",
            "vector_transmission": "Mechanical carrier of Salmonella, E. coli and allergens",
            "resistance_notes": "Reduced susceptibility to some pyrethroids and organophosphates in urban populations.",
        },
        "recommended_actives": ["Fipronil", "Imidacloprid", "Indoxacarb", "Cypermethrin"],
    },
}


# What the model is told to look for in each species (it sees these with the photo).
SPECIES_CUES = {
    "Aedes aegypti": "small dark mosquito, white bands on legs, white lyre-shaped mark on thorax",
    "Aedes albopictus": "small black mosquito, white bands on legs, ONE white stripe down the middle of the thorax",
    "Anopheles gambiae": "mosquito resting at a steep angle to the surface, dark spots on wings, long palps",
    "Culex quinquefasciatus": "plain brown or tan mosquito, no white leg bands, rests parallel to surface",
    "Blattella germanica": "small light-brown cockroach (about 1.5 cm) with two dark stripes on the shield behind the head",
    "Periplaneta americana": "large reddish-brown cockroach (3-4 cm), pale yellow band around the shield behind the head",
    "Musca domestica": "grey fly, four dark stripes on thorax, two wings, large red compound eyes",
    "Cimex lectularius": "small flat oval reddish-brown wingless bug, apple-seed sized",
    "Monomorium pharaonis": "tiny yellow to light-brown ant (about 2 mm), often many together",
    "Rattus norvegicus": "brown-grey rat, blunt muzzle, small ears, thick tail shorter than the body",
}

# Look first, then decide: the fields are answered in this order (subject and features before the species),
# so the species follows from what is actually visible instead of features being filled in to fit it.
VISION_SYSTEM = """You are an entomologist identifying household and public-health pests from ONE photo.
Answer in this order:
1. subject: what the photo shows, in one short sentence, in your own words.
2. visible_features: only features you can actually see in THIS photo (colour, size cues, markings, wings, legs,
   posture), in your own words. Do not list a feature you cannot see; do not copy the reference notes below.
3. is_pest: true only if a pest animal (insect, arachnid or rodent) is clearly visible. Machines, objects, plants,
   people, food, text or scenery with no such animal -> false.
4. species: the best match from the reference list, "other" if it is clearly a pest not on the list, or "none".
5. other_name: when species is "other", what it most likely is (common name); otherwise null.
6. confidence: your honest probability (0 to 1) that the species is right. Rules:
   - The species' key feature (for example the thorax marking that separates Aedes aegypti from Aedes albopictus,
     or the pronotum pattern that separates the cockroaches) must be visible for a confidence above 0.7.
   - Blurry, distant, partial or ambiguous photos get 0.5 or less.
   - If your features above contradict the reference note of the species you chose, lower the confidence.
7. alternatives: up to 2 other species from the list it could also be, each with a confidence.

Reference notes (what each species looks like):
{cues}
Reply with JSON only."""

VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "subject": {"type": "string"},
        "visible_features": {"type": "array", "items": {"type": "string"}},
        "is_pest": {"type": "boolean"},
        "species": {"type": "string"},
        "other_name": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
        "alternatives": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"species": {"type": "string"}, "confidence": {"type": "number"}},
                "required": ["species", "confidence"],
            },
        },
    },
    "required": ["subject", "visible_features", "is_pest", "species", "confidence", "alternatives"],
}

HIGH_CONFIDENCE = 0.75  # at or above: identified
MIN_CONFIDENCE = 0.45  # below: not identified (too unsure to name a species)
MAX_IMAGE_BASE64 = 12_000_000  # ~9 MB picture; the browser sends ~640 px JPEGs well under this


async def _resolve_vision_model() -> dict:
    """The vision model to use: OLLAMA_VISION_MODEL if installed, else another installed vision model."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(f"{OLLAMA_HOST}/api/tags")
        if res.status_code != 200:
            return {"available": False, "model": PREFERRED_VISION_MODEL, "reason": f"Ollama answered {res.status_code}"}
        data = res.json()
        models = [m["name"] for m in data.get("models", [])] if isinstance(data.get("models"), list) else []
        prefix = PREFERRED_VISION_MODEL.split(":")[0]
        exact = next((m for m in models if m == PREFERRED_VISION_MODEL or m.startswith(f"{prefix}:")), None)
        if exact:
            return {"available": True, "model": exact}
        vision_capable = next(
            (m for m in models if re.search(r"qwen2\.5vl|qwen2-vl|llava|gemma3|minicpm|moondream", m, re.I)), None
        )
        if vision_capable:
            return {"available": True, "model": vision_capable}
        return {
            "available": False, "model": PREFERRED_VISION_MODEL,
            "reason": f'no vision model is installed (run "ollama pull {PREFERRED_VISION_MODEL}")',
        }
    except Exception:  # noqa: BLE001
        return {"available": False, "model": PREFERRED_VISION_MODEL, "reason": f"Ollama is not reachable at {OLLAMA_HOST}"}


def _confidence(value) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if number > 1:  # some models answer in percent
        number /= 100
    return round(max(0.0, min(0.99, number)), 2)


def _level(confidence: float) -> str:
    return "high" if confidence >= HIGH_CONFIDENCE else "medium" if confidence >= MIN_CONFIDENCE else "low"


# Bump when the prompt, schema or thresholds change: earlier answers are then not reused for the same photo.
PROMPT_VERSION = 2
THUMBNAIL_RE = re.compile(r"^data:image/jpeg;base64,[A-Za-z0-9+/=]+$")
MAX_THUMBNAIL = 80_000  # characters; the page sends ~160 px JPEGs of a few KB


async def _run_model(pure_base64: str, vision: dict) -> tuple[dict, str]:
    """Asks the vision model about the photo. Returns the answer for the page (without an id) and its outcome:
    identified | unlisted | unsure | no_pest."""
    cues = "\n".join(f'- "{name}": {cue}' for name, cue in SPECIES_CUES.items())
    try:
        reply = await ollama_service.chat_json(
            prompt="Identify the pest in this photo.",
            system=VISION_SYSTEM.format(cues=cues),
            model=vision["model"], images=[pure_base64], schema=VISION_SCHEMA,
            temperature=0.1, timeout_ms=240_000,
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="The vision model took too long. Try a smaller, clearer photo.")
    except Exception as error:  # noqa: BLE001
        logger.error(f"Pest identification error ({vision['model']}): {error!r}")
        raise HTTPException(status_code=502, detail="The vision model could not read this photo. Try another photo.")

    reply = reply if isinstance(reply, dict) else {}
    subject = str(reply.get("subject") or "").strip()
    features = [str(f) for f in (reply.get("visible_features") or []) if str(f).strip()][:6]
    species = str(reply.get("species") or "none").strip()
    confidence = _confidence(reply.get("confidence"))
    level = _level(confidence)
    alternatives = [
        {
            "species": a["species"], "common_name": SPECIES_PROFILES[a["species"]]["common_name"],
            "confidence": _confidence(a.get("confidence")),
        }
        for a in (reply.get("alternatives") or [])
        if isinstance(a, dict) and a.get("species") in SPECIES_PROFILES and a.get("species") != species
    ][:2]
    is_pest = bool(reply.get("is_pest")) and species != "none"
    in_library = is_pest and species in SPECIES_PROFILES
    identified = in_library and confidence >= MIN_CONFIDENCE
    unlisted = is_pest and species == "other"

    base = {
        "model_used": vision["model"], "visual_observation": subject or "NA", "visible_features": features,
        "confidence": confidence, "confidence_level": level, "alternatives": alternatives,
    }
    if identified:
        profile = SPECIES_PROFILES[species]
        try:
            related_products = await db.query_many(
                "SELECT id, brand, name, active_ingredient, format, price, pack_size, product_link, image_url FROM competitor_products LIMIT 4"
            )
        except Exception:  # noqa: BLE001
            related_products = []
        return {
            **base, "is_pest": True, "in_library": True, "needs_review": level != "high",
            "species": profile["species"], "common_name": profile["common_name"], "pest_type": profile["pest_type"],
            "similar_species": profile["similar_species"], "biology": profile["biology"],
            "recommended_actives": profile["recommended_actives"], "related_products": related_products,
        }, "identified"
    if unlisted:
        other = str(reply.get("other_name") or "an unlisted pest").strip()[:80]
        return {
            **base, "is_pest": True, "in_library": False, "needs_review": True,
            "species": None, "common_name": other, "pest_type": None,
            "message": f"This looks like {other}, which isn't in the Entopedia pest library yet, so there is no profile or control advice for it.",
        }, "unlisted"
    if is_pest:  # a listed species, but too unsure to name it
        message = "A pest seems to be in the photo, but the model isn't sure enough to name the species. Try a closer, sharper photo."
        outcome = "unsure"
    else:
        message = "No pest was found in this photo."
        outcome = "no_pest"
    return {
        **base, "is_pest": False, "in_library": False, "needs_review": False,
        "species": None, "common_name": None, "message": message,
    }, outcome


@router.post("/identify")
async def identify_pest(body: dict = Body(...), user: AuthUser | None = Depends(get_current_user_optional)):
    """
    Identifies the pest in a photo and adds it to the user's history.

    The photo is recognised by the SHA-256 of its bytes, never by its file name: if this exact picture was
    already identified with the current model and prompt, that answer is reused at once (`cached`), unless
    `force` asks for a fresh run. Two different photos that share a name always get their own answers.
    """
    raw_image = body.get("image_base64")
    filename = str(body.get("filename") or "uploaded specimen")[:255]
    force = body.get("force") is True
    if not isinstance(raw_image, str) or not raw_image:
        raise HTTPException(status_code=400, detail="Attach a photo to identify")
    pure_base64 = re.sub(r"^data:image/[\w.+-]+;base64,", "", raw_image)
    if len(pure_base64) > MAX_IMAGE_BASE64:
        raise HTTPException(status_code=413, detail="The photo is too large; use one under about 9 MB")
    try:
        image_bytes = base64.b64decode(pure_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="The photo couldn't be read")
    fingerprint = hashlib.sha256(image_bytes).hexdigest()
    thumbnail = body.get("thumbnail")
    thumbnail = thumbnail if isinstance(thumbnail, str) and len(thumbnail) <= MAX_THUMBNAIL and THUMBNAIL_RE.match(thumbnail) else None

    vision = await _resolve_vision_model()
    if not vision["available"]:
        raise HTTPException(status_code=503, detail=f"Pest identification is unavailable: {vision['reason']}.")

    earlier = None
    if not force:
        earlier = await db.query_one(
            """SELECT result, outcome, identified_at FROM pest_identifications
                WHERE image_sha256 = $1 AND model = $2 AND prompt_version = $3 AND result IS NOT NULL
                ORDER BY identified_at ASC LIMIT 1""",
            [fingerprint, vision["model"], PROMPT_VERSION],
        )
    if earlier:
        result, outcome = dict(earlier["result"]), earlier["outcome"]
        cached = {"cached": True, "first_identified_at": earlier["identified_at"].isoformat()}
    else:
        result, outcome = await _run_model(pure_base64, vision)
        cached = {"cached": False, "first_identified_at": None}

    identification_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    result = {**result, "id": identification_id, "identified_at": now.isoformat(), **cached}
    label = result.get("species") or result.get("common_name") or outcome
    await log_ai_query(
        user.id if user else None, ["pest-vision"], f"[Pest Vision · Identify] {filename}",
        f"{label} ({round(result['confidence'] * 100)}%){' — reused earlier answer for the same photo' if cached['cached'] else ''}"
        f" — {str(result.get('visual_observation') or '')[:400]}",
        confidence=result["confidence_level"],
    )
    try:
        stored = {k: v for k, v in result.items() if k not in ("id", "identified_at", "cached", "first_identified_at")}
        await db.execute(
            """INSERT INTO pest_identifications
                 (id, user_id, photo_url, identified_species, confidence, identified_at,
                  image_sha256, thumbnail, result, model, prompt_version, outcome)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)""",
            [identification_id, user.id if user else None, filename, str(label)[:255], result["confidence"], now,
             fingerprint, thumbnail, stored, vision["model"], PROMPT_VERSION, outcome],
        )
    except Exception as db_err:  # noqa: BLE001
        logger.warning(f"Could not save to pest_identifications table: {db_err}")
    return result


@router.get("/pests")
async def list_pests(type: str | None = None, q: str | None = None):
    try:
        params: list = []
        where = " WHERE 1=1"
        if type:
            params.append(type)
            where += f" AND pest_type = ${len(params)}"
        if q:
            params.append(f"%{q}%")
            where += f" AND (species ILIKE ${len(params)} OR common_name ILIKE ${len(params)})"

        try:
            pests = await db.query_many(
                f"""SELECT id, species, common_name, pest_type, regions, biology, resistance_notes, image_url
                      FROM pest_encyclopedia{where}
                     ORDER BY pest_type NULLS LAST, common_name NULLS LAST, species""",
                params,
            )
            if pests:
                return {"data": pests, "total": len(pests)}
        except Exception:  # noqa: BLE001
            pass  # Fallback to in-memory species profiles

        fallback_list = [
            {
                "id": str(idx + 1), "species": p["species"], "common_name": p["common_name"], "pest_type": p["pest_type"],
                "regions": p["biology"]["regions"], "biology": p["biology"]["habitats"],
                "resistance_notes": p["biology"]["resistance_notes"], "image_url": f"/pests/{p['pest_type'].lower()}.jpg",
            }
            for idx, p in enumerate(SPECIES_PROFILES.values())
        ]
        return {"data": fallback_list, "total": len(fallback_list)}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Pest list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch pests")


def _history_row(r: dict) -> dict:
    """One history entry for the list. Rows from before full results were stored fall back to the profile."""
    result = r.get("result") or {}
    profile = SPECIES_PROFILES.get(r.get("identified_species") or "")
    confidence = float(r["confidence"] or 0)
    return {
        "id": str(r["id"]),
        "filename": r.get("photo_url"),
        "thumbnail": r.get("thumbnail"),
        "outcome": r.get("outcome") or "identified",
        "species": result.get("species") if result else (profile["species"] if profile else None),
        "common_name": result.get("common_name") if result else (profile["common_name"] if profile else r.get("identified_species")),
        "pest_type": result.get("pest_type") if result else (profile["pest_type"] if profile else None),
        "confidence": confidence,
        "confidence_level": result.get("confidence_level") or _level(confidence),
        "identified_at": r["identified_at"],
        "user_name": r.get("user_name"),
    }


@router.get("/history")
async def pest_history(limit: int = 60, everyone: bool = False, user: AuthUser = Depends(get_current_user)):
    """The user's own identifications, newest first. Admins can pass everyone=true to see all users'."""
    limit = max(1, min(limit, 200))
    show_all = everyone and user.role == "admin"
    rows = await db.query_many(
        f"""SELECT p.id, p.photo_url, p.thumbnail, p.outcome, p.identified_species, p.confidence, p.identified_at,
                   p.result, u.name AS user_name
              FROM pest_identifications p LEFT JOIN users u ON u.id = p.user_id
             {"" if show_all else "WHERE p.user_id::text = $2"}
             ORDER BY p.identified_at DESC
             LIMIT $1""",
        [limit] if show_all else [limit, user.id],
    )
    return {"data": [_history_row(r) for r in rows]}


async def _own_identification(identification_id: str, user: AuthUser) -> dict:
    row = await db.query_one(
        """SELECT p.*, u.name AS user_name FROM pest_identifications p LEFT JOIN users u ON u.id = p.user_id
            WHERE p.id::text = $1""",
        [identification_id],
    )
    if not row or (user.role != "admin" and str(row["user_id"]) != user.id):
        raise HTTPException(status_code=404, detail="Identification not found")
    return row


@router.get("/history/{identification_id}")
async def pest_history_entry(identification_id: str, user: AuthUser = Depends(get_current_user)):
    """One identification with its full answer, as the page shows a fresh one."""
    row = await _own_identification(identification_id, user)
    result = row.get("result")
    if not result:  # saved before full results were stored: rebuild what the profile knows
        profile = SPECIES_PROFILES.get(row["identified_species"] or "")
        confidence = float(row["confidence"] or 0)
        result = {
            "is_pest": bool(profile), "in_library": bool(profile), "needs_review": False,
            "confidence": confidence, "confidence_level": _level(confidence), "alternatives": [], "visible_features": [],
            "visual_observation": "Saved before the model's observations were stored.", "model_used": None,
            **({"species": profile["species"], "common_name": profile["common_name"], "pest_type": profile["pest_type"],
                "similar_species": profile["similar_species"], "biology": profile["biology"],
                "recommended_actives": profile["recommended_actives"]} if profile else
               {"species": None, "common_name": row["identified_species"], "message": "No details were stored for this identification."}),
        }
    return {
        **result, "id": str(row["id"]), "identified_at": row["identified_at"].isoformat(),
        "filename": row["photo_url"], "thumbnail": row.get("thumbnail"), "cached": False,
    }


@router.delete("/history/{identification_id}")
async def delete_pest_history(identification_id: str, user: AuthUser = Depends(get_current_user)):
    await _own_identification(identification_id, user)
    await db.execute("DELETE FROM pest_identifications WHERE id::text = $1", [identification_id])
    return {"deleted": identification_id}


@router.get("/encyclopedia/{species}")
async def encyclopedia_entry(species: str):
    try:
        profile = SPECIES_PROFILES.get(species)
        if not profile:
            return {
                "species": "NA", "common_name": "Unable to identify this Specimen", "pest_type": "NA", "confidence": 0,
                "similar_species": [],
                "biology": {"order": "NA", "family": "NA", "regions": ["NA"], "habitats": "NA", "vector_transmission": "NA", "resistance_notes": "NA"},
                "recommended_actives": ["NA"],
            }
        return profile
    except Exception as error:  # noqa: BLE001
        logger.error(f"Encyclopedia fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch encyclopedia entry")
