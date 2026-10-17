# -*- coding: utf-8 -*-
"""
AirLLM OpenAI-Compatible Inference Server for Mave.
Enables running 70B+ frontier models on a single 8GB GPU (NVIDIA RTX 5060)
via layer-wise block streaming inference without VRAM exhaustion.
"""

import sys
import os
import time
import uuid
import argparse
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Mave AirLLM Engine", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model state
_current_model_id = None
_model = None
_tokenizer = None
_is_loading = False

DEFAULT_MODELS = [
    {
        "id": "Qwen/Qwen3-32B",
        "name": "Qwen3 32B (AirLLM Layer Streaming)",
        "size": "32B",
        "vram": "~3.5 GB",
        "description": "32B dense model running layer-wise in 4GB/8GB VRAM."
    },
    {
        "id": "deepseek-ai/DeepSeek-V3",
        "name": "DeepSeek V3 671B (AirLLM Layer Streaming)",
        "size": "671B MoE",
        "vram": "~12 GB",
        "description": "Frontier 671B MoE model running with layer & expert streaming."
    },
    {
        "id": "meta-llama/Meta-Llama-3-70B-Instruct",
        "name": "Llama 3 70B Instruct (AirLLM 4-bit)",
        "size": "70B",
        "vram": "~4 GB",
        "description": "70B instruction-tuned model running on consumer 8GB GPU."
    },
    {
        "id": "Qwen/Qwen2.5-72B-Instruct",
        "name": "Qwen 2.5 72B Instruct (AirLLM 4-bit)",
        "size": "72B",
        "vram": "~4.2 GB",
        "description": "72B powerhouse model running with 4-bit block compression."
    }
]

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "Qwen/Qwen3-32B"
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 512
    top_p: Optional[float] = 0.9
    stream: Optional[bool] = False

class ModelLoadRequest(BaseModel):
    model_id: str
    compression: Optional[str] = "4bit"  # "4bit", "8bit", or None

def get_gpu_info():
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            total_vram = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2)
            return {"available": True, "device": name, "vram_gb": total_vram}
    except Exception:
        pass
    return {"available": False, "device": "CPU", "vram_gb": 0}

@app.get("/health")
def health():
    gpu = get_gpu_info()
    return {
        "status": "ok",
        "engine": "AirLLM",
        "version": "4.0.0",
        "gpu": gpu,
        "loaded_model": _current_model_id,
        "is_loading": _is_loading
    }

@app.get("/v1/models")
def list_models():
    models_list = []
    if _current_model_id:
        models_list.append({
            "id": _current_model_id,
            "object": "model",
            "created": int(time.time()),
            "owned_by": "airllm",
            "active": True
        })
    for m in DEFAULT_MODELS:
        if m["id"] != _current_model_id:
            models_list.append({
                "id": m["id"],
                "object": "model",
                "created": int(time.time()),
                "owned_by": "airllm",
                "active": False,
                "meta": m
            })
    return {"object": "list", "data": models_list}

@app.post("/v1/models/load")
def load_model(req: ModelLoadRequest):
    global _model, _tokenizer, _current_model_id, _is_loading
    if _is_loading:
        raise HTTPException(status_code=409, detail="A model is currently loading.")

    _is_loading = True
    try:
        from airllm import AutoModel
        comp = req.compression if req.compression in ["4bit", "8bit"] else None
        print(f"[AirLLM Server] Loading {req.model_id} with compression={comp}...")
        _model = AutoModel.from_pretrained(req.model_id, compression=comp)
        _tokenizer = _model.tokenizer
        _current_model_id = req.model_id
        _is_loading = False
        return {"ok": True, "message": f"Successfully loaded {req.model_id}", "model": req.model_id}
    except Exception as e:
        _is_loading = False
        print(f"[AirLLM Server] Error loading model: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")

@app.post("/v1/chat/completions")
def chat_completions(req: ChatCompletionRequest):
    global _model, _tokenizer, _current_model_id

    # If no model loaded, or request model is different, try to load requested model
    target_model = req.model or "Qwen/Qwen3-32B"
    if _model is None or _current_model_id != target_model:
        if _model is None:
            # Auto-load on first query
            print(f"[AirLLM Server] Auto-initializing default model: {target_model}...")
            load_model(ModelLoadRequest(model_id=target_model, compression="4bit"))

    if _model is None:
        raise HTTPException(status_code=503, detail="AirLLM model is not ready.")

    try:
        # Build prompt from messages
        prompt_parts = []
        for msg in req.messages:
            role = msg.role.capitalize()
            prompt_parts.append(f"{role}: {msg.content}")
        prompt_parts.append("Assistant:")
        full_prompt = "\n\n".join(prompt_parts)

        # Tokenize with safety bounds
        max_length = min(2048, req.max_tokens * 2 if req.max_tokens else 512)
        input_tokens = _model.tokenizer(
            [full_prompt],
            return_tensors="pt",
            return_attention_mask=False,
            truncation=True,
            max_length=max_length,
            padding=False
        )

        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        input_ids = input_tokens['input_ids'].to(device)

        gen_tokens = min(req.max_tokens or 256, 1024)
        generation_output = _model.generate(
            input_ids,
            max_new_tokens=gen_tokens,
            use_cache=True,
            return_dict_in_generate=True
        )

        output_text = _model.tokenizer.decode(generation_output.sequences[0], skip_special_tokens=True)
        # Strip prompt part if present
        if output_text.startswith(full_prompt):
            output_text = output_text[len(full_prompt):].strip()

        resp_id = f"chatcmpl-airllm-{uuid.uuid4().hex[:12]}"
        return {
            "id": resp_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": _current_model_id,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": output_text
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": len(input_ids[0]),
                "completion_tokens": gen_tokens,
                "total_tokens": len(input_ids[0]) + gen_tokens
            }
        }
    except Exception as e:
        print(f"[AirLLM Server] Inference error: {e}")
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description="AirLLM Inference Server")
    parser.add_argument("--port", type=int, default=8001, help="Port to listen on (default: 8001)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface")
    parser.add_argument("--model", type=str, default=None, help="Initial model to load")
    args = parser.parse_args()

    print(f"======================================================")
    print(f"  Starting AirLLM OpenAI-Compatible Server on {args.host}:{args.port}")
    gpu = get_gpu_info()
    print(f"  Device: {gpu['device']} (VRAM: {gpu['vram_gb']} GB)")
    print(f"======================================================")

    if args.model:
        try:
            load_model(ModelLoadRequest(model_id=args.model, compression="4bit"))
        except Exception as e:
            print(f"[Warning] Failed to pre-load {args.model}: {e}")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")

if __name__ == "__main__":
    main()
