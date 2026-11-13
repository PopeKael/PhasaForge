# Thai-to-English provider check — 0.3.1

Tested 6 November 2026 using five ThaiReader v42 sentences already included in the local learner database. This compares Azure Translator F0 with the installed Ollama `qwen3:0.6b` Q4_K_M model. It is a small reference check, not a general translation quality score.

| Provider | Cold / warm latency | Result on five references | Memory / setup |
|---|---:|---|---|
| Azure Translator F0, Southeast Asia | 144–263 ms per live request; mean 193 ms in the recorded five-call run | 5/5 matched the reference meaning. “ไปเลย ไม่ต้องรอ” was rendered “Go for it. No need to wait.” | No model installed locally; requires network and F0 key. Local cache hits return immediately. App blocks new hosted requests at 1.9M UTF-16 characters/month. |
| Ollama `qwen3:0.6b` Q4_K_M | 2,492 ms first request including model load; 39–72 ms warm | 1/5 acceptable. Other outputs changed a question into an assertion, echoed prompt text, changed the sentence subject/action, or lost the free-item promotion. | 523 MB model download; `/api/ps` reported 930,401,484 bytes of model VRAM residency while loaded. Already installed; no additional download performed. |

The local model responds faster after loading, but its tested Thai translation quality is too unreliable to recommend as the automatic fallback. Azure F0 is therefore the preferred provider. Ollama remains optional and is labelled in the UI when used. Keep meaning from the offline examples and dictionary separate from machine translation.

## Azure configuration and quota guard

The historical benchmark above used the official Text Translation v3 endpoint `https://api.cognitive.microsofttranslator.com` with `from=th`, `to=en`, and the Southeast Asia region. Starting in 1.0.0, each user supplies the key and resource region; both are stored in Windows Credential Manager for that Windows account. The region header is omitted only when the user leaves it blank for a global Translator resource. Successful results are cached in the local SQLite database. Character usage is reserved before each network call, including ambiguous failures, and counts UTF-16 units conservatively. Cached translations do not make another request.

Microsoft lists 2 million standard-translation characters per month in F0. PhasaForge stops sending uncached Azure requests at 1.9 million per UTC month. The resource remains on F0; PhasaForge does not change tiers or upgrade the subscription.

## Sources

- [Azure Translator REST quickstart](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/quickstart/rest-api)
- [Azure Translator F0 pricing](https://azure.microsoft.com/en-us/pricing/details/translator/)
- [Azure Translator service limits](https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits)
- [Ollama Qwen3 model library](https://ollama.com/library/qwen3) (0.6B Q4_K_M, Apache 2.0)
- ThaiReader v42 examples bundled with PhasaForge; individual source attribution is retained in SQLite.
