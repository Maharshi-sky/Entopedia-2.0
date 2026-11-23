import os
import re
import uuid
from datetime import datetime, UTC

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user_optional
from app.services.ollama_service import ollama_service
from app.utils.logger import logger

router = APIRouter()

OLLAMA_HOST = (os.getenv("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")
PREFERRED_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL") or "qwen2.5vl:7b"
TEXT_CLASSIFIER_MODEL = os.getenv("OLLAMA_MODEL") or "qwen2.5:7b"

SPECIES_PROFILES: dict[str, dict] = {
    "Aedes aegypti": {
        "species": "Aedes aegypti", "common_name": "Yellow Fever & Dengue Mosquito", "pest_type": "Mosquito",
        "confidence": 0.96, "similar_species": ["Aedes albopictus", "Culex quinquefasciatus"],
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
        "confidence": 0.93, "similar_species": ["Anopheles stephensi", "Anopheles funestus"],
        "biology": {
            "order": "Diptera", "family": "Culicidae", "regions": ["Sub-Saharan Africa", "Tropical Asia"],
            "habitats": "Temporary sunlit rain pools, agricultural runoffs",
            "vector_transmission": "Plasmodium falciparum (Malaria)",
            "resistance_notes": "High resistance observed across standard permethrin bednets.",
        },
        "recommended_actives": ["Chlorfenapyr", "Clothianidin", "DDT alternatives", "D-Trans Allethrin"],
    },
    "Culex quinquefasciatus": {
        "species": "Culex quinquefasciatus", "common_name": "Southern House Mosquito", "pest_type": "Mosquito",
        "confidence": 0.94, "similar_species": ["Culex pipiens", "Aedes aegypti"],
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
        "confidence": 0.95, "similar_species": ["Periplaneta americana", "Supella longipalpa"],
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
        "confidence": 0.92, "similar_species": ["Fannia canicularis", "Lucilia sericata"],
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
        "confidence": 0.93, "similar_species": ["Cimex hemipterus"],
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
        "confidence": 0.91, "similar_species": ["Linepithema humile", "Solenopsis invicta"],
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
        "confidence": 0.94, "similar_species": ["Rattus rattus", "Mus musculus"],
        "biology": {
            "order": "Rodentia", "family": "Muridae", "regions": ["Global urban"],
            "habitats": "Sewer systems, underground burrows, basements",
            "vector_transmission": "Leptospirosis, Hantavirus, Plague",
            "resistance_notes": "Warfarin-resistance observed in select port cities.",
        },
        "recommended_actives": ["Bromadiolone", "Brodifacoum", "Zinc Phosphide"],
    },
}


async def _resolve_vision_model() -> dict:
    """Auto-detect an installed vision-capable model (prefers qwen2.5vl, falls back to moondream/llava)."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(f"{OLLAMA_HOST}/api/tags")
        if res.status_code != 200:
            return {"available": False, "model": PREFERRED_VISION_MODEL}

        data = res.json()
        models = [m["name"] for m in data.get("models", [])] if isinstance(data.get("models"), list) else []
        if not models:
            return {"available": False, "model": PREFERRED_VISION_MODEL}

        prefix = PREFERRED_VISION_MODEL.split(":")[0]
        exact = next((m for m in models if m == PREFERRED_VISION_MODEL or m.startswith(f"{prefix}:")), None)
        if exact:
            return {"available": True, "model": exact}

        vision_capable = next((m for m in models if re.search(r"qwen2\.5vl|qwen2-vl|llava|moondream|minicpm|gemma3", m, re.I)), None)
        return {"available": True, "model": vision_capable} if vision_capable else {"available": False, "model": PREFERRED_VISION_MODEL}
    except Exception:  # noqa: BLE001
        return {"available": False, "model": PREFERRED_VISION_MODEL}


@router.post("/identify")
async def identify_pest(body: dict = Body(...), user: AuthUser | None = Depends(get_current_user_optional)):
    try:
        image_base64 = body.get("image_base64")
        photo_url = body.get("photo_url")
        filename = body.get("filename")

        if not image_base64 and not photo_url:
            raise HTTPException(status_code=400, detail="Image data is required")

        vision = await _resolve_vision_model()
        if not vision["available"]:
            raise HTTPException(status_code=503, detail=f'No vision model running at {OLLAMA_HOST}. Run "ollama pull qwen2.5vl:7b" or ensure Ollama is active.')

        raw_image = image_base64 or photo_url
        pure_base64 = re.sub(r"^data:image/\w+;base64,", "", raw_image)

        # Stage 1: Vision model describes the raw visual appearance of the specimen
        vision_prompt = "Describe what is in this photo in 2-3 factual sentences. If there is an insect, bug, or animal, describe its exact shape, body color, number of legs, wings, and any stripes or markings."

        async with httpx.AsyncClient(timeout=90) as client:
            ollama_res = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={"model": vision["model"], "prompt": vision_prompt, "images": [pure_base64], "stream": False, "options": {"temperature": 0.1}},
            )

        if ollama_res.status_code != 200:
            err_text = ollama_res.text
            logger.error(f"Ollama Vision HTTP {ollama_res.status_code}: {err_text}")
            raise HTTPException(status_code=502, detail=f"Ollama Vision failed: {err_text}")

        vision_data = ollama_res.json()
        visual_description = str(vision_data.get("response") or "").strip()
        logger.info(f"[Stage 1 Vision ({vision['model']})]: {visual_description}")

        # Stage 2: text classifier maps the visual description into canonical pest species JSON
        classification = await ollama_service.chat_json(
            model=TEXT_CLASSIFIER_MODEL,
            system="""You are an expert entomology classifier for Entopedia. Given a visual description of an image, map it to ONE exact species from this allowed list:
- "Aedes aegypti" (mosquito with black-and-white striped legs or striped body)
- "Anopheles gambiae" (malaria mosquito resting at a steep angle, spotted wings)
- "Culex quinquefasciatus" (plain brown/tan mosquito without white leg stripes, or generic mosquito/insect)
- "Blattella germanica" (cockroach, roach, oval brown insect with long antennae)
- "Musca domestica" (housefly, fly with two wings and large compound eyes)
- "Cimex lectularius" (bed bug, small flat reddish-brown wingless oval bug)
- "Monomorium pharaonis" (ant, ants, small yellow/reddish-brown segmented insects in a group)
- "Rattus norvegicus" (rat, mouse, rodent)
- "NA" (if there is no insect, bug, pest, or rodent, or if it cannot be identified)

Respond ONLY with JSON: {"is_pest": boolean, "species": "<exact string from list>", "reasoning": "<short reason>"}""",
            prompt=f'Visual description from camera:\n"{visual_description}"',
            temperature=0.1,
        )

        logger.info(f"[Stage 2 Classifier ({TEXT_CLASSIFIER_MODEL})]: {classification}")

        unidentifiable_payload = {
            "is_pest": False, "model_used": f"{vision['model']} + {TEXT_CLASSIFIER_MODEL}", "species": "NA",
            "common_name": "Unable to identify this Specimen", "pest_type": "NA", "confidence": 0,
            "similar_species": [],
            "biology": {"order": "NA", "family": "NA", "regions": ["NA"], "habitats": "NA", "vector_transmission": "NA", "resistance_notes": "NA"},
            "recommended_actives": ["NA"], "related_products": [], "message": "Unable to identify this Specimen",
            "visual_observation": visual_description or "NA",
        }

        species = classification.get("species") if isinstance(classification, dict) else None
        if not classification.get("is_pest") or species not in SPECIES_PROFILES:
            return unidentifiable_payload

        profile = SPECIES_PROFILES[species]
        identification_id = str(uuid.uuid4())

        try:
            await db.execute(
                "INSERT INTO pest_identifications (id, user_id, photo_url, identified_species, confidence, identified_at) VALUES ($1, $2, $3, $4, $5, NOW())",
                [identification_id, user.id if user else None, filename or "uploaded-specimen", profile["species"], profile["confidence"]],
            )
        except Exception as db_err:  # noqa: BLE001
            logger.warning(f"Could not save to pest_identifications table: {db_err}")

        try:
            related_products = await db.query_many(
                "SELECT id, brand, name, active_ingredient, format, price, pack_size, product_link, image_url FROM competitor_products LIMIT 4"
            )
        except Exception:  # noqa: BLE001
            related_products = []

        return {
            "id": identification_id, "is_pest": True, "model_used": f"{vision['model']} + {TEXT_CLASSIFIER_MODEL}",
            "visual_observation": visual_description, "species": profile["species"], "common_name": profile["common_name"],
            "pest_type": profile["pest_type"], "confidence": profile["confidence"], "similar_species": profile["similar_species"],
            "biology": profile["biology"], "recommended_actives": profile["recommended_actives"],
            "related_products": related_products, "identified_at": datetime.now(UTC).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Pest identification error: {error}")
        raise HTTPException(status_code=500, detail=str(error) or "Failed to identify pest specimen")


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


@router.get("/history")
async def pest_history():
    try:
        try:
            history = await db.query_many("SELECT * FROM pest_identifications ORDER BY identified_at DESC LIMIT 20")
        except Exception:  # noqa: BLE001
            history = []
        return {"history": history}
    except Exception as error:  # noqa: BLE001
        logger.error(f"History fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch history")


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
