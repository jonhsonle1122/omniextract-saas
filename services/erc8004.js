const walletService = require('./wallet');

class Erc8004Service {
  getManifest(hostUrl = 'https://omniextract.agent') {
    const wallet = walletService.getWalletInfo();

    return {
      standard: 'ERC-8004',
      version: '1.0.0',
      type: 'AutonomousAgentCapabilityManifest',
      metadata: {
        name: 'OmniExtract & AgentGuard Sentinel',
        slug: 'omniextract-agent-guard',
        description: 'High-speed, zero-noise web to LLM-ready markdown extraction with real-time prompt injection and PII sanitization.',
        creator: 'AI Agent Commerce Engine',
        version: '1.2.0',
        license: 'MIT',
        homepage: hostUrl,
        documentation: `${hostUrl}/#docs`
      },
      agentIdentity: {
        network: wallet.network,
        chainId: wallet.chainId,
        walletAddress: wallet.address,
        protocol: 'x402-v1'
      },
      monetization: {
        model: 'micropayment-per-request',
        currency: wallet.token.symbol,
        tokenAddress: wallet.token.contract,
        pricePerCall: wallet.pricePerRequestUSDC,
        supportedMethods: ['x402-header-proof', 'api-key-credits', 'vietqr-fiat']
      },
      capabilities: [
        {
          id: 'web-markdown-extract',
          name: 'Web & HTML to Clean Markdown Extractor',
          endpoint: `${hostUrl}/api/v1/extract`,
          method: 'POST',
          description: 'Extracts clean, noise-free Markdown with title, summary, word count, and token estimate from any webpage.',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'optional string',
            'X-Payment-Proof': 'optional hex txHash'
          },
          requestSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Target public URL to crawl & extract' },
              html: { type: 'string', description: 'Direct HTML markup if crawling is done client-side' }
            }
          },
          responseSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['success', 'error'] },
              metadata: { type: 'object' },
              markdown: { type: 'string' }
            }
          }
        },
        {
          id: 'prompt-injection-guard',
          name: 'Prompt Injection Sentinel & PII Masker',
          endpoint: `${hostUrl}/api/v1/guard`,
          method: 'POST',
          description: 'Audits LLM inputs for jailbreaks, prompt overrides, system prompt leak attacks, and redacts PII/tokens.',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'optional string',
            'X-Payment-Proof': 'optional hex txHash'
          },
          requestSchema: {
            type: 'object',
            required: ['prompt'],
            properties: {
              prompt: { type: 'string', description: 'Untrusted user prompt or agent instruction to inspect' }
            }
          },
          responseSchema: {
            type: 'object',
            properties: {
              safe: { type: 'boolean' },
              threatScore: { type: 'number' },
              severity: { type: 'string' },
              findings: { type: 'array' },
              sanitizedPrompt: { type: 'string' }
            }
          }
        }
      ]
    };
  }
}

module.exports = new Erc8004Service();
