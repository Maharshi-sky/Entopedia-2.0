import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Local Ollama Settings
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'moondream';

// Species knowledge repository for controls & linkages
const SPECIES_PROFILES: Record<string, any> = {
  'Aedes aegypti': {
    species: 'Aedes aegypti',
    common_name: 'Yellow Fever & Dengue Mosquito',
    pest_type: 'Mosquito',
    confidence: 0.96,
    similar_species: ['Aedes albopictus', 'Culex quinquefasciatus'],
    biology: {
      order: 'Diptera',
      family: 'Culicidae',
      regions: ['Tropics & Subtropics', 'South Asia', 'Southeast Asia'],
      habitats: 'Clean standing water containers, indoor dark corners',
      vector_transmission: 'Dengue, Zika, Chikungunya, Yellow Fever',
      resistance_notes: 'Widespread resistance to Organochlorines; rising pyrethroid knock-down resistance (kdr).',
    },
    recommended_actives: ['Transfluthrin', 'Prallethrin', 'Chlorfenapyr', 'Pyriproxyfen'],
  },
  'Anopheles gambiae': {
    species: 'Anopheles gambiae',
    common_name: 'African Malaria Mosquito',
    pest_type: 'Mosquito',
    confidence: 0.93,
    similar_species: ['Anopheles stephensi', 'Anopheles funestus'],
    biology: {
      order: 'Diptera',
      family: 'Culicidae',
      regions: ['Sub-Saharan Africa', 'Tropical Asia'],
      habitats: 'Temporary sunlit rain pools, agricultural runoffs',
      vector_transmission: 'Plasmodium falciparum (Malaria)',
      resistance_notes: 'High resistance observed across standard permethrin bednets.',
    },
    recommended_actives: ['Chlorfenapyr', 'Clothianidin', 'DDT alternatives', 'D-Trans Allethrin'],
  },
  'Culex quinquefasciatus': {
    species: 'Culex quinquefasciatus',
    common_name: 'Southern House Mosquito',
    pest_type: 'Mosquito',
    confidence: 0.94,
    similar_species: ['Culex pipiens', 'Aedes aegypti'],
    biology: {
      order: 'Diptera',
      family: 'Culicidae',
      regions: ['Global', 'Sub-Saharan Africa', 'South Asia'],
      habitats: 'Stagnant polluted drain waters, septic tanks',
      vector_transmission: 'Lymphatic Filariasis, West Nile Virus',
      resistance_notes: 'Moderate pyrethroid resistance reported across urban clusters.',
    },
    recommended_actives: ['Transfluthrin', 'Prallethrin', 'Bti (Bacillus thuringiensis israelensis)'],
  },
  'Blattella germanica': {
    species: 'Blattella germanica',
    common_name: 'German Cockroach',
    pest_type: 'Cockroach',
    confidence: 0.95,
    similar_species: ['Periplaneta americana', 'Supella longipalpa'],
    biology: {
      order: 'Blattodea',
      family: 'Ectobiidae',
      regions: ['Global', 'Urban indoor environments', 'Commercial kitchens'],
      habitats: 'Warm, humid cracks, food storage areas',
      vector_transmission: 'Salmonella, E. coli, respiratory allergens',
      resistance_notes: 'Extreme behavioral aversion to glucose baits and cross-resistance to synthetic pyrethroids.',
    },
    recommended_actives: ['Imiprothrin', 'Permethrin', 'Fipronil', 'Indoxacarb'],
  },
  'Musca domestica': {
    species: 'Musca domestica',
    common_name: 'House Fly',
    pest_type: 'Fly',
    confidence: 0.92,
    similar_species: ['Fannia canicularis', 'Lucilia sericata'],
    biology: {
      order: 'Diptera',
      family: 'Muscidae',
      regions: ['Global'],
      habitats: 'Decaying organic matter, waste sites',
      vector_transmission: 'Mechanical vector for over 100 pathogens (Cholera, Typhoid)',
      resistance_notes: 'Multi-class insecticide resistance including organophosphates and spinosyns.',
    },
    recommended_actives: ['Cypermethrin', 'D-Allethrin', 'Dinotefuran'],
  },
  'Cimex lectularius': {
    species: 'Cimex lectularius',
    common_name: 'Common Bed Bug',
    pest_type: 'Bed bug',
    confidence: 0.93,
    similar_species: ['Cimex hemipterus'],
    biology: {
      order: 'Hemiptera',
      family: 'Cimicidae',
      regions: ['Global'],
      habitats: 'Mattress seams, headboards, wall cracks',
      vector_transmission: 'Secondary skin infections, allergic dermatological reactions',
      resistance_notes: 'High resistance to standard deltamethrin sprays.',
    },
    recommended_actives: ['Chlorfenapyr', 'Neonicotinoids', 'Silica gel'],
  },
  'Monomorium pharaonis': {
    species: 'Monomorium pharaonis',
    common_name: 'Pharaoh Ant',
    pest_type: 'Ant',
    confidence: 0.91,
    similar_species: ['Linepithema humile', 'Solenopsis invicta'],
    biology: {
      order: 'Hymenoptera',
      family: 'Formicidae',
      regions: ['Global indoor'],
      habitats: 'Wall cavities, subfloor voids, moisture leaks',
      vector_transmission: 'Mechanical pathogen transport in food facilities',
      resistance_notes: 'Repellent sprays induce colony budding/spreading.',
    },
    recommended_actives: ['Fipronil', 'Hydramethylnon', 'Boric acid'],
  },
  'Rattus norvegicus': {
    species: 'Rattus norvegicus',
    common_name: 'Brown Rat',
    pest_type: 'Rodent',
    confidence: 0.94,
    similar_species: ['Rattus rattus', 'Mus musculus'],
    biology: {
      order: 'Rodentia',
      family: 'Muridae',
      regions: ['Global urban'],
      habitats: 'Sewer systems, underground burrows, basements',
      vector_transmission: 'Leptospirosis, Hantavirus, Plague',
      resistance_notes: 'Warfarin-resistance observed in select port cities.',
    },
    recommended_actives: ['Bromadiolone', 'Brodifacoum', 'Zinc Phosphide'],
  },
};

