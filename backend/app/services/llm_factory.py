import os
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv

load_dotenv()

class LLMFactory:
    @staticmethod
    def create_llm(provider: str = None, model_name: str = None):
        provider = provider or os.getenv("LLM_PROVIDER", "openai")
        model_name = model_name or os.getenv("LLM_MODEL_NAME", "gpt-4o")
        
        if provider == "openai":
            return ChatOpenAI(
                model=model_name,
                temperature=0.7,
                streaming=False,
                api_key=os.getenv("OPENAI_API_KEY")
            )
        elif provider == "deepseek":
            # DeepSeek is OpenAI-compatible
            return ChatOpenAI(
                model=model_name,
                temperature=0.7,
                streaming=False,
                api_key=os.getenv("DEEPSEEK_API_KEY"),
                base_url="https://api.deepseek.com"
            )
        elif provider == "modelscope":
            # ModelScope is OpenAI-compatible
            return ChatOpenAI(
                model=model_name,
                temperature=0.7,
                streaming=False,
                api_key=os.getenv("MODELSCOPE_API_KEY"),
                base_url=os.getenv("MODELSCOPE_BASE_URL", "https://api-inference.modelscope.cn/v1")
            )
        elif provider == "anthropic":
            return ChatAnthropic(
                model=model_name,
                temperature=0.7,
                streaming=False,
                api_key=os.getenv("ANTHROPIC_API_KEY")
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")
