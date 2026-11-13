// File: Entopedia 2.0 Backend/src/routes/claim.routes.ts

import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authMiddleware);

interface RuleMatch {
  rule_code: string;
  category: string;
  severity: 'low' | 'substantiation_required' | 'high_regulatory_flag';
  matched_text: string;
  reason: string;
  required_evidence: string;
  protocol: string;
  suggestion: string;
}

// Starter rule-base compliant with WHO household insecticide testing guidelines
const CLAIM_RULES = [
  {
    code: 'SAFETY_ABSOLUTE',
    category: 'Safety',
    regex: /\b(100%\s*safe|completely\s*safe|totally\s*safe|harmless|non-toxic|chemical-free|zero\s*risk)\b/i,
    severity: 'high_regulatory_flag' as const,
    reason: 'Absolute safety or non-toxic claims are prohibited on chemical pesticide and biocidal formulations.',
    required_evidence: 'Not substantiable on chemical insecticides. Mandatory label warning required.',
    protocol: 'CIB&RC / WHO Label Compliance Protocol',
    suggestion: 'Reword to: "Safe when used strictly according to label directions".',
  },
  {
    code: 'DISEASE_PREVENTION',
    category: 'Disease Mitigation',
    regex: /\b(prevents?\s*dengue|protects?\s*from\s*malaria|cures?\s*malaria|stops?\s*chikungunya)\b/i,
    severity: 'high_regulatory_flag' as const,
    reason: 'Household products cannot claim clinical disease prevention; they control the insect vector.',
    required_evidence: 'Clinical epidemiological trial data (unobtainable for standard household formulations).',
    protocol: 'WHO/HTM/NTD/WHOPES/2009.3',
    suggestion: 'Reword to target vector: "Controls dengue-spreading Aedes mosquitoes".',
  },
  {
    code: 'FAST_KNOCKDOWN',
    category: 'Knockdown Time',
    regex: /\b(instant\s*knockdown|kills?\s*in\s*(\d+)\s*min(ute)?s?)\b/i,
    severity: 'substantiation_required' as const,
    reason: 'Specific kill or knockdown speed claims require standard chamber test substantiation.',
    required_evidence: 'KT50 / KT90 test data in a standard Peet-Grady or 20m³ chamber.',
    protocol: 'WHO Chamber Knockdown Protocol (WHO/CDS/WHOPES/GCDPP/2005.13)',
    suggestion: 'Ensure KT50 laboratory test report is attached to claim dossier.',
  },
  {
    code: 'EXTENDED_DURATION',
    category: 'Protection Duration',
    regex: /\b((\d+)[-\s]*hours?\s*protection|all\s*night\s*protection|continuous\s*protection)\b/i,
    severity: 'substantiation_required' as const,
    reason: 'Duration claims require continuous active vaporization release rate substantiation.',
    required_evidence: 'Room evaporation chamber residue and mortality monitoring over the stated duration.',
    protocol: 'WHO Vaporizing Mat and Liquid Vaporizer Protocol Section 4.2',
    suggestion: 'State exact tested room dimensions and operational ventilation conditions.',
  },
  {
    code: 'KILL_RATE_ABSOLUTE',
    category: 'Efficacy Rate',
    regex: /\b(100%\s*kill|kills?\s*all\s*mosquitoes|eliminates?\s*every)\b/i,
    severity: 'high_regulatory_flag' as const,
    reason: '100% mortality claims violate consumer protection regulations due to natural resistance variations.',
    required_evidence: 'Bioassay testing across multiple susceptible and resistant field strains.',
    protocol: 'WHO Cone Bioassay & Cylinder Test',
    suggestion: 'Reword to: "Up to 99% mortality against tested susceptible strains".',
  },
  {
    code: 'SUPERLATIVE_COMPARATIVE',
    category: 'Comparative Claim',
    regex: /\b(no\.?\s*1|best\s*in\s*market|better\s*than\s*all|most\s*effective)\b/i,
    severity: 'substantiation_required' as const,
    reason: 'Comparative supremacy claims require verified side-by-side head-to-head testing data.',
    required_evidence: 'Blind comparative testing against top market competitor formulations.',
    protocol: 'ASCI Standards for Comparative Advertising',
    suggestion: 'Cite accredited laboratory comparison with specific product formats and dates.',
  },
];

// CL-01 & CL-02: Rule engine endpoint (Sub-100ms response)
router.post('/assess', async (req: AuthRequest, res) => {
  try {
    const { text, format, active_id } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Claim text is required' });
    }

    const cleanedText = text.trim();
    const matches: RuleMatch[] = [];

    // Run rules
    for (const rule of CLAIM_RULES) {
      const match = cleanedText.match(rule.regex);
      if (match) {
        matches.push({
          rule_code: rule.code,
          category: rule.category,
          severity: rule.severity,
          matched_text: match[0],
          reason: rule.reason,
          required_evidence: rule.required_evidence,
          protocol: rule.protocol,
          suggestion: rule.suggestion,
        });
      }
    }

    // Determine highest severity
    let overallRisk: 'low' | 'substantiation_required' | 'high_regulatory_flag' = 'low';
    if (matches.some((m) => m.severity === 'high_regulatory_flag')) {
      overallRisk = 'high_regulatory_flag';
    } else if (matches.some((m) => m.severity === 'substantiation_required')) {
      overallRisk = 'substantiation_required';
    }

    return res.json({
      text: cleanedText,
      risk: overallRisk,
      format: format || 'General',
      active_id: active_id || null,
      matched_rules_count: matches.length,
      matches,
      assessed_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Claim assessment error:', error);
    return res.status(500).json({ error: 'Failed to assess claim' });
  }
});

// CL-04: Claims Evidence Matrix with Protocols & Verification States
router.get('/evidence-matrix', async (_req: AuthRequest, res) => {
  try {
    const evidenceList = [
      {
        id: 'clm-01',
        claim: 'Kills dengue mosquitoes in 5 minutes',
        category: 'Speed of Action',
        required_protocol: 'WHO Chamber Knockdown KT50 Protocol (2009)',
        compliance_status: 'Substantiation Attached',
        verification_state: 'Verified',
        evidence_count: 3,
        format: 'Aerosol',
      },
      {
        id: 'clm-02',
        claim: 'Continuous 12-hour protection against night mosquitoes',
        category: 'Duration of Effect',
        required_protocol: 'WHO Liquid Vaporizer Release Rate Standard (Sec 4.2)',
        compliance_status: 'Pending Review',
        verification_state: 'Pending Review',
        evidence_count: 1,
        format: 'Liquid Vaporizer',
      },
      {
        id: 'clm-03',
        claim: '100% safe around toddlers and pets',
        category: 'Safety Claim',
        required_protocol: 'CIB&RC Label Mandatory Warning Protocol',
        compliance_status: 'Non-Compliant (High Risk)',
        verification_state: 'Disputed',
        evidence_count: 0,
        format: 'Mat',
      },
      {
        id: 'clm-04',
        claim: 'Effective barrier against resistant Culex strains',
        category: 'Resistance Management',
        required_protocol: 'WHO Bottle Bioassay (WHO/CDS/CPC/MAL/98.6)',
        compliance_status: 'Substantiation Attached',
        verification_state: 'Verified',
        evidence_count: 4,
        format: 'Aerosol',
      },
    ];

    res.json({
      data: evidenceList,
      total: evidenceList.length,
    });
  } catch (error) {
    logger.error('Evidence matrix error:', error);
    res.status(500).json({ error: 'Failed to fetch evidence matrix' });
  }
});

export default router;