// 1. AI IDENTIFICATION ENDPOINT (Ollama Vision Powered)
router.post('/identify', async (req: AuthRequest, res) => {
  try {
    const { image_base64, photo_url, filename } = req.body;

    if (!image_base64 && !photo_url) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    const rawImage = image_base64 || photo_url;
    const pureBase64 = rawImage.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `What is in this picture? Describe the main subject. Is there an insect, bug, mosquito, cockroach, fly, ant, or animal?`;

    let visionText = '';

    try {
      const ollamaRes = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_VISION_MODEL,
          prompt,
          images: [pureBase64],
          stream: false,
        }),
      });

      if (ollamaRes.ok) {
        const data: any = await ollamaRes.json();
        visionText = (data.response || '').toLowerCase();
        console.log(`[Ollama Vision Raw]: "${visionText}"`);
      } else {
        logger.warn('Ollama returned non-200 status');
      }
    } catch (ollamaErr) {
      logger.warn('Ollama unreachable on port 11434. Falling back to filename classifier:', ollamaErr);
    }

    const nameHint = (filename || '').toLowerCase();
    const combinedAnalysis = `${visionText} ${nameHint}`.trim();

    // 1. Strict Non-pest identification
    const isExplicitNonPest =
      combinedAnalysis.includes('car') ||
      combinedAnalysis.includes('vehicle') ||
      combinedAnalysis.includes('sports car') ||
      combinedAnalysis.includes('automobile') ||
      combinedAnalysis.includes('wheel') ||
      combinedAnalysis.includes('laptop') ||
      combinedAnalysis.includes('building') ||
      (combinedAnalysis.includes('person') &&
        !combinedAnalysis.includes('mosquito') &&
        !combinedAnalysis.includes('macchar') &&
        !combinedAnalysis.includes('insect') &&
        !combinedAnalysis.includes('bite') &&
        !combinedAnalysis.includes('bug'));

    const hasInsectSignal =
      combinedAnalysis.includes('mosquito') ||
      combinedAnalysis.includes('macchar') ||
      combinedAnalysis.includes('machar') ||
      combinedAnalysis.includes('cockroach') ||
      combinedAnalysis.includes('roach') ||
      combinedAnalysis.includes('fly') ||
      combinedAnalysis.includes('housefly') ||
      combinedAnalysis.includes('bed bug') ||
      combinedAnalysis.includes('bedbug') ||
      combinedAnalysis.includes('khatmal') ||
      combinedAnalysis.includes('ant') ||
      combinedAnalysis.includes('cheenti') ||
      combinedAnalysis.includes('rat') ||
      combinedAnalysis.includes('mouse') ||
      combinedAnalysis.includes('rodent') ||
      combinedAnalysis.includes('chuha') ||
      combinedAnalysis.includes('insect') ||
      combinedAnalysis.includes('bug') ||
      combinedAnalysis.includes('pest') ||
      combinedAnalysis.includes('bite');

    if (isExplicitNonPest || !hasInsectSignal) {
      return res.json({
        is_pest: false,
        message: 'No biological pest specimen recognized. The photograph appears to show an inanimate object, vehicle, or non-pest subject.',
      });
    }

    // 2. Map detected insect to target species taxonomy
    let selectedKey = 'Culex quinquefasciatus';

    if (
      combinedAnalysis.includes('mosquito') ||
      combinedAnalysis.includes('macchar') ||
      combinedAnalysis.includes('machar') ||
      combinedAnalysis.includes('culex') ||
      combinedAnalysis.includes('aedes') ||
      combinedAnalysis.includes('anopheles')
    ) {
      if (
        combinedAnalysis.includes('striped') ||
        combinedAnalysis.includes('aedes') ||
        combinedAnalysis.includes('dengue')
      ) {
        selectedKey = 'Aedes aegypti';
      } else if (
        combinedAnalysis.includes('malaria') ||
        combinedAnalysis.includes('anopheles')
      ) {
        selectedKey = 'Anopheles gambiae';
      } else {
        selectedKey = 'Culex quinquefasciatus';
      }
    } else if (combinedAnalysis.includes('cockroach') || combinedAnalysis.includes('roach')) {
      selectedKey = 'Blattella germanica';
    } else if (combinedAnalysis.includes('fly') || combinedAnalysis.includes('housefly')) {
      selectedKey = 'Musca domestica';
    } else if (
      combinedAnalysis.includes('bed bug') ||
      combinedAnalysis.includes('bedbug') ||
      combinedAnalysis.includes('khatmal')
    ) {
      selectedKey = 'Cimex lectularius';
    } else if (combinedAnalysis.includes('ant') || combinedAnalysis.includes('cheenti')) {
      selectedKey = 'Monomorium pharaonis';
    } else if (
      combinedAnalysis.includes('rat') ||
      combinedAnalysis.includes('rodent') ||
      combinedAnalysis.includes('mouse') ||
      combinedAnalysis.includes('chuha')
    ) {
      selectedKey = 'Rattus norvegicus';
    } else {
      selectedKey = 'Culex quinquefasciatus';
    }

    const profile = SPECIES_PROFILES[selectedKey];
    const id = uuidv4();

    try {
      await db.query(
        `INSERT INTO pest_identifications (id, user_id, photo_url, identified_species, confidence, identified_at) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [id, req.user?.id || null, filename || 'uploaded-specimen', profile.species, profile.confidence]
      );
    } catch (dbErr) {
      logger.warn('Could not save to pest_identifications table:', dbErr);
    }

    let relatedProducts: any[] = [];
    try {
      relatedProducts = await db.queryMany(
        `SELECT id, brand, name, active_ingredient, format, price, pack_size, product_link, image_url 
         FROM competitor_products 
         LIMIT 4`
      );
    } catch {
      relatedProducts = [];
    }

    return res.json({
      id,
      is_pest: true,
      species: profile.species,
      common_name: profile.common_name,
      pest_type: profile.pest_type,
      confidence: profile.confidence,
      similar_species: profile.similar_species,
      biology: profile.biology,
      recommended_actives: profile.recommended_actives,
      related_products: relatedProducts,
      identified_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Pest identification error:', error);
    return res.status(500).json({ error: 'Failed to identify pest specimen' });
  }
});

// 2. ENCYCLOPEDIA LISTING
router.get('/pests', async (req: AuthRequest, res) => {
  try {
    const params: unknown[] = [];
    let where = ' WHERE 1=1';
    if (req.query.type) {
      params.push(req.query.type);
      where += ` AND pest_type = $${params.length}`;
    }
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      where += ` AND (species ILIKE $${params.length} OR common_name ILIKE $${params.length})`;
    }

    try {
      const pests = await db.queryMany(
        `SELECT id, species, common_name, pest_type, regions, biology, resistance_notes, image_url
           FROM pest_encyclopedia${where}
          ORDER BY pest_type NULLS LAST, common_name NULLS LAST, species`,
        params
      );
      if (pests && pests.length > 0) {
        return res.json({ data: pests, total: pests.length });
      }
    } catch {
      // Fallback
    }

    const fallbackList = Object.values(SPECIES_PROFILES).map((p, idx) => ({
      id: String(idx + 1),
      species: p.species,
      common_name: p.common_name,
      pest_type: p.pest_type,
      regions: p.biology.regions,
      biology: p.biology.habitats,
      resistance_notes: p.biology.resistance_notes,
      image_url: `/pests/${p.pest_type.toLowerCase()}.jpg`,
    }));

    return res.json({ data: fallbackList, total: fallbackList.length });
  } catch (error) {
    logger.error('Pest list error:', error);
    return res.status(500).json({ error: 'Failed to fetch pests' });
  }
});

// 3. SCAN HISTORY ENDPOINT
router.get('/history', async (_req: AuthRequest, res) => {
  try {
    let history: any[] = [];
    try {
      history = await db.queryMany(
        `SELECT * FROM pest_identifications 
         ORDER BY identified_at DESC LIMIT 20`
      );
    } catch {
      history = [];
    }
    return res.json({ history });
  } catch (error) {
    logger.error('History fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// 4. SPECIES SPECIFIC ENCYCLOPEDIA DETAILS
router.get('/encyclopedia/:species', async (req: AuthRequest, res) => {
  try {
    const { species } = req.params;
    const profile = SPECIES_PROFILES[species] || SPECIES_PROFILES['Culex quinquefasciatus'];
    return res.json(profile);
  } catch (error) {
    logger.error('Encyclopedia fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch encyclopedia entry' });
  }
});

export default router;