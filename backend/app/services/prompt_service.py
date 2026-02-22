import os
from typing import Dict, Any
from string import Template

class PromptService:
    def __init__(self, prompts_dir: str = "backend/prompts", rules_dir: str = "."):
        self.prompts_dir = prompts_dir
        self.rules_dir = rules_dir

    def load_file(self, filepath: str) -> str:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return ""

    def get_system_prompt(self, game_mode: str, context: Dict[str, Any]) -> str:
        # 1. Load Core Rules (Always present)
        core_rules = self.load_file(os.path.join(self.rules_dir, "system_core_rules.md"))

        # 2. Determine Template based on game_mode
        if game_mode == "prologue":
            template_content = self.load_file(os.path.join(self.prompts_dir, "prologue_prompt.md"))
            # Prologue has its own specific rules embedded or referenced
            prologue_rules = self.load_file(os.path.join(self.rules_dir, "system_prologue_rules.md"))
            
            # If using a template engine, we can substitute. 
            # For now, let's assume we construct the final prompt by concatenating or formatting.
            # The template we created earlier (system_prompt_template.md) is generic.
            # Let's use the specific prologue prompt as the base if mode is prologue.
            
            # Simple construction for Prologue:
            # It already contains the instructions. We just need to ensure Core Rules are attached if needed,
            # but prologue_prompt.md already references strict adherence.
            # Let's use the template approach for better structure.
            
            base_template = self.load_file(os.path.join(self.prompts_dir, "system_prompt_template.md"))
            
            # Fill the template
            prompt = base_template.replace("{{ system_core_rules }}", core_rules)
            prompt = prompt.replace("{{ system_prologue_rules }}", prologue_rules)
            
            # Context filling
            prompt = prompt.replace("{{ character_summary }}", context.get("summary", "New Character"))
            prompt = prompt.replace("{{ status_json }}", str(context.get("status_snapshot", {})))
            prompt = prompt.replace("{{ recent_logs_summary }}", str(context.get("recent_logs", [])))
            prompt = prompt.replace("{{ world_log }}", str(context.get("world_log", [])))
            prompt = prompt.replace("{{ user_input }}", context.get("user_input", ""))
            
            return prompt
            
        else:
            # Weekly mode or others
            # TODO: Implement weekly mode specific prompt loading
            return ""

prompt_service = PromptService()
