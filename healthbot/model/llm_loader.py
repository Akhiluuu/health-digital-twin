"""
llm_loader.py — Qwen2.5-14B-Instruct GGUF singleton for Health AI v3.

Model: Qwen2.5-14B-Instruct-Q5_K_M (split GGUF, 3 shards)
Download: https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF

Chat template (Qwen2.5 Instruct):
    <|im_start|>system\n{system}<|im_end|>
    <|im_start|>user\n{user}<|im_end|>
    <|im_start|>assistant\n
"""

from threading import Lock

from health_ai.config.settings import (
    LLM_MODEL_PATH,
    LLM_CONTEXT_LENGTH,
    LLM_N_THREADS,
    LLM_N_THREADS_BATCH,
    LLM_N_BATCH,
    LLM_N_GPU_LAYERS,
    LLM_TEMPERATURE,
    LLM_TOP_P,
    LLM_REPEAT_PENALTY,
)
from health_ai.core.logger import get_logger
from health_ai.core.exceptions import ModelNotFoundError, ModelLoadError, GenerationError

log = get_logger(__name__)

_STOP_TOKENS = ["<|im_end|>", "<|endoftext|>", "<|im_start|>"]


def _build_prompt(system_prompt: str, user_prompt: str) -> str:
    return (
        f"<|im_start|>system\n{system_prompt.strip()}<|im_end|>\n"
        f"<|im_start|>user\n{user_prompt.strip()}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )


def _clean(text: str) -> str:
    for t in _STOP_TOKENS + ["</s>", "<|end|>"]:
        text = text.replace(t, "")
    return text.strip()


class LLMEngine:
    """
    Singleton LLM wrapper. Blocking generation only — no streaming.

    generate() is designed to be called from a thread pool executor
    (see server.py) so it never blocks the async event loop.
    """

    _instance = None
    _creation_lock = Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._creation_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._loaded = False
                    cls._instance._gen_lock = Lock()
        return cls._instance

    def _ensure_loaded(self):
        if self._loaded:
            return

        if not LLM_MODEL_PATH.exists():
            raise ModelNotFoundError(
                f"Model shard 1 not found: {LLM_MODEL_PATH}\n"
                "Need all 3 shards in model/:\n"
                "  qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf\n"
                "  qwen2.5-14b-instruct-q5_k_m-00002-of-00003.gguf\n"
                "  qwen2.5-14b-instruct-q5_k_m-00003-of-00003.gguf\n"
                "Download: https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF"
            )

        model_dir = LLM_MODEL_PATH.parent
        for shard in ["00002-of-00003", "00003-of-00003"]:
            p = model_dir / f"qwen2.5-14b-instruct-q5_k_m-{shard}.gguf"
            if not p.exists():
                raise ModelNotFoundError(f"Missing shard: {p.name}")

        log.info(f"Loading LLM: {LLM_MODEL_PATH.name} …")
        log.info(f"n_ctx={LLM_CONTEXT_LENGTH} n_threads={LLM_N_THREADS} "
                 f"n_threads_batch={LLM_N_THREADS_BATCH} n_batch={LLM_N_BATCH} "
                 f"n_gpu_layers={LLM_N_GPU_LAYERS}")

        try:
            from llama_cpp import Llama
            self._llm = Llama(
                model_path=str(LLM_MODEL_PATH),
                n_ctx=LLM_CONTEXT_LENGTH,
                n_threads=LLM_N_THREADS,
                n_threads_batch=LLM_N_THREADS_BATCH,
                n_batch=LLM_N_BATCH,
                n_gpu_layers=LLM_N_GPU_LAYERS,
                verbose=False,
            )
            self._loaded = True
            log.info("✅ LLM ready.")
        except Exception as e:
            raise ModelLoadError(f"Failed to load LLM: {e}") from e

    def generate(self, system_prompt: str, user_prompt: str, max_tokens: int = 300) -> str:
        """
        Blocking generation. Returns the full response string.

        Always call this from a thread pool, not directly from an async handler:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, lambda: llm.generate(...))
        """
        self._ensure_loaded()
        prompt = _build_prompt(system_prompt, user_prompt)

        try:
            with self._gen_lock:
                out = self._llm(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=LLM_TEMPERATURE,
                    top_p=LLM_TOP_P,
                    repeat_penalty=LLM_REPEAT_PENALTY,
                    stop=_STOP_TOKENS,
                    echo=False,
                )
            return _clean(out["choices"][0]["text"])
        except Exception as e:
            raise GenerationError(f"Generation failed: {e}") from e
