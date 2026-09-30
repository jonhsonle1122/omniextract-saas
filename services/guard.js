class AgentGuardService {
  constructor() {
    this.injectionPatterns = [
      { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, weight: 40, rule: 'PROMPT_OVERRIDE' },
      { pattern: /disregard\s+(all\s+)?(rules|instructions|constraints)/i, weight: 40, rule: 'PROMPT_DISREGARD' },
      { pattern: /(what\s+is|show\s+me|print|reveal)\s+(your|the)?\s*system\s+prompt/i, weight: 35, rule: 'SYSTEM_PROMPT_LEAK' },
      { pattern: /(you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(DAN|unfiltered|jailbroken|evil)/i, weight: 45, rule: 'JAILBREAK_PERSONA' },
      { pattern: /do\s+anything\s+now/i, weight: 35, rule: 'DAN_SIGNATURE' },
      { pattern: /developer\s+mode\s+(enabled|on)/i, weight: 30, rule: 'DEV_MODE_BYPASS' },
      { pattern: /sudo\s+mode|root\s+access|bypass\s+safety/i, weight: 30, rule: 'SAFETY_BYPASS' },
      { pattern: /(BEGIN|START)\s+(NEW\s+)?SYSTEM\s+PROMPT/i, weight: 35, rule: 'DELIMITER_INJECTION' },
      { pattern: /<\|\s*(im_start|im_end|endoftext)\s*\|>/i, weight: 45, rule: 'SPECIAL_TOKEN_INJECTION' },
      { pattern: /translate\s+this\s+base64\s+and\s+execute/i, weight: 30, rule: 'ENCODED_EXECUTION' }
    ];

    this.piiPatterns = [
      { type: 'EMAIL', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g, mask: '[REDACTED_EMAIL]' },
      { type: 'PHONE', regex: /(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})\b/g, mask: '[REDACTED_PHONE]' },
      { type: 'CREDIT_CARD', regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, mask: '[REDACTED_CREDIT_CARD]' },
      { type: 'API_KEY', regex: /\b(?:sk-[a-zA-Z0-9]{20,48}|ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35}|xox[baprs]-[0-9a-zA-Z]{10,48})\b/g, mask: '[REDACTED_API_KEY]' },
      { type: 'BEARER_TOKEN', regex: /Bearer\s+([a-zA-Z0-9\-_]{20,})/g, mask: 'Bearer [REDACTED_TOKEN]' },
      { type: 'IP_ADDRESS', regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, mask: '[REDACTED_IP]' }
    ];
  }

  auditPrompt(promptText) {
    if (!promptText || typeof promptText !== 'string') {
      return {
        safe: true,
        threatScore: 0,
        severity: 'CLEAN',
        findings: [],
        sanitizedPrompt: '',
        piiRedactedCount: 0
      };
    }

    let threatScore = 0;
    const findings = [];

    // Check injection rules
    for (const item of this.injectionPatterns) {
      if (item.pattern.test(promptText)) {
        threatScore += item.weight;
        findings.push({
          rule: item.rule,
          weight: item.weight,
          description: `Detected prompt injection / bypass pattern: ${item.rule}`
        });
      }
    }

    // Determine severity
    threatScore = Math.min(100, threatScore);
    let severity = 'CLEAN';
    if (threatScore >= 70) severity = 'CRITICAL';
    else if (threatScore >= 40) severity = 'HIGH';
    else if (threatScore >= 20) severity = 'MEDIUM';
    else if (threatScore > 0) severity = 'LOW';

    // PII Redaction
    let sanitizedPrompt = promptText;
    let piiRedactedCount = 0;
    const piiSummary = {};

    for (const pii of this.piiPatterns) {
      const matches = sanitizedPrompt.match(pii.regex);
      if (matches) {
        piiRedactedCount += matches.length;
        piiSummary[pii.type] = (piiSummary[pii.type] || 0) + matches.length;
        sanitizedPrompt = sanitizedPrompt.replace(pii.regex, pii.mask);
      }
    }

    return {
      safe: threatScore < 40,
      threatScore,
      severity,
      findings,
      piiSummary,
      piiRedactedCount,
      sanitizedPrompt
    };
  }
}

module.exports = new AgentGuardService();
