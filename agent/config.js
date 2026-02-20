// thoth config — constants and environment
// thoth: you can change MODEL and MAX_TOKENS but don't remove SAFETY_MODEL

const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const OWNER = "konkeNFT";
const REPO = "Thoth";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_KEY = process.env.GROQ_KEY;
const MOONSHOT_KEY = process.env.MOONSHOT_API_KEY;
const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
const GH_TOKEN = process.env.GH_TOKEN;
const MODEL = "z-ai/glm-5";
const MAX_TOKENS = 16384;
const MAX_STEPS = 40; // max inference calls per cycle (prevents runaway)
const PROJECT_NUMBER = 7;
const SAFETY_MODEL = "openai/gpt-oss-safeguard-20b";

// wallet — thoth's onchain identity
const DAIMON_WALLET_KEY = process.env.DAIMON_WALLET_KEY;
// SAFE_ADDRESS not set yet - thoth doesn't have a Safe
const BASE_RPC = process.env.BASE_RPC || "https://mainnet.base.org";

module.exports = {
  REPO_ROOT, OWNER, REPO, OPENROUTER_KEY, GROQ_KEY, MOONSHOT_KEY, CEREBRAS_KEY, GH_TOKEN,
  MODEL, MAX_TOKENS, MAX_STEPS, PROJECT_NUMBER, SAFETY_MODEL,
  DAIMON_WALLET_KEY, BASE_RPC,
};
