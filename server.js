require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const walletService = require('./services/wallet');
const extractorService = require('./services/extractor');
const guardService = require('./services/guard');
const erc8004Service = require('./services/erc8004');
const paymentService = require('./services/payment');
const x402Middleware = require('./middleware/x402');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// 1. Health check & system diagnostics
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    aiModel: 'Gemini 3.8 Flash (Active Engine)',
    service: 'OmniExtract Micro-SaaS',
    version: '1.2.0'
  });
});

// 2. ERC-8004 Agent Discovery Manifest
const handleManifest = (req, res) => {
  const hostUrl = `${req.protocol}://${req.get('host')}`;
  const manifest = erc8004Service.getManifest(hostUrl);
  res.json(manifest);
};
app.get('/.well-known/erc-8004.json', handleManifest);
app.get('/api/agent-manifest', handleManifest);

// 3. Web3 Wallet & Revenue Metrics
app.get('/api/wallet', (req, res) => {
  const walletInfo = walletService.getWalletInfo();
  res.json({
    status: 'success',
    data: walletInfo
  });
});

// 4. API Core: Web to LLM Markdown Extractor (Guarded by x402 Micropayments)
app.post('/api/v1/extract', x402Middleware(), async (req, res) => {
  try {
    const { url, html } = req.body;

    if (!url && !html) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required field: please provide "url" or "html".'
      });
    }

    let result;
    if (url) {
      result = await extractorService.extractFromUrl(url);
    } else {
      result = extractorService.extractFromHtml(html, 'direct-html-input');
    }

    res.json({
      status: 'success',
      data: result,
      billed: req.apiKeyInfo ? { key: 'API_KEY_USED', remaining: req.apiKeyInfo.remainingCredits } : req.agentPayment
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// 5. API Core: Prompt Injection & PII Sentinel (Guarded by x402 Micropayments)
app.post('/api/v1/guard', x402Middleware(), (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required field "prompt".'
      });
    }

    const audit = guardService.auditPrompt(prompt);

    res.json({
      status: 'success',
      data: audit,
      billed: req.apiKeyInfo ? { key: 'API_KEY_USED', remaining: req.apiKeyInfo.remainingCredits } : req.agentPayment
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// 6. Payment Gateway: Create Checkout Session (Base USDC / VietQR)
app.post('/api/checkout/session', async (req, res) => {
  try {
    const { planId = 'starter', method = 'usdc' } = req.body;
    const checkout = await paymentService.generateCheckoutData(planId, method);
    res.json({
      status: 'success',
      data: checkout
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// 7. Payment Gateway: Confirm / Complete Payment & Generate API Key
app.post('/api/checkout/verify', async (req, res) => {
  try {
    const { orderId, planId, method, txProof } = req.body;
    const result = await paymentService.completeCheckout(orderId, planId, method, txProof);
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// 8. Withdrawal / Profit Settlement (Protected with Admin Master Key)
app.post('/api/wallet/withdraw', (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
    const expectedKey = process.env.ADMIN_KEY || 'omni_admin_2026';

    if (adminKey !== expectedKey) {
      return res.status(403).json({
        status: 'error',
        error: 'Forbidden: Valid Admin Master Key required to withdraw funds.'
      });
    }

    const { targetAddress, amountUSDC } = req.body;
    if (!targetAddress || !amountUSDC) {
      return res.status(400).json({
        status: 'error',
        error: 'Target address and amountUSDC are required.'
      });
    }

    const tx = walletService.recordWithdrawal(targetAddress, parseFloat(amountUSDC));
    res.json({
      status: 'success',
      message: `Withdrawal of ${amountUSDC} USDC to ${targetAddress} completed.`,
      transaction: tx
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      error: error.message
    });
  }
});

// Admin Portal Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback to index.html for SPA routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[OmniExtract] Micro-SaaS Server listening on port ${PORT}`);
    console.log(`[OmniExtract] Base Wallet Address: ${process.env.AGENT_WALLET_ADDRESS}`);
    console.log(`[OmniExtract] ERC-8004 Registry Manifest: http://localhost:${PORT}/.well-known/erc-8004.json`);
  });
}

module.exports = app;